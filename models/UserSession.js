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
    enum: ['logout', 'new_session', 'expired', 'revoked', 'security'],
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
  return this.updateMany(
    { user_id: userId, is_active: true },
    {
      $set: {
        is_active: false,
        invalidated_at: new Date(),
        invalidation_reason: reason
      }
    }
  );
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
    // Legacy field names for backwards compatibility
    userAgent,
    ipAddress
  } = options;

  // Invalidate existing sessions if single-session mode
  if (singleSession) {
    await this.invalidateAllForUser(userData.user_id, 'new_session');
  }

  const session = new this({
    session_id: sessionId,
    user_id: userData.user_id,
    auth0_id: userData.auth0_id,
    email: userData.email,
    tenant_id: userData.tenant_id,
    csrf_token: csrfToken,
    // Use new field names, fallback to legacy
    user_agent: user_agent || userAgent,
    ip_address: ip_address || ipAddress,
    device_info: device_info || {},
    device_fingerprint: device_fingerprint || null,
    geolocation: geolocation || null,
    session_name: session_name || 'Unknown Device',
    created_at: new Date(),
    last_activity: new Date(),
    expires_at: new Date(Date.now() + ttlSeconds * 1000),
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

