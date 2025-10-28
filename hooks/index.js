/**
 * Centralized Hook Registration
 * 
 * Loads all module-specific hook files
 * Similar to how routes are loaded in routes/index.js
 */

console.log('📋 Loading hooks...');

// Load all hook files
require('./customerHooks');
require('./siteHooks');
require('./buildingHooks');
require('./floorHooks');
require('./assetHooks');
require('./documentHooks');
require('./tenantHooks');
require('./buildingTenantHooks');
require('./userHooks');

const { get_registered_actions } = require('../utils/actionHooks');

console.log('✓ All hooks registered');
console.log(`📊 Total actions registered: ${get_registered_actions().length}`);

module.exports = {};

