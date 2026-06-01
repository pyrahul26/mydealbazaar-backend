'use strict'
require('dotenv').config()
const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const compression = require('compression')
const morgan = require('morgan')
const session = require('express-session')
const mongoSanitize = require('express-mongo-sanitize')
const connectDB = require('./config/db')
const logger = require('./utils/logger')
const { apiLimiter } = require('./middleware/rateLimiter')
const { notFound, globalErrorHandler } = require('./middleware/errorHandler')
const authRoutes = require('./routes/authRoutes')
const productRoutes = require('./routes/productRoutes')
const cartRoutes = require('./routes/cartRoutes')
const wishlistRoutes = require('./routes/wishlistRoutes')
const orderRoutes = require('./routes/orderRoutes')
const negotiationRoutes = require('./routes/negotiationRoutes')
const chatNegotiationRoutes = require('./routes/chatNegotiationRoutes')
const paymentRoutes = require('./routes/paymentRoutes')
const guestChatRoutes = require('./routes/guestChatRoutes')
const guestCartRoutes = require('./routes/guestCartRoutes')
const adminRoutes = require('./routes/adminRoutes')


connectDB()
const app = express()

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}))
const allowedOrigins = [
  ...(process.env.CLIENT_URLS ? process.env.CLIENT_URLS.split(',') : [process.env.CLIENT_URL || 'http://localhost:5173']),
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5000',
  process.env.PRODUCTION_CLIENT_URL || '',
].map((o) => (o || '').trim()).filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)

    // Allow explicit origins or Netlify deployments (subdomains of netlify.app)
    if (allowedOrigins.includes(origin) || origin.endsWith('.netlify.app')) {
      return callback(null, true)
    }

    callback(new Error(`CORS blocked: origin "${origin}" not allowed.`))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Total-Count', 'X-Pages'],
}))

app.use(mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    logger.warn(`Sanitized field "${key}" from ${req.ip}`)
  },
}))

app.use(compression())
app.use((req, res, next) => {
  if (req.path === '/api/payment/webhook') return next()
  next()
})
app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: true, limit: '10kb' }))
app.use(session({
  secret: process.env.SESSION_SECRET || 'MyDealBazaar_session_secret',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
  },
}))

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'))
} else {

  app.use(morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
    skip: (req) => req.url === '/api/health',
  }))
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
    database: require('mongoose').connection.readyState === 1 ? 'connected' : 'disconnected',
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/products', productRoutes)
app.use('/api/cart', cartRoutes)
app.use('/api/wishlist', wishlistRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/negotiate', negotiationRoutes)
app.use('/api/ai-negotiate', chatNegotiationRoutes)
app.use('/api/chat', guestChatRoutes)
app.use('/api/guest-cart', guestCartRoutes)

app.use('/api/payment', paymentRoutes)
app.use('/api/admin', adminRoutes)


app.get('/', (req, res) => {
  res.json({
    name: 'MyDealBazaar E-Commerce API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: 'GET  /api/health',
      auth: 'POST /api/auth/signup | /api/auth/login',
      products: 'GET  /api/products',
      cart: 'GET  /api/cart         (auth required)',
      wishlist: 'GET  /api/wishlist     (auth required)',
      orders: 'GET  /api/orders       (auth required)',
      negotiate: 'POST /api/negotiate/:id/start (auth required)',
      aiNegotiate: 'POST /api/ai-negotiate/:productId/message (auth required)',
      payment: 'POST /api/payment/create-order | /api/payment/verify-payment',
      chat: 'POST /api/chat/:productId (public session chat)',
      guestCart: 'GET  /api/guest-cart    (public session cart)',
    },
  })
})

app.use(notFound)
app.use(globalErrorHandler)

let server = null
const startServer = () => {
  const PORT = Number(process.env.PORT) || 1300

  const tryListen = (startPort, attemptsLeft) => {
    const p = startPort
    server = app.listen(p)

    server.once('listening', () => {
      logger.info(`🚀  Server running in ${process.env.NODE_ENV} mode on port ${p}`)
      logger.info(`📡  API base: http://localhost:${p}/api`)
    })

    server.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE' && attemptsLeft > 0) {
        logger.warn(`Port ${p} is in use — trying port ${p + 1}...`)
        setTimeout(() => tryListen(p + 1, attemptsLeft - 1), 200)
      } else if (err && err.code === 'EADDRINUSE') {
        logger.error(`Port ${p} is in use and no more retries left. Exiting.`)
        process.exit(1)
      } else {
        logger.error('HTTP server error:', err)
        process.exit(1)
      }
    })
  }

  tryListen(PORT, 9)
}

if (require.main === module) startServer()
const gracefulShutdown = (signal) => {
  logger.info(`\n${signal} received — starting graceful shutdown…`)

  server.close(async (err) => {
    if (err) {
      logger.error('Error closing HTTP server:', err)
      process.exit(1)
    }

    try {
      await require('mongoose').connection.close()
      logger.info('✅  MongoDB connection closed')
      logger.info('✅  HTTP server closed — process exiting cleanly')
      process.exit(0)
    } catch (dbErr) {
      logger.error('Error closing MongoDB connection:', dbErr)
      process.exit(1)
    }
  })


  setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit')
    process.exit(1)
  }, 15_000).unref()
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', reason)

  if (process.env.NODE_ENV !== 'production') process.exit(1)
})
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err)
  process.exit(1)
})

module.exports = app
