/**
 * UserSession Model
 * 
 * Stores server-side session data for BFF cookie authentication.
 * Supports single active session per user (invalidates old sessions on new login).
 * 
 * Storage: Prefer Redis for production (fast, auto-expiry).
 * Fallback: MongoDB with TTL index (works but slower).
 */

const mongoose = require('mongoose');
const { emitSessionInvalidation } = require('../utils/socketManager');

const UserSessionSchema = new mongoose.Schema({
  // Session identifier (stored in sid cookie)
  session_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // User reference
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Auth0 ID for cross-reference
  auth0_id: {
    type: String,
    required: true,
    index: true
  },

  // User email for quick lookup
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },

  // Tenant ID for session
  tenant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true
  },

  // CSRF token for this session
  csrf_token: {
    type: String,
    required: true
  },

  // Session metadata
  user_agent: {
    type: String,
    trim: true
  },

  ip_address: {
    type: String,
    trim: true
  },

  // Enhanced device tracking
  device_fingerprint: {
    type: String,
    index: true
  },

  device_info: {
    browser: String,
    browser_version: String,
    os: String,
    os_version: String,
    device_type: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet', 'unknown'],
      default: 'unknown'
    }
  },

  // Geolocation (optional, from IP)
  geolocation: {
    country: String,
    country_code: String,
    city: String,
    region: String,
    timezone: String
  },

  // User-friendly session name
  session_name: {
    type: String,
    default: 'Unknown Device'
  },

  // Session timestamps
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  },

  last_activity: {
    type: Date,
    default: Date.now,
    index: true
  },

  expires_at: {
    type: Date,
    required: true,
    index: true
  },

  // Session status
  is_active: {
    type: Boolean,
    default: true,
    index: true
  },

  // Invalidation tracking
  invalidated_at: {
    type: Date
  },

  invalidation_reason: {
    type: String,
    enum: ['logout', 'new_session', 'expired', 'revoked', 'security', 'logout_all', 'revoked_by_user'],
    trim: true
  }
}, {
  timestamps: false
});

// Compound indexes
UserSessionSchema.index({ user_id: 1, is_active: 1 });
UserSessionSchema.index({ session_id: 1, is_active: 1 });
UserSessionSchema.index({ auth0_id: 1, is_active: 1 });
UserSessionSchema.index({ user_id: 1, device_fingerprint: 1 });

// TTL index - automatically delete expired sessions after 24 hours of expiry
UserSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 86400 });

/**
 * Instance method: Check if session is valid
 */
UserSessionSchema.methods.isValid = function() {
  return this.is_active && this.expires_at > new Date();
};

/**
 * Instance method: Invalidate this session
 */
UserSessionSchema.methods.invalidate = function(reason = 'logout') {
  this.is_active = false;
  this.invalidated_at = new Date();
  this.invalidation_reason = reason;
  return this.save();
};

/**
 * Instance method: Update last activity
 */
UserSessionSchema.methods.touch = function() {
  this.last_activity = new Date();
  return this.save();
};

/**
 * Static method: Invalidate all sessions for a user
 * Used for single-session enforcement and security events
 */
UserSessionSchema.statics.invalidateAllForUser = async function(userId, reason = 'new_session') {
  const result = await this.updateMany(
    { user_id: userId, is_active: true },
    {
      $set: {
        is_active: false,
        invalidated_at: new Date(),
        invalidation_reason: reason
      }
    }
  );
  
  // Emit Socket.IO event to notify all user sessions about invalidation
  if (result.modifiedCount > 0) {
    try {
      emitSessionInvalidation(userId.toString(), null, reason);
    } catch (socketError) {
      console.warn('⚠️  Failed to emit session invalidation via Socket.IO:', socketError.message);
      // Don't fail if Socket.IO fails
    }
  }
  
  return result;
};

/**
 * Static method: Find active session by session_id
 */
UserSessionSchema.statics.findActiveSession = function(sessionId) {
  return this.findOne({
    session_id: sessionId,
    is_active: true,
    expires_at: { $gt: new Date() }
  }).populate('user_id', 'email full_name role_ids tenant_id is_active');
};

