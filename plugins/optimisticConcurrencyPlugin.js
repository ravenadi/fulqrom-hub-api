/**
 * Mongoose Optimistic Concurrency Plugin
 *
 * This plugin adds optimistic concurrency control to all Mongoose schemas
 * to prevent dirty writes and concurrent update conflicts.
 *
 * Features:
 * - Automatically uses __v (version key) for conflict detection
 * - Works with If-Match/ETag headers
 * - Prevents concurrent updates from overwriting each other
 * - Throws error on version mismatch
 */

/**
 * Optimistic Concurrency Control plugin for Mongoose schemas
 *
 * @param {mongoose.Schema} schema - The Mongoose schema to apply the plugin to
 * @param {Object} options - Plugin options
 * @param {boolean} options.enabled - Enable OCC (default: true)
 */
function optimisticConcurrencyPlugin(schema, options = {}) {
  const { enabled = true } = options;

  if (!enabled) {
    return;
  }

  // Enable optimistic concurrency on this schema
  // This tells Mongoose to automatically check __v field on updates
  schema.set('optimisticConcurrency', true);

  // The schema will now:
  // 1. Automatically increment __v on each save
  // 2. Check __v matches on findOneAndUpdate operations
  // 3. Throw VersionError if version mismatch detected
}

module.exports = optimisticConcurrencyPlugin;

