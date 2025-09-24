const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const errorHandler = require('./middleware/errorHandler');
const customersRouter = require('./routes/customers');
const sitesRouter = require('./routes/sites');
const buildingsRouter = require('./routes/buildings');
const floorsRouter = require('./routes/floors');
const assetsRouter = require('./routes/assets');

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
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Fulqrom Hub API',
    version: '1.0.0'
  });
});

// API routes
app.use('/api/customers', customersRouter);
app.use('/api/sites', sitesRouter);
app.use('/api/buildings', buildingsRouter);
app.use('/api/floors', floorsRouter);
app.use('/api/assets', assetsRouter);

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
      sites: '/api/sites',
      buildings: '/api/buildings',
      floors: '/api/floors',
      assets: '/api/assets'
    }
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Database connection
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    console.log(`📍 Database: ${MONGODB_URI}`);
  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await mongoose.connection.close();
  console.log('✅ Database connection closed');
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Fulqrom Hub API running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;