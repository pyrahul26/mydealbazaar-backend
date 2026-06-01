const User = require('../models/User')
const { verifyToken } = require('../utils/jwt')
const { error } = require('../utils/apiResponse')
const logger = require('../utils/logger')

const protect = async (req, res, next) => {
  try {

    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).json(error('No token provided — please sign in.', 401))
    }
    const token = auth.split(' ')[1]


    let decoded
    try {
      decoded = verifyToken(token)
    } catch (err) {
      const msg = err.name === 'TokenExpiredError'
        ? 'Session expired — please sign in again.'
        : 'Invalid token — please sign in again.'
      return res.status(401).json(error(msg, 401))
    }


    const user = await User.findById(decoded.id).select('+passwordChangedAt +isActive')
    if (!user) {
      return res.status(401).json(error('User account no longer exists.', 401))
    }


    if (!user.isActive) {
      return res.status(403).json(error('Account has been deactivated.', 403))
    }


    if (user.passwordChangedAfter(decoded.iat)) {
      return res.status(401).json(error('Password was recently changed — please sign in again.', 401))
    }


req.user = user
req.tokenIat = decoded.iat
next() } catch (err) {
    logger.error(`[protect middleware] ${err.message}`)
    return res.status(500).json(error('Authentication error.', 500))
  }
}
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json(error('Access denied — admin privileges required.', 403))
  }
  next()
}
const optionalAuth = async (req, res, next) => {
  try {
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) return next()

    const decoded = verifyToken(auth.split(' ')[1])
    const user = await User.findById(decoded.id).select('+isActive')
    if (user?.isActive) req.user = user
  } catch (_) { }
  next()
}

module.exports = { protect, adminOnly, optionalAuth }
