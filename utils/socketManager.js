/**
 * Socket.IO Manager
 * 
 * Handles WebSocket connections for real-time events:
 * - Session invalidation (single-session enforcement)
 * - Notifications (document activities, alerts, reminders)
 * - System alerts
 */

const { Server: SocketIOServer } = require('socket.io');
const User = require('../models/User');

let io = null;

/**
 * Initialize Socket.IO server
 * @param {Object} httpServer - HTTP server instance
 */
function initializeSocketIO(httpServer) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: function (origin, callback) {
        // Use same CORS logic as express server
        if (process.env.NODE_ENV === 'production') {
          const allowedOrigins = [
            process.env.CLIENT_URL,
            'https://hub.ravenlabs.biz'
          ].filter(Boolean);
          
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            console.error('⛔ Socket.IO CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
          }
        } else {
          // Development: more permissive
          const allowedOrigins = [
            process.env.CLIENT_URL || 'http://localhost:8080',
            'http://localhost:8080',
            'http://localhost:5173',
            'http://localhost:3000',
            'http://localhost:3001',
            'https://hub.ravenlabs.biz'
          ];
          
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            console.log('⚠️  Socket.IO CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
          }
        }
      },
      methods: ['GET', 'POST']
    },
    transports: ['websocket'],
    allowEIO3: true // Allow Engine.IO v3 clients
  });

  // Authenticate Socket.IO connections using Bearer tokens
  io.use(async (socket, next) => {
    try {
      console.log(`🔍 Socket authentication attempt for ${socket.id}`);
      console.log(`🔍 Handshake auth:`, socket.handshake.auth);

      const token = socket.handshake.auth.token;

      if (!token) {
        console.warn(`⚠️ Socket authentication failed: No token provided for ${socket.id}`);
        console.warn(`⚠️ Available auth keys:`, Object.keys(socket.handshake.auth));
        return next(new Error('Authentication error: No token provided'));
      }

      console.log(`✓ Token received, length: ${token.length}, preview: ${token.substring(0, 20)}...`);

      // Use the same requireAuth middleware used for HTTP requests
      const { requireAuth } = require('../middleware/auth0');
      
      // Create a proper Express-like request object
      const mockReq = {
        method: 'GET', // Required by express-oauth2-jwt-bearer
        url: '/socket.io/', // Mock URL
        path: '/socket.io/', // Mock path
        get: (header) => {
          if (header.toLowerCase() === 'authorization') {
            return `Bearer ${token}`;
          }
          return undefined;
        },
        auth: {},
        headers: {
          'authorization': `Bearer ${token}`
        },
        is: (type) => false  // Mock req.is() for express-oauth2-jwt-bearer
      };
      const mockRes = {
        status: (code) => ({
          json: (data) => {
            if (code === 401 || code === 403) {
              const err = new Error(data.message || 'Authentication failed');
              err.status = code;
              throw err;
            }
          }
        })
      };
      const mockNext = (err) => {
        if (err) throw err;
      };

      // Validate JWT using requireAuth middleware
      console.log(`🔍 Validating JWT token...`);
      await requireAuth[0](mockReq, mockRes, mockNext);
      await requireAuth[1](mockReq, mockRes, mockNext);
      console.log(`✓ JWT validation passed`);

      // Extract user info from token
      const payload = mockReq.auth?.payload || mockReq.auth;
      const auth0UserId = payload.sub;
      console.log(`🔍 Auth0 user ID from token: ${auth0UserId}`);

      // Find user in database
      console.log(`🔍 Looking up user with auth0_id: ${auth0UserId}`);
      const user = await User.findOne({ auth0_id: auth0UserId })
        .populate('role_ids', 'name description permissions');

      if (!user) {
        console.warn(`⚠️ Socket authentication failed: User not found for ${auth0UserId}`);
        return next(new Error('Authentication error: User not found'));
      }

      console.log(`✓ User found: ${user.email} (${user._id})`);

      // Attach user info to socket
      socket.userId = user._id.toString();
      socket.user = {
        id: user._id.toString(),
        email: user.email,
        full_name: user.full_name
      };

      console.log(`✅ Socket authenticated: ${socket.id} for user ${user.email} (${user._id})`);
      next();
    } catch (error) {
      console.error(`❌ Socket authentication error for ${socket.id}:`, error.message);
      console.error(`❌ Error stack:`, error.stack);
      next(new Error('Authentication error'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    // Join room for this user
    socket.join(`user:${socket.userId}`);
    console.log(`🔌 Socket.IO client connected: ${socket.id} for user ${socket.user.email}`);

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`🔌 Socket.IO client disconnected: ${socket.id} (${reason})`);
    });

    // Handle error
    socket.on('error', (error) => {
      console.error(`❌ Socket error: ${socket.id}`, error);
    });
  });

  console.log('✅ Socket.IO server initialized');
  return io;
}

