// Re-export the main Role model for v2 API compatibility
// Roles are global and not tenant-scoped
const Role = require('../Role');

module.exports = Role;