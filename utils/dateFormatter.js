/**
 * Australian date formatting utilities
 * Formats dates according to Australian standards (DD/MM/YYYY)
 * Uses Australia/Sydney timezone
 */

/**
 * Format date to Australian format (DD/MM/YYYY)
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
function formatAustralianDate(date) {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Australia/Sydney'
  }).format(dateObj);
}

/**
 * Format date to Australian format with time (DD/MM/YYYY HH:MM)
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date and time string
 */
function formatAustralianDateTime(date) {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Australia/Sydney'
  }).format(dateObj);
}

/**
 * Format date to long Australian format (e.g., "15 October 2025")
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
function formatAustralianDateLong(date) {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Australia/Sydney'
  }).format(dateObj);
}

/**
 * Get current Australian timezone name (AEDT or AEST)
 * @returns {string} Timezone abbreviation
 */
function getAustralianTimezone() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    timeZoneName: 'short'
  });

  const parts = formatter.formatToParts(now);
  const tzPart = parts.find(part => part.type === 'timeZoneName');

  return tzPart ? tzPart.value : 'AEDT';
}

/**
 * Format relative time (e.g., "2 days ago", "in 3 hours")
 * @param {Date|string} date - Date to compare
 * @returns {string} Relative time string
 */
function formatRelativeTime(date) {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    return '';
  }

  const now = new Date();
  const diffMs = now - dateObj;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return 'just now';
  } else if (diffMin < 60) {
    return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  } else if (diffHour < 24) {
    return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
  } else if (diffDay < 7) {
    return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
  } else {
    return formatAustralianDate(dateObj);
  }
}

/**
 * Check if date is today (Australian timezone)
 * @param {Date|string} date - Date to check
 * @returns {boolean} True if date is today
 */
function isToday(date) {
  if (!date) return false;

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    return false;
  }

  const today = new Date();
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney'
  });

  return formatter.format(dateObj) === formatter.format(today);
}

module.exports = {
  formatAustralianDate,
  formatAustralianDateTime,
  formatAustralianDateLong,
  getAustralianTimezone,
  formatRelativeTime,
  isToday
};
