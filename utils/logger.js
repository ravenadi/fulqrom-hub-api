/**
 * Structured Logger Utility
 * Provides consistent logging across the application with support for log levels,
 * context, and structured output. Can be easily upgraded to winston/pino later.
 *
 * @module utils/logger
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

const currentLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const isDebugEnabled = process.env.DEBUG_LOGS === 'true' || process.env.NODE_ENV === 'development';

/**
 * Format log message with timestamp and context
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} [meta] - Additional metadata
 * @returns {string} Formatted log entry
 */
function formatLog(level, message, meta = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level: level.toUpperCase(),
    message
  };

  if (meta && Object.keys(meta).length > 0) {
    logEntry.meta = meta;
  }

  // In production, output JSON for log aggregation
  if (process.env.NODE_ENV === 'production') {
    return JSON.stringify(logEntry);
  }

  // In development, use readable format
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

/**
 * Check if log level should be output
 * @param {string} level - Log level to check
 * @returns {boolean} Whether to output this log level
 */
function shouldLog(level) {
  return LOG_LEVELS[level] <= LOG_LEVELS[currentLevel];
}

/**
 * Log error message
 * @param {string} message - Error message
 * @param {Object|Error} [meta] - Additional metadata or Error object
 */
function error(message, meta = null) {
  if (!shouldLog('error')) return;

  let logMeta = meta;
  if (meta instanceof Error) {
    logMeta = {
      errorName: meta.name,
      errorMessage: meta.message,
      stack: process.env.NODE_ENV !== 'production' ? meta.stack : undefined
    };
  }

  console.error(formatLog('error', message, logMeta));
}

/**
 * Log warning message
 * @param {string} message - Warning message
 * @param {Object} [meta] - Additional metadata
 */
function warn(message, meta = null) {
  if (!shouldLog('warn')) return;
  console.warn(formatLog('warn', message, meta));
}

/**
 * Log info message
 * @param {string} message - Info message
 * @param {Object} [meta] - Additional metadata
 */
function info(message, meta = null) {
  if (!shouldLog('info')) return;
  console.info(formatLog('info', message, meta));
}

/**
 * Log HTTP request/response
 * @param {string} message - HTTP log message
 * @param {Object} [meta] - Request/response metadata
 */
function http(message, meta = null) {
  if (!shouldLog('http')) return;
  console.log(formatLog('http', message, meta));
}

/**
 * Log debug message (only in development or when DEBUG_LOGS=true)
 * @param {string} message - Debug message
 * @param {Object} [meta] - Additional metadata
 */
function debug(message, meta = null) {
  if (!shouldLog('debug') || !isDebugEnabled) return;
  console.log(formatLog('debug', message, meta));
}

/**
 * Create a child logger with preset context
 * @param {string} module - Module name for context
 * @returns {Object} Logger instance with context
 */
function createLogger(module) {
  const addContext = (meta) => ({ module, ...meta });

  return {
    error: (message, meta) => error(message, addContext(meta)),
    warn: (message, meta) => warn(message, addContext(meta)),
    info: (message, meta) => info(message, addContext(meta)),
    http: (message, meta) => http(message, addContext(meta)),
    debug: (message, meta) => debug(message, addContext(meta))
  };
}

/**
 * Log controller operation start
 * @param {string} controller - Controller name
 * @param {string} operation - Operation name
 * @param {Object} [context] - Additional context
 */
function logOperation(controller, operation, context = {}) {
  debug(`${controller}.${operation} started`, context);
}

/**
 * Log controller operation error
 * @param {string} controller - Controller name
 * @param {string} operation - Operation name
 * @param {Error} err - Error object
 */
function logOperationError(controller, operation, err) {
  error(`${controller}.${operation} failed`, {
    errorName: err.name,
    errorMessage: err.message
  });
}

module.exports = {
  error,
  warn,
  info,
  http,
  debug,
  createLogger,
  logOperation,
  logOperationError,
  LOG_LEVELS
};
