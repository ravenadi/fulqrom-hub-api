const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const errorHandler = require('./middleware/errorHandler');
const authenticate = require('./middleware/authMiddleware');
const authorize = require('./middleware/authorizationMiddleware');
const { registerRoutes, getEndpointDocs } = require('./config/routes.config');

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

// Apply authentication and authorization middleware to all API routes
// These middlewares validate JWT tokens and check permissions
app.use('/api', authenticate);
app.use('/api', authorize);

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