const rateLimit = require('express-rate-limit')
const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000

const handler = (req, res) =>
  res.status(429).json({
    success: false,
    statusCode: 429,
    message: 'Too many requests — please slow down and try again later.',
  })
const apiLimiter = rateLimit({
  windowMs,
  max: Number(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
})
const authLimiter = rateLimit({
  windowMs,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: undefined,
  handler: (req, res) =>
    res.status(429).json({
      success: false,
      statusCode: 429,
      message: 'Too many login attempts — please wait 15 minutes before trying again.',
    }),
})

module.exports = { apiLimiter, authLimiter }
