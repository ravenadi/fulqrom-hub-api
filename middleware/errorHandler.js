const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  console.error('Error Handler:', err.name, err.message);

  // Auth0 JWT Bearer errors
  if (err.name === 'InvalidRequestError') {
    const message = 'Authorization token is missing or invalid. Please include a valid Bearer token in the Authorization header.';
    return res.status(401).json({
      success: false,
      message,
      ...(process.env.NODE_ENV === 'development' && {
        stack: err.stack,
        originalError: err.message
      })
    });
  }

  if (err.name === 'UnauthorizedError' || err.status === 401) {
    const message = 'Invalid or expired token';
    return res.status(401).json({
      success: false,
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { message, statusCode: 404 };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error = { message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = { message, statusCode: 400 };
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;