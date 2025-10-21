/**
 * Routes Configuration
 * Single source of truth for all API routes
 * Used by server.js to register routes and generate API documentation
 */

const customersRouter = require('../routes/customers');
const contactsRouter = require('../routes/contacts');
const sitesRouter = require('../routes/sites');
const buildingsRouter = require('../routes/buildings');
const floorsRouter = require('../routes/floors');
const assetsRouter = require('../routes/assets');
const buildingTenantsRouter = require('../routes/tenants');
const documentsRouter = require('../routes/documents');
const hierarchyRouter = require('../routes/hierarchy');
const dropdownsRouter = require('../routes/dropdowns');
const vendorsRouter = require('../routes/vendors');
const usersRouter = require('../routes/users');
const rolesV2Router = require('../routes/v2/roles');
const authRouter = require('../routes/auth');
const notificationsRouter = require('../routes/notifications');
const analyticsRouter = require('../routes/analytics');
const adminRouter = require('../routes/admin');

/**
 * API routes registry
 * Each entry defines a route and its router module
 * Used for both registering routes and generating documentation
 */
const apiRoutes = [
  { path: '/auth', router: authRouter, description: 'Authentication endpoints' },
  { path: '/customers', router: customersRouter, description: 'Customer management' },
  { path: '/customers/:customerId/contacts', router: contactsRouter, description: 'Customer contacts' },
  { path: '/sites', router: sitesRouter, description: 'Site management' },
  { path: '/buildings', router: buildingsRouter, description: 'Building management' },
  { path: '/floors', router: floorsRouter, description: 'Floor management' },
  { path: '/assets', router: assetsRouter, description: 'Asset management' },
  { path: '/building-tenants', router: buildingTenantsRouter, description: 'Building tenants' },
  { path: '/documents', router: documentsRouter, description: 'Document management' },
  { path: '/hierarchy', router: hierarchyRouter, description: 'Customer hierarchy' },
  { path: '/dropdowns', router: dropdownsRouter, description: 'Dropdown data' },
  { path: '/vendors', router: vendorsRouter, description: 'Vendor management' },
  { path: '/users', router: usersRouter, description: 'User management' },
  { path: '/roles', router: rolesV2Router, description: 'Role management' },
  { path: '/notifications', router: notificationsRouter, description: 'User notifications' },
  { path: '/analytics', router: analyticsRouter, description: 'Analytics (super admin)' },
  { path: '/admin', router: adminRouter, description: 'Admin operations (super admin)' }
];

/**
 * Generate endpoints documentation object
 * @returns {Object} Endpoint mappings for API documentation
 */
const getEndpointDocs = () => {
  const docs = {
    health: '/health'
  };

  // Add all API routes
  apiRoutes.forEach((route) => {
    // Convert path to key (e.g., '/customers' -> 'customers')
    const key = route.path.replace(/^\//, '').replace(/:/g, '').replace(/\//g, '_');
    docs[key] = `/api${route.path}`;
  });

  return docs;
};

/**
 * Register all routes on the Express app
 * @param {Express.App} app - Express application instance
 */
const registerRoutes = (app) => {
  apiRoutes.forEach((route) => {
    app.use(`/api${route.path}`, route.router);
  });
};

module.exports = {
  apiRoutes,
  getEndpointDocs,
  registerRoutes
};
