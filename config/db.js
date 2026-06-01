const mongoose = require('mongoose')
const logger = require('../utils/logger')

const OPTIONS = {
  serverSelectionTimeoutMS: 5_000,
  socketTimeoutMS: 45_000,
  maxPoolSize: 10,
  minPoolSize: 2,
}


const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, OPTIONS)
    logger.info(`✅  MongoDB connected → ${conn.connection.host} / ${conn.connection.name}`)
  } catch (err) {
    logger.error(`❌  MongoDB initial connection failed: ${err.message}`)
    process.exit(1)
  }
}


mongoose.connection.on('disconnected', () =>
  logger.warn('⚠️   MongoDB disconnected — attempting reconnect…')
)

mongoose.connection.on('reconnected', () =>
  logger.info('✅  MongoDB reconnected')
)

mongoose.connection.on('error', (err) =>
  logger.error(`MongoDB runtime error: ${err.message}`)
)


const gracefulClose = async (signal) => {
  logger.info(`${signal} received — closing MongoDB connection…`)
  await mongoose.connection.close()
  logger.info('MongoDB connection closed. Exiting.')
  process.exit(0)
}

process.on('SIGINT', () => gracefulClose('SIGINT'))
process.on('SIGTERM', () => gracefulClose('SIGTERM'))

module.exports = connectDB
