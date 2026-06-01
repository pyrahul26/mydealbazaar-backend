
const jwt = require('jsonwebtoken')


const signAccessToken = (userId, role = 'user') =>
  jwt.sign(
    { id: userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  )


const signRefreshToken = (userId) =>
  jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '90d' }
  )


const verifyToken = (token, secret = process.env.JWT_SECRET) =>
  jwt.verify(token, secret)


const decodeToken = (token) => jwt.decode(token)

module.exports = { signAccessToken, signRefreshToken, verifyToken, decodeToken }