/**
 * Static method: Create new session (with single-session enforcement)
 */
UserSessionSchema.statics.createSession = async function(userData, options = {}) {
  const {
    sessionId,
    csrfToken,
    user_agent,
    ip_address,
    device_info,
    device_fingerprint,
    geolocation,
    session_name,
    ttlSeconds = 86400, // 24 hours default
    singleSession = true,
    userAgent,
    ipAddress
  } = options;

  const now = new Date();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  // STRICT SINGLE SESSION: Invalidate all previous active sessions for this user
  if (singleSession) {

    const filter = {
      user_id: userData.user_id,
      is_active: true,
      ...(device_fingerprint ? { device_fingerprint: { $ne: device_fingerprint } } : {})
    };


       const result = await this.updateMany(filter, {
      $set: {
        is_active: false,
        invalidated_at: new Date(),
        invalidation_reason: 'new_session_different_device'
      }
    });


    // Log invalidations for monitoring/debugging
    if (result.modifiedCount > 0) {
      console.log(`🔒 Invalidated ${result.modifiedCount} previous session(s) for user: ${userData.email}`);
      
      // Emit Socket.IO event to notify all user sessions about invalidation
      try {
        emitSessionInvalidation(userData.user_id.toString(), sessionId, 'new_session');
      } catch (socketError) {
        console.warn('⚠️  Failed to emit session invalidation via Socket.IO:', socketError.message);
        // Don't fail session creation if Socket.IO fails
      }
    }
  }

  // Try to find recently rotated session (edge case if concurrent calls)
  let existing = null;
  if (device_fingerprint) {
    existing = await this.findOne({
      user_id: userData.user_id,
      device_fingerprint,
      is_active: true,
      expires_at: { $gt: now }
    }).sort({ created_at: -1 });
  } else {
    existing = await this.findOne({
      user_id: userData.user_id,
      is_active: true,
      expires_at: { $gt: now },
      user_agent: user_agent || userAgent,
      ip_address: ip_address || ipAddress,
      created_at: { $gt: new Date(Date.now() - 30 * 1000) }
    }).sort({ created_at: -1 });
  }

  if (existing) {
    // Edge case: re-use if prior update flush/rotation hasn't completed yet
    existing.session_id = sessionId;
    existing.csrf_token = csrfToken;
    existing.user_agent = user_agent || userAgent || existing.user_agent;
    existing.ip_address = ip_address || ipAddress || existing.ip_address;
    existing.device_info = device_info || existing.device_info || {};
    existing.device_fingerprint = device_fingerprint || existing.device_fingerprint || null;
    existing.geolocation = geolocation || existing.geolocation || null;
    existing.session_name = session_name || existing.session_name || 'Unknown Device';
    existing.last_activity = now;
    existing.expires_at = expiresAt;
    existing.is_active = true;
    await existing.save();
    return existing;
  }

  const session = new this({
    session_id: sessionId,
    user_id: userData.user_id,
    auth0_id: userData.auth0_id,
    email: userData.email,
    tenant_id: userData.tenant_id,
    csrf_token: csrfToken,
    user_agent: user_agent || userAgent,
    ip_address: ip_address || ipAddress,
    device_info: device_info || {},
    device_fingerprint: device_fingerprint || null,
    geolocation: geolocation || null,
    session_name: session_name || 'Unknown Device',
    created_at: now,
    last_activity: now,
    expires_at: expiresAt,
    is_active: true
  });

  await session.save();
  return session;
};

/**
 * Static method: Clean up expired sessions (manual cleanup if TTL not available)
 */
UserSessionSchema.statics.cleanupExpired = function() {
  return this.updateMany(
    {
      is_active: true,
      expires_at: { $lt: new Date() }
    },
    {
      $set: {
        is_active: false,
        invalidated_at: new Date(),
        invalidation_reason: 'expired'
      }
    }
  );
};

const UserSession = mongoose.model('UserSession', UserSessionSchema);

module.exports = UserSession;

