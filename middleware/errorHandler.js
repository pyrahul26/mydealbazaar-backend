const logger = require('../utils/logger')
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next)

const notFound = (req, res, next) => {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`)
  err.status = 404
  next(err)
}

const globalErrorHandler = (err, req, res, next) => {
  let statusCode = err.status || err.statusCode || 500
  let message = err.message || 'Internal Server Error'


  if (err.name === 'ValidationError') {
    statusCode = 400
    message = Object.values(err.errors).map(e => e.message).join(', ')
  }


  if (err.code === 11000) {
    statusCode = 409
    const field = Object.keys(err.keyValue)[0]
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} is already registered.`
  }


  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 400
    message = `Invalid ID format: ${err.value}`
  }


  if (err.name === 'JsonWebTokenError') { statusCode = 401; message = 'Invalid token.' }
  if (err.name === 'TokenExpiredError') { statusCode = 401; message = 'Token has expired.' }


  if (statusCode >= 500) {
    logger.error(`[${req.method}] ${req.originalUrl} → ${statusCode}: ${message}`, {
      stack: err.stack,
      body: req.body,
    })
  }

  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  })
}

module.exports = { asyncHandler, notFound, globalErrorHandler }
