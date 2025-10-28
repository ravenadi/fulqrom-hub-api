/**
 * Async Helper Utilities
 * 
 * Provides non-blocking wrappers for async operations like notifications and emails
 * Uses fire-and-forget pattern with setImmediate to prevent blocking API responses
 */

/**
 * Fire and forget async operation
 * Executes callback in next event loop tick, doesn't block current request
 * 
 * @param {Function} asyncCallback - Async function to execute
 * @param {string} operationName - Name for logging (optional)
 * @returns {Promise} - Resolves immediately, doesn't wait for callback
 * 
 * @example
 * // Non-blocking notification send
 * fireAndForget(async () => {
 *   await notificationService.sendNotification(...);
 * }, 'send_notification');
 */
function fireAndForget(asyncCallback, operationName = 'async_operation') {
  return new Promise((resolve) => {
    setImmediate(async () => {
      try {
        await asyncCallback();
      } catch (error) {
        console.error(`Error in fire-and-forget operation "${operationName}":`, error);
        // Don't throw - this is fire and forget
      }
    });
    // Resolve immediately, don't wait for callback
    resolve();
  });
}

/**
 * Fire and forget multiple async operations in parallel
 * All operations run in parallel, none block the current request
 * 
 * @param {Array<Function>} asyncCallbacks - Array of async functions
 * @param {string} operationName - Base name for logging
 * @returns {Promise} - Resolves immediately
 * 
 * @example
 * // Send multiple notifications non-blocking
 * fireAndForgetAll([
 *   () => notificationService.sendNotification(...),
 *   () => emailService.sendEmail(...)
 * ], 'document_notifications');
 */
function fireAndForgetAll(asyncCallbacks, operationName = 'async_operations') {
  return new Promise((resolve) => {
    setImmediate(async () => {
      const promises = asyncCallbacks.map((callback, index) => {
        return (async () => {
          try {
            await callback();
          } catch (error) {
            console.error(`Error in fire-and-forget operation "${operationName}[${index}]":`, error);
          }
        })();
      });
      
      // Execute all in parallel, but don't block
      Promise.all(promises).catch(err => {
        console.error(`Error in fire-and-forget-all "${operationName}":`, err);
      });
    });
    // Resolve immediately
    resolve();
  });
}

/**
 * Non-blocking wrapper for notification service calls
 * Automatically wraps the call in fire-and-forget
 * 
 * @param {Function} notificationCall - Function that returns Promise (e.g., () => notificationService.sendNotification(...))
 * @param {string} operationName - Name for logging
 * @returns {Promise} - Resolves immediately
 * 
 * @example
 * // In route handler after save:
 * sendNotificationAsync(
 *   () => notificationService.notifyDocumentApproversAssigned(document, approvers, actor),
 *   'document_approver_assigned'
 * );
 * // Continue with response immediately
 */
function sendNotificationAsync(notificationCall, operationName = 'notification') {
  return fireAndForget(notificationCall, operationName);
}

/**
 * Non-blocking wrapper for email service calls
 * Automatically wraps the call in fire-and-forget
 * 
 * @param {Function} emailCall - Function that returns Promise (e.g., () => emailService.sendEmail(...))
 * @param {string} operationName - Name for logging
 * @returns {Promise} - Resolves immediately
 * 
 * @example
 * // In route handler after save:
 * sendEmailAsync(
 *   () => emailService.sendDocumentAssignment({ ... }),
 *   'document_assignment_email'
 * );
 */
function sendEmailAsync(emailCall, operationName = 'email') {
  return fireAndForget(emailCall, operationName);
}

module.exports = {
  fireAndForget,
  fireAndForgetAll,
  sendNotificationAsync,
  sendEmailAsync
};

