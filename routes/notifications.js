const express = require('express');
const Notification = require('../models/Notification');
const notificationService = require('../utils/notificationService');
const { checkModulePermission } = require('../middleware/checkPermission');
const { getUserId } = require('../utils/authHelper');

const router = express.Router();

/**
 * GET /api/notifications
 * Get notifications for the current user
 */
router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const {
      limit = 50,
      skip = 0,
      offset = 0,
      unreadOnly = false,
      types = null,
      startDate = null,
      endDate = null
    } = req.query;

    const options = {
      limit: parseInt(limit, 10),
      skip: parseInt(skip || offset, 10),
      unreadOnly: unreadOnly === 'true' || unreadOnly === true,
      types: types ? (Array.isArray(types) ? types : types.split(',')) : null,
      startDate,
      endDate
    };

    const notifications = await notificationService.getUserNotifications(userId, options);
    const unreadCount = await notificationService.getUnreadCount(userId);

    res.json({
      success: true,
      data: notifications,
      meta: {
        total: notifications.length,
        limit: options.limit,
        skip: options.skip,
        unread_count: unreadCount
      }
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications',
      message: error.message
    });
  }
});

/**
 * POST /api/notifications/fix-user-ids
 * Fix existing notifications with email as user_id
 */
router.post('/fix-user-ids', async (req, res) => {
  try {
    const { email, correct_user_id } = req.body;

    if (!email || !correct_user_id) {
      return res.status(400).json({
        success: false,
        error: 'Email and correct_user_id are required'
      });
    }

    const Notification = require('../models/Notification');

    // Update all notifications where user_id is the email
    const result = await Notification.updateMany(
      { user_id: email },
      { $set: { user_id: correct_user_id } }
    );

    res.json({
      success: true,
      message: `Updated ${result.modifiedCount} notifications`,
      data: result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/notifications/debug-user
 * Debug endpoint to see what user info we have
 */
router.get('/debug-user', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id?.toString() || req.user?.email;

    // Get sample notifications
    const Notification = require('../models/Notification');
    const allNotifs = await Notification.find({}).limit(3).lean();

    res.json({
      success: true,
      debug: {
        req_user: req.user,
        extracted_userId: userId,
        sample_notifications: allNotifs.map(n => ({
          user_id: n.user_id,
          user_email: n.user_email,
          title: n.title,
          is_read: n.is_read
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/notifications/unread-count
 * Get unread notification count for the current user
 */
router.get('/unread-count', async (req, res) => {
  try {
    // Use consistent user ID extraction - prioritize userId from auth middleware
    const userId = req.user?.userId || req.user?.id || req.user?._id?.toString() || req.user?.email;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const count = await notificationService.getUnreadCount(userId);

    res.json({
      success: true,
      data: {
        count
      }
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unread count',
      message: error.message
    });
  }
});

/**
 * PUT /api/notifications/:id/read
 * Mark a notification as read
 */
router.put('/:id/read', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id?.toString() || req.user?.email;
    const notificationId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const notification = await notificationService.markAsRead(notificationId, userId);

    res.json({
      success: true,
      data: notification,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(error.message === 'Notification not found' ? 404 : 500).json({
      success: false,
      error: error.message === 'Notification not found' ? 'Notification not found' : 'Failed to mark notification as read',
      message: error.message
    });
  }
});

/**
 * PUT /api/notifications/mark-read
 * Mark multiple notifications as read
 */
router.put('/mark-read', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id?.toString() || req.user?.email;
    const { notificationIds } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid notification IDs'
      });
    }

    const result = await notificationService.markMultipleAsRead(notificationIds, userId);

    res.json({
      success: true,
      data: result,
      message: `${result.modifiedCount} notification(s) marked as read`
    });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notifications as read',
      message: error.message
    });
  }
});

/**
 * PUT /api/notifications/mark-all-read
 * Mark all notifications as read for the current user
 */
router.put('/mark-all-read', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id?.toString() || req.user?.email;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const result = await Notification.updateMany(
      {
        $or: [
          { user_id: userId },
          { user_email: userId }
        ],
        is_read: false
      },
      {
        $set: {
          is_read: true,
          read_at: new Date(),
          updated_at: new Date()
        }
      }
    );

    res.json({
      success: true,
      data: result,
      message: `${result.modifiedCount} notification(s) marked as read`
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark all notifications as read',
      message: error.message
    });
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete a notification
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id?.toString() || req.user?.email;
    const notificationId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const result = await Notification.findOneAndDelete({
      _id: notificationId,
      $or: [
        { user_id: userId },
        { user_email: userId }
      ]
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete notification',
      message: error.message
    });
  }
});

/**
 * DELETE /api/notifications
 * Delete all read notifications for the current user
 */
router.delete('/', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id?.toString() || req.user?.email;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const result = await Notification.deleteMany({
      user_id: userId,
      is_read: true
    });

    res.json({
      success: true,
      data: result,
      message: `${result.deletedCount} notification(s) deleted`
    });
  } catch (error) {
    console.error('Error deleting notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete notifications',
      message: error.message
    });
  }
});

module.exports = router;
