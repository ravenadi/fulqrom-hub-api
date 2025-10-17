const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const errorHandler = require('./middleware/errorHandler');
const { conditionalAuth } = require('./middleware/auth0');
const customersRouter = require('./routes/customers');
const contactsRouter = require('./routes/contacts');
const sitesRouter = require('./routes/sites');
const buildingsRouter = require('./routes/buildings');
const floorsRouter = require('./routes/floors');
const assetsRouter = require('./routes/assets');
const buildingTenantsRouter = require('./routes/tenants');
const documentsRouter = require('./routes/documents');
const hierarchyRouter = require('./routes/hierarchy');
const dropdownsRouter = require('./routes/dropdowns');
const vendorsRouter = require('./routes/vendors');
const usersRouter = require('./routes/users');
const rolesRouter = require('./routes/roles');
const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 30001;
const MONGODB_URI = process.env.MONGODB_CONNECTION;

// Security middleware
app.use(helmet());
app.use(compression());

// CORS configuration for development
app.use(cors({
  origin: [
    process.env.CLIENT_URL || 'http://localhost:8080',
    'http://localhost:8080',
    'http://localhost:5173',
    'http://localhost:3000',
    'https://hub.ravenlabs.biz'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'x-user-id']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint (no authentication required)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Fulqrom Hub API',
    version: '1.0.0'
  });
});

// Apply authentication to all API routes (except auth routes)
// This middleware will check for user_id when USE_AUTH0=false or JWT token when USE_AUTH0=true
app.use('/api', (req, res, next) => {
  // Skip authentication for auth and health endpoints
  // Important: Auth endpoints must be public for login/signup flow
  if (req.path.startsWith('/auth') || req.path === '/health') {
    console.log(`✓ Bypassing auth for public endpoint: ${req.method} ${req.path}`);
    return next();
  }
  console.log(`🔒 Applying auth for protected endpoint: ${req.method} ${req.path}`);
  // Apply conditional authentication
  conditionalAuth(req, res, next);
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/customers', customersRouter);
app.use('/api/customers/:customerId/contacts', contactsRouter);
app.use('/api/sites', sitesRouter);
app.use('/api/buildings', buildingsRouter);
app.use('/api/floors', floorsRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/building-tenants', buildingTenantsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/hierarchy', hierarchyRouter);
app.use('/api/dropdowns', dropdownsRouter);
app.use('/api/vendors', vendorsRouter);
app.use('/api/users', usersRouter);
app.use('/api/roles', rolesRouter);

// Handle 404 for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Fulqrom Hub REST API',
    description: 'Australian Commercial Real Estate & HVAC Building Management System',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      customers: '/api/customers',
      contacts: '/api/customers/:customerId/contacts',
      sites: '/api/sites',
      buildings: '/api/buildings',
      floors: '/api/floors',
      assets: '/api/assets',
      building_tenants: '/api/building-tenants',
      documents: '/api/documents',
      hierarchy: '/api/hierarchy/:customer_id',
      dropdowns: '/api/dropdowns',
      dropdown_entities: '/api/dropdowns/entities/:entity',
      document_tags: '/api/dropdowns/document-tags',
      vendors: '/api/vendors',
      users: '/api/users',
      roles: '/api/roles'
    }
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Database initialization
const initializeDatabase = require('./utils/initializeDatabase');

// Database connection
mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('✓ Database connected successfully');
    // Initialize database with default data
    await initializeDatabase();
  })
  .catch((error) => {
    console.error('✗ Database connection failed:', error.message);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {

  await mongoose.connection.close();
  console.log('✓ Database connection closed');
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`✓ Server is running on port ${PORT}`);
});

module.exports = app;