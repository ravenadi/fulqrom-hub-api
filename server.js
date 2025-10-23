const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const errorHandler = require('./middleware/errorHandler');
const authenticate = require('./middleware/authMiddleware');
const authorize = require('./middleware/authorizationMiddleware');
const { tenantContext } = require('./middleware/tenantContext');
const { registerRoutes, getEndpointDocs } = require('./config/routes.config');

const app = express();
const PORT = process.env.PORT || 30001;
const MONGODB_URI = process.env.MONGODB_CONNECTION;

// Security middleware
app.use(helmet());
app.use(compression());

// CORS configuration for development and production
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      process.env.CLIENT_URL || 'http://localhost:8080',
      'http://localhost:8080',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:3001',
      'https://hub.ravenlabs.biz'
    ];
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'Accept', 
    'x-user-id',
    'x-tenant-id',
    'x-requested-with',
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Headers',
    'Access-Control-Allow-Methods'
  ],
  exposedHeaders: ['x-user-id', 'x-tenant-id'],
  optionsSuccessStatus: 200, // Some legacy browsers (IE11, various SmartTVs) choke on 204
  preflightContinue: false
}));

// Handle preflight requests explicitly
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, x-user-id, x-tenant-id, x-requested-with');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// Body parsing middleware
// Important: Do NOT parse multipart/form-data here - let multer handle it in routes
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

// Apply authentication, authorization, and tenant context middleware to all API routes
// These middlewares validate JWT tokens, check permissions, and set up tenant isolation
app.use('/api', authenticate);
app.use('/api', authorize);
app.use('/api', tenantContext);

// Register all API routes
registerRoutes(app);

// Handle 404 for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Root endpoint with dynamically generated documentation
app.get('/', (req, res) => {
  res.json({
    message: 'Fulqrom Hub REST API',
    description: 'Australian Commercial Real Estate & HVAC Building Management System',
    version: '1.0.0',
    endpoints: getEndpointDocs()
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