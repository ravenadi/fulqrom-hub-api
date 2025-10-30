/**
 * Device Fingerprinting Utility
 *
 * Extracts device information, creates fingerprints, and geolocates users
 * for enhanced session tracking and security.
 */

const crypto = require('crypto');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');

/**
 * Parse user agent string and extract device information
 *
 * @param {string} userAgentString - User agent from request headers
 * @returns {Object} Device information (browser, os, device type)
 */
function parseUserAgent(userAgentString) {
  if (!userAgentString) {
    return {
      browser: 'Unknown',
      browser_version: '',
      os: 'Unknown',
      os_version: '',
      device_type: 'unknown'
    };
  }

  const parser = new UAParser(userAgentString);
  const result = parser.getResult();

  return {
    browser: result.browser.name || 'Unknown',
    browser_version: result.browser.version || '',
    os: result.os.name || 'Unknown',
    os_version: result.os.version || '',
    device_type: result.device.type || 'desktop' // defaults to desktop if not mobile/tablet
  };
}

/**
 * Get geolocation information from IP address
 * Uses geoip-lite for IP-based geolocation (no external API calls)
 *
 * @param {string} ipAddress - IP address to lookup
 * @returns {Object|null} Geolocation data or null if not found
 */
function getGeolocation(ipAddress) {
  if (!ipAddress) {
    return null;
  }

  // Clean IP address (remove ::ffff: prefix for IPv4-mapped IPv6)
  const cleanIp = ipAddress.replace(/^::ffff:/, '');

  // Skip localhost and private IPs
  if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.')) {
    return {
      country: 'Local',
      country_code: 'LOCAL',
      city: 'Localhost',
      region: '',
      timezone: ''
    };
  }

  const geo = geoip.lookup(cleanIp);

  if (!geo) {
    return null;
  }

  return {
    country: geo.country,
    country_code: geo.country,
    city: geo.city || '',
    region: geo.region || '',
    timezone: geo.timezone || ''
  };
}

/**
 * Create a device fingerprint hash
 * Combines user agent and IP prefix for semi-anonymous tracking
 *
 * @param {string} userAgent - User agent string
 * @param {string} ipAddress - IP address
 * @param {Object} additionalData - Additional data to include in fingerprint
 * @returns {string} 32-character fingerprint hash
 */
function createDeviceFingerprint(userAgent, ipAddress, additionalData = {}) {
  const data = {
    userAgent: userAgent || '',
    // Use first 3 octets of IP for general location without exact tracking
    // This balances security (detect new devices) with privacy (don't track exact IP)
    ipPrefix: ipAddress ? ipAddress.split('.').slice(0, 3).join('.') : '',
    ...additionalData
  };

  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex')
    .substring(0, 32); // Use first 32 characters

  return hash;
}

/**
 * Generate a user-friendly session name
 * Creates a readable name like "Desktop - Chrome" or "iPhone - Safari"
 *
 * @param {Object} deviceInfo - Device information object
 * @returns {string} User-friendly session name
 */
function generateSessionName(deviceInfo) {
  if (!deviceInfo) {
    return 'Unknown Device';
  }

  const deviceType = deviceInfo.device_type === 'desktop' ? 'Desktop' :
                     deviceInfo.device_type === 'mobile' ? 'Mobile' :
                     deviceInfo.device_type === 'tablet' ? 'Tablet' : 'Unknown';

  const browser = deviceInfo.browser || 'Unknown Browser';

  return `${deviceType} - ${browser}`;
}

/**
 * Extract comprehensive device information from Express request
 * This is the main function to use in route handlers
 *
 * @param {Object} req - Express request object
 * @param {Object} additionalData - Additional data to include in fingerprint
 * @returns {Object} Complete device information package
 */
function extractDeviceInfo(req, additionalData = {}) {
  const userAgent = req.get('user-agent') || '';
  const ipAddress = req.ip || req.connection?.remoteAddress || '';

  const deviceInfo = parseUserAgent(userAgent);
  const geolocation = getGeolocation(ipAddress);
  const fingerprint = createDeviceFingerprint(userAgent, ipAddress, additionalData);
  const sessionName = generateSessionName(deviceInfo);

  return {
    user_agent: userAgent,
    ip_address: ipAddress,
    device_info: deviceInfo,
    geolocation,
    device_fingerprint: fingerprint,
    session_name: sessionName
  };
}

module.exports = {
  parseUserAgent,
  getGeolocation,
  createDeviceFingerprint,
  generateSessionName,
  extractDeviceInfo
};
