/**
 * Request Context using AsyncLocalStorage
 * 
 * Provides thread-safe context storage for tenant ID and user info
 * across async operations without explicitly passing via function parameters.
 * 
 * Used by tenantPlugin to enforce tenant isolation at the model layer.
 */

const { AsyncLocalStorage } = require('node:async_hooks');

const asyncLocalStorage = new AsyncLocalStorage();

/**
 * Run a function with a new context
 * @param {Object} context - Context object (e.g., { tenantId, userId })
 * @param {Function} fn - Function to run with context
 * @returns {*} Result of the function
 */
function runWithContext(context, fn) {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Get the current context store
 * @returns {Object|undefined} Current context or undefined if not in a context
 */
function getStore() {
  return asyncLocalStorage.getStore();
}

/**
 * Set tenant ID in the current context
 * @param {string|ObjectId} tenantId - Tenant ID to set
 */
function setTenant(tenantId) {
  const store = asyncLocalStorage.getStore();
  if (store) {
    store.tenantId = tenantId;
  } else {
    console.warn('setTenant called outside of AsyncLocalStorage context');
  }
}

/**
 * Get tenant ID from the current context
 * @returns {string|ObjectId|undefined} Current tenant ID or undefined
 */
function getTenant() {
  const store = asyncLocalStorage.getStore();
  return store?.tenantId;
}

/**
 * Set user info in the current context
 * @param {Object} user - User object with id, email, etc.
 */
function setUser(user) {
  const store = asyncLocalStorage.getStore();
  if (store) {
    store.user = user;
  } else {
    console.warn('setUser called outside of AsyncLocalStorage context');
  }
}

/**
 * Get user from the current context
 * @returns {Object|undefined} Current user or undefined
 */
function getUser() {
  const store = asyncLocalStorage.getStore();
  return store?.user;
}

module.exports = {
  asyncLocalStorage, // Export the instance for direct middleware use
  runWithContext,
  getStore,
  setTenant,
  getTenant,
  setUser,
  getUser
};