/**
 * Get Socket.IO instance
 */
function getIO() {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initializeSocketIO() first.');
  }
  return io;
}

/**
 * Emit session invalidation event to user
 * @param {String} userId - MongoDB ObjectId as string
 * @param {String} reason - Invalidation reason
 */
function emitSessionInvalidation(userId, reason = 'new_session') {
  if (!io) {
    console.warn('⚠️  Socket.IO not initialized, skipping real-time notification');
    return;
  }

  const roomName = `user:${userId}`;

  // Get all sockets for this user
  const socketsInRoom = io.sockets.adapter.rooms.get(roomName);

  if (!socketsInRoom) {
    console.log(`📡 No active sockets in room ${roomName}`);
    return;
  }

  let invalidatedCount = 0;

  // Emit to all sockets for this user
  socketsInRoom.forEach((socketId) => {
    const socket = io.sockets.sockets.get(socketId);

    if (socket) {
      socket.emit('session:invalidated', {
        reason,
        message: reason === 'new_session'
          ? 'You have been logged out because a new login was detected from another device.'
          : 'Your session has been invalidated.'
      });
      invalidatedCount++;
      console.log(`📡 Invalidated socket ${socketId} for user ${userId}`);
    }
  });

  console.log(`📡 Emitted session invalidation to ${invalidatedCount} socket(s) in room ${roomName}`);
}

/**
 * Emit notification to user via Socket.IO
 * @param {String} userId - User ID (MongoDB ObjectId as string)
 * @param {Object} notification - Notification data
 */
function emitNotification(userId, notification) {
  if (!io) {
    console.warn('⚠️  Socket.IO not initialized, skipping real-time notification');
    return;
  }

  const roomName = `user:${userId}`;
  
  // Emit notification event to user
  io.to(roomName).emit('notification:new', {
    ...notification,
    timestamp: new Date()
  });

  console.log(`📨 Emitted notification to user ${userId}: ${notification.title}`);
}

/**
 * Emit notification update event (e.g., when marked as read)
 * @param {String} userId - User ID
 * @param {Object} data - Update data
 */
function emitNotificationUpdate(userId, data) {
  if (!io) {
    console.warn('⚠️  Socket.IO not initialized, skipping notification update');
    return;
  }

  const roomName = `user:${userId}`;
  
  io.to(roomName).emit('notification:update', {
    ...data,
    timestamp: new Date()
  });

  console.log(`🔄 Emitted notification update to user ${userId}`);
}

/**
 * Emit unread count update to user
 * @param {String} userId - User ID
 * @param {Number} count - Unread count
 */
function emitUnreadCount(userId, count) {
  if (!io) {
    console.warn('⚠️  Socket.IO not initialized, skipping unread count update');
    return;
  }

  const roomName = `user:${userId}`;
  
  io.to(roomName).emit('notification:unread_count', {
    count,
    timestamp: new Date()
  });

  console.log(`🔔 Emitted unread count update to user ${userId}: ${count}`);
}

/**
 * Emit asset update notification to all connected users
 * @param {String} assetId - Asset ID
 * @param {Object} data - Update data including updatedBy and tenant_id
 */
function emitAssetUpdate(assetId, data) {
  if (!io) {
    console.warn('⚠️  Socket.IO not initialized, skipping asset update notification');
    return;
  }

  // Use tenant-specific room for the broadcast
  const tenantRoom = `tenant:${data.tenant_id}`;
  
  // Emit to all users in the tenant except the originator
  io.to(tenantRoom).emit('asset:updated', {
    assetId,
    updatedBy: data.updatedBy,
    timestamp: new Date(),
    ...data
  });

  console.log(`🔧 Emitted asset update notification for asset ${assetId} to tenant ${data.tenant_id}`);
}

/**
 * Emit customer update notification to all connected users
 * @param {String} customerId - Customer ID
 * @param {Object} data - Update data including updatedBy and tenant_id
 */
function emitCustomerUpdate(customerId, data) {
  if (!io) {
    console.warn('⚠️  Socket.IO not initialized, skipping customer update notification');
    return;
  }

  // Use tenant-specific room for the broadcast
  const tenantRoom = `tenant:${data.tenant_id}`;
  
  // Emit to all users in the tenant except the originator
  io.to(tenantRoom).emit('customer:updated', {
    customerId,
    updatedBy: data.updatedBy,
    timestamp: new Date(),
    ...data
  });

  console.log(`👥 Emitted customer update notification for customer ${customerId} to tenant ${data.tenant_id}`);
}

module.exports = {
  initializeSocketIO,
  getIO,
  emitSessionInvalidation,
  emitNotification,
  emitNotificationUpdate,
  emitUnreadCount,
  emitAssetUpdate,
  emitCustomerUpdate
};

