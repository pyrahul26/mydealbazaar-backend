
const winston = require('winston')
const path    = require('path')

const { combine, timestamp, printf, colorize, errors } = winston.format

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack }) =>
    stack
      ? `${timestamp} ${level}: ${message}\n${stack}`
      : `${timestamp} ${level}: ${message}`
  )
)

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  winston.format.json()
)

const logger = winston.createLogger({
  level:     process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
  format:    process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console(),
    ...(process.env.NODE_ENV === 'production' ? [
      new winston.transports.File({ filename: path.join(__dirname, '../logs/error.log'),  level: 'error' }),
      new winston.transports.File({ filename: path.join(__dirname, '../logs/combined.log') }),
    ] : []),
  ],
})

module.exports = logger
