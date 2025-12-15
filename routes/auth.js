/**
 * Authentication Routes
 *
 * BFF (Backend-for-Frontend) authentication endpoints.
 * Handles session creation, refresh, and logout with cookie management.
 * Refactored to use authController (Phase 3 - Clean Architecture)
 *
 * Routes:
 * - POST /auth/login - Create session from Auth0 token
 * - POST /auth/refresh - Refresh session and extend TTL
 * - GET /auth/refresh-session - Alternative refresh endpoint with user info
 * - POST /auth/logout - Invalidate session
 * - GET /auth/me - Get current user info
 * - POST /auth/sync-user - Legacy Auth0 user synchronization
 * - GET /auth/config - Get Auth0 configuration
 * - GET /auth/user/:auth0Id - Get user by Auth0 ID
 * - POST /auth/logout-all - Logout from all devices
 * - GET /auth/sessions - List active sessions
 * - DELETE /auth/sessions/:sessionId - Revoke specific session
 * - POST /auth/change-password - Change user password
 */

const express = require('express');
const { authenticateSession } = require('../middleware/sessionAuth');
const { requireAuth } = require('../middleware/auth0');
const { authLimiter } = require('../middleware/rateLimiter');

// Controller for all auth business logic
const authController = require('../controllers/authController');

const router = express.Router();

// POST /auth/login - Create session from Auth0 token
// NOTE: This endpoint ALWAYS accepts Bearer tokens for Auth0 validation
router.post('/login', authLimiter, requireAuth[0], requireAuth[1], authController.login);

// POST /auth/refresh - Refresh session and extend TTL
router.post('/refresh', authenticateSession, authController.refresh);

// GET /auth/refresh-session - Alternative refresh endpoint with user info
router.get('/refresh-session', authenticateSession, authController.refreshSession);

// POST /auth/logout - Invalidate session and clear cookies
// NOTE: Doesn't require authentication - allows logout even with expired session
router.post('/logout', authController.logout);

// GET /auth/me - Get current authenticated user information
router.get('/me', authenticateSession, authController.getCurrentUser);

// POST /auth/sync-user - Legacy Auth0 user synchronization
// NOTE: Public endpoint, called before session creation
router.post('/sync-user', authController.syncUser);

// GET /auth/config - Get Auth0 configuration for frontend
// NOTE: Public endpoint
router.get('/config', authController.getConfig);

// GET /auth/user/:auth0Id - Get user by Auth0 ID
// NOTE: Public endpoint for fallback when sync fails
router.get('/user/:auth0Id', authController.getUserByAuth0Id);

// POST /auth/logout-all - Invalidate all sessions for current user
router.post('/logout-all', authenticateSession, authController.logoutAll);

// GET /auth/sessions - List all active sessions for current user
router.get('/sessions', authenticateSession, authController.getSessions);

// DELETE /auth/sessions/:sessionId - Revoke a specific session
router.delete('/sessions/:sessionId', authenticateSession, authController.revokeSession);

// POST /auth/change-password - Change user password
router.post('/change-password', requireAuth[0], requireAuth[1], authController.changePassword);

module.exports = router;
