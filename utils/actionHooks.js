/**
 * WordPress-style Action Hook System
 * 
 * Allows registering callbacks to action points and triggering them via do_action()
 * Example:
 *   add_action('customer.after_save', 'audit_log', async (data) => {...});
 *   do_action('customer.after_save', { doc, action, context });
 */

const actionRegistry = new Map();

/**
 * Register a callback to an action
 * @param {string} actionName - The action name (e.g., 'customer.after_save')
 * @param {string} callbackName - Unique name for this callback (e.g., 'audit_log')
 * @param {Function} callback - Async function to execute
 */
function add_action(actionName, callbackName, callback) {
  if (typeof callback !== 'function') {
    throw new Error(`Callback for "${actionName}" -> "${callbackName}" must be a function`);
  }

  if (!actionRegistry.has(actionName)) {
    actionRegistry.set(actionName, new Map());
  }

  const callbacks = actionRegistry.get(actionName);
  callbacks.set(callbackName, callback);
  
  console.log(`✓ Registered action: ${actionName} -> ${callbackName}`);
}

/**
 * Remove a callback from an action
 * @param {string} actionName - The action name
 * @param {string} callbackName - The callback name to remove
 */
function remove_action(actionName, callbackName) {
  if (actionRegistry.has(actionName)) {
    const deleted = actionRegistry.get(actionName).delete(callbackName);
    if (deleted) {
      console.log(`✓ Removed action: ${actionName} -> ${callbackName}`);
    }
  }
}

/**
 * Trigger an action (async, non-blocking)
 * All registered callbacks for this action will be executed in parallel
 * 
 * @param {string} actionName - The action name to trigger
 * @param {Object} data - Data to pass to callbacks
 * @returns {Promise<Array>} Array of results from callbacks
 */
async function do_action(actionName, data) {
  // Fire and forget - non-blocking
  return new Promise((resolve) => {
    setImmediate(async () => {
      const callbacks = actionRegistry.get(actionName);
      if (!callbacks || callbacks.size === 0) {
        return resolve([]);
      }

      const results = [];
      const promises = [];

      // Execute all callbacks in parallel
      for (const [callbackName, callback] of callbacks.entries()) {
        const promise = (async () => {
          try {
            await callback(data);
            results.push({ name: callbackName, status: 'success' });
          } catch (error) {
            console.error(`❌ Error in action "${actionName}" -> "${callbackName}":`, error);
            results.push({ name: callbackName, status: 'error', error: error.message });
          }
        })();
        promises.push(promise);
      }

      await Promise.all(promises);
      return resolve(results);
    });
  });
}

/**
 * Get all callbacks registered to an action
 * @param {string} actionName - The action name
 * @returns {Map} Map of callbacks
 */
function get_action_callbacks(actionName) {
  return actionRegistry.get(actionName) || new Map();
}

/**
 * Get all registered actions
 * @returns {Array} Array of action names
 */
function get_registered_actions() {
  return Array.from(actionRegistry.keys());
}

/**
 * Clear all registered actions (useful for testing)
 */
function clear_all_actions() {
  actionRegistry.clear();
  console.log('✓ Cleared all actions');
}

/**
 * Check if an action has registered callbacks
 * @param {string} actionName - The action name
 * @returns {boolean}
 */
function has_action(actionName) {
  return actionRegistry.has(actionName) && actionRegistry.get(actionName).size > 0;
}

module.exports = {
  add_action,
  remove_action,
  do_action,
  get_action_callbacks,
  get_registered_actions,
  has_action,
  clear_all_actions
};

