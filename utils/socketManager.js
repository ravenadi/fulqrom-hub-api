/**
 * Socket.IO Manager
 * 
 * Handles WebSocket connections for real-time events:
 * - Session invalidation (single-session enforcement)
 * - Notifications (document activities, alerts, reminders)
 * - System alerts
 */

const { Server: SocketIOServer } = require('socket.io');

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
      credentials: true,
      methods: ['GET', 'POST']
    },
    transports: ['websocket'],
    allowEIO3: true // Allow Engine.IO v3 clients
  });

  // Connection handler
  io.on('connection', (socket) => {
    console.log(`🔌 Socket.IO client connected: ${socket.id}`);

    // Handle session authentication
    socket.on('authenticate', (data) => {
      const { sessionId, userId } = data;

      if (sessionId && userId) {
        // Join room for this user
        socket.join(`user:${userId}`);
        console.log(`✅ Socket authenticated: ${socket.id} for user ${userId} (session: ${sessionId})`);

        // Store session info on socket
        socket.sessionId = sessionId;
        socket.userId = userId;
      } else {
        console.warn(`⚠️  Socket authentication failed: ${socket.id}`);
      }
    });

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
 * @param {String} currentSessionId - Current valid session ID (to preserve)
 * @param {String} reason - Invalidation reason
 */
function emitSessionInvalidation(userId, currentSessionId, reason = 'new_session') {
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

  // Emit to sockets with DIFFERENT session IDs
  socketsInRoom.forEach((socketId) => {
    const socket = io.sockets.sockets.get(socketId);

    if (socket) {
      // Only invalidate sockets with different session IDs
      // This preserves all tabs/windows with the same session cookie
      if (!currentSessionId || socket.sessionId !== currentSessionId) {
        socket.emit('session:invalidated', {
          reason,
          message: reason === 'new_session'
            ? 'You have been logged out because a new login was detected from another device.'
            : 'Your session has been invalidated.'
        });
        invalidatedCount++;
        console.log(`📡 Invalidated socket ${socketId} (session: ${socket.sessionId})`);
      } else {
        console.log(`✅ Preserved socket ${socketId} (same session: ${socket.sessionId})`);
      }
    }
  });

  console.log(`📡 Emitted session invalidation to ${invalidatedCount} socket(s) in room ${roomName} (preserved session: ${currentSessionId})`);
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

