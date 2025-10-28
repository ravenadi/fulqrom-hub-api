/**
 * Authentication Helper Utilities
 * Centralized helper functions for extracting user information from requests
 */

/**
 * Extract user ID from request object
 * Supports different authentication modes:
 * - Auth0: req.user.id
 * - MongoDB ObjectId: req.user._id
 * - Email-based auth: req.user.email
 *
 * @param {Object} req - Express request object
 * @returns {string|null} User identifier (ID or email)
 */
function getUserId(req) {
  return req.user?.id || req.user?._id?.toString() || req.user?.email || null;
}

/**
 * Get current logged-in user details
 * Extracts user information from the authenticated request
 * 
 * @param {Object} req - Express request object
 * @returns {Object|null} User object with {userId, userEmail, userName} or null if not authenticated
 */
function getCurrentUser(req) {
  if (!req.user) {
    return null;
  }

  const userName = req.user.full_name && req.user.full_name.trim() ? req.user.full_name.trim() : null;

  return {
    userId: req.user.userId || req.user.id,
    userEmail: req.user.email,
    userName: userName,
    auth0_id: req.user.auth0_id,
    tenant_id: req.user.tenant_id
  };
}

module.exports = {
  getUserId,
  getCurrentUser
};
