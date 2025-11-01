const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const http = require('http');
require('dotenv').config();

const errorHandler = require('./middleware/errorHandler');
const authenticate = require('./middleware/authMiddleware');
const authorize = require('./middleware/authorizationMiddleware');
const { tenantContext } = require('./middleware/tenantContext');
const { registerRoutes, getEndpointDocs } = require('./config/routes.config');
const { asyncLocalStorage } = require('./utils/requestContext');
const { attachETag, parseIfMatch } = require('./middleware/etagVersion');
const { optionalCSRF } = require('./middleware/csrf');
const { initializeSocketIO } = require('./utils/socketManager');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 30001;
const MONGODB_URI = process.env.MONGODB_CONNECTION;

// Security middleware - Hardened Helmet configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for admin UI
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", process.env.CLIENT_URL || 'http://localhost:8080'],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  frameguard: {
    action: 'deny'
  },
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  }
}));
app.use(compression());

// Cookie parser (required for session cookies)
app.use(cookieParser(process.env.COOKIE_SECRET || 'fallback-secret-change-in-production'));

// CORS configuration - Hardened for production with credentials support
app.use(cors({
  origin: function (origin, callback) {
    // In production, strictly validate origins
    if (process.env.NODE_ENV === 'production') {
      const allowedOrigins = [
        process.env.CLIENT_URL,
        'https://hub.ravenlabs.biz'
      ].filter(Boolean); // Remove undefined
      
      if (!origin) {
        // Allow server-to-server calls (no Origin header)
        return callback(null, true);
      }
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.error('⛔ CORS blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    } else {
      // Development: more permissive
      const allowedOrigins = [
        process.env.CLIENT_URL || 'http://localhost:8080',
        'http://localhost:8080',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:3001',
        'https://hub.ravenlabs.biz'
      ];
      
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log('⚠️  CORS blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true, // Required for cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', // Keep for legacy Bearer during migration
    'Accept',
    'x-csrf-token', // Required for CSRF protection
    'x-user-id',
    'x-tenant-id',
    'x-requested-with',
    'If-Match', // Required for optimistic concurrency
    'If-None-Match'
  ],
  exposedHeaders: ['x-user-id', 'x-tenant-id', 'ETag'], // Expose ETag for OCC
  optionsSuccessStatus: 200,
  preflightContinue: false,
  maxAge: 86400 // Cache preflight for 24 hours
}));

// Handle preflight requests explicitly
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, x-user-id, x-tenant-id, x-requested-with');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// Wrap all requests in AsyncLocalStorage context for tenant isolation
// CRITICAL: This must wrap the entire request-response cycle
app.use((req, res, next) => {
  // Create a new ALS context for each request and maintain it throughout the entire request-response cycle
  asyncLocalStorage.run({}, () => {
    // Ensure the context persists until the response is finished
    const originalEnd = res.end;
    const originalSend = res.send;
    const originalJson = res.json;

    // Wrap response methods to ensure they execute within the ALS context
    res.end = function(...args) {
      return originalEnd.apply(this, args);
    };

    res.send = function(...args) {
      return originalSend.apply(this, args);
    };

    res.json = function(...args) {
      return originalJson.apply(this, args);
    };

    // Call next() to continue the middleware chain within this ALS context
    next();
  });
});

// Body parsing middleware
// Important: Do NOT parse multipart/form-data here - let multer handle it in routes
// Skip JSON parsing for multipart requests to avoid parsing errors
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  // Skip JSON parsing if content-type suggests multipart or if body contains multipart boundary
  if (contentType.includes('multipart/form-data') || req.headers['content-type']?.includes('boundary')) {
    return next();
  }
  express.json({ limit: '1mb' })(req, res, next); // Reduced from 10mb for security
});
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health check endpoint (no authentication required)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Fulqrom Hub API',
    version: '1.0.0'
  });
});

// Apply middleware chain to all API routes (order matters!)
// 1. ETag parsing (for If-Match header on writes)
app.use('/api', parseIfMatch);

// 2. Authentication (session or Bearer)
app.use('/api', authenticate);

// 3. Tenant context (sets ALS tenant context)
app.use('/api', tenantContext);

// 4. CSRF protection (optional during migration)
app.use('/api', optionalCSRF);

// 5. Authorization (permission checks)
app.use('/api', authorize);

// 6. ETag attachment (on responses)
app.use('/api', attachETag);

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

// Apply global plugins to all schemas
const optimisticConcurrencyPlugin = require('./plugins/optimisticConcurrencyPlugin');
mongoose.plugin(optimisticConcurrencyPlugin); // Enable OCC globally for all schemas

// Database connection
mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('✓ Database connected successfully');
    console.log('✓ Optimistic Concurrency Control enabled globally');
    
    // Load all action hooks (must be after DB connection, before routes)
    require('./hooks');
    
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

// Start server (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, async () => {
    console.log(`✓ Server is running on port ${PORT}`);
    
    // Initialize Socket.IO after server starts
    initializeSocketIO(server);
  });
}

module.exports = app;