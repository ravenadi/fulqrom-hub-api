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

module.exports = {
  getUserId
};
