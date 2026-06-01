
const User = require('../models/User')
const { signAccessToken,
  signRefreshToken,
  verifyToken } = require('../utils/jwt')
const { success, error } = require('../utils/apiResponse')
const { asyncHandler } = require('../middleware/errorHandler')
const logger = require('../utils/logger')
const cloudinary = require('../Cloudinary/cloudinary')
const streamifier = require('streamifier')

const uploadToCloudinary = (fileBuffer) => new Promise((resolve, reject) => {
  const uploadStream = cloudinary.uploader.upload_stream(
    {
      folder: 'MyDealBazaar/avatars',
      resource_type: 'image',
      transformation: [
        { width: 400, height: 400, crop: 'fill', gravity: 'face' },
        { quality: 'auto', fetch_format: 'auto' },
      ],
    },
    (err, result) => {
      if (err) return reject(err)
      resolve(result)
    }
  )

  streamifier.createReadStream(fileBuffer).pipe(uploadStream)
})


const sendTokens = (res, user, statusCode = 200, message = 'Success') => {
  const accessToken = signAccessToken(user._id, user.role)
  const refreshToken = signRefreshToken(user._id)


  const profile = {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatar: user.avatar,
    gender: user.gender,
    role: user.role,
    addresses: user.addresses,
    joined: user.createdAt?.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
  }

  return res.status(statusCode).json(
    success({ user: profile, accessToken, refreshToken }, message, statusCode)
  )
}




exports.signup = asyncHandler(async (req, res) => {
  const { name, password, gender, phone } = req.body
  const email = String(req.body.email || '').trim().toLowerCase()

  const existing = await User.findOne({ email })
  if (existing) {
    return res.status(409).json(error('An account with this email already exists.', 409))
  }

  const user = await User.create({ name, email, password, gender, phone })
  logger.info(`New user registered: ${email}`)

  sendTokens(res, user, 201, 'Account created successfully.')
})




exports.login = asyncHandler(async (req, res) => {
  const { password } = req.body
  const email = String(req.body.email || '').trim().toLowerCase()


  const user = await User.findOne({ email }).select('+password +isActive')

  if (!user || !(await user.matchPassword(password))) {
    return res.status(401).json(error('Incorrect email or password.', 401))
  }

  if (!user.isActive) {
    return res.status(403).json(error('This account has been deactivated.', 403))
  }


  await User.findByIdAndUpdate(user._id, { lastLoginAt: new Date() })
  logger.info(`User logged in: ${email}`)

  sendTokens(res, user, 200, 'Logged in successfully.')
})




exports.logout = asyncHandler(async (req, res) => {

  await User.findByIdAndUpdate(req.user._id, { refreshToken: '' })
  res.json(success({}, 'Logged out successfully.'))
})





exports.refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body
  if (!refreshToken) {
    return res.status(400).json(error('Refresh token is required.', 400))
  }

  let decoded
  try {
    decoded = verifyToken(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET)
  } catch {
    return res.status(401).json(error('Invalid or expired refresh token.', 401))
  }

  const user = await User.findById(decoded.id).select('+isActive')
  if (!user || !user.isActive) {
    return res.status(401).json(error('User not found.', 401))
  }

  const newAccessToken = signAccessToken(user._id, user.role)
  res.json(success({ accessToken: newAccessToken }, 'Token refreshed.'))
})




exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
  if (!user) return res.status(404).json(error('User not found.', 404))

  res.json(success({
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      gender: user.gender,
      role: user.role,
      addresses: user.addresses,
      joined: user.createdAt?.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    }
  }, 'User fetched.'))
})





exports.updateProfile = asyncHandler(async (req, res) => {
  const allowed = ['name', 'phone', 'gender']
  const updates = {}
  allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f] })

  if (req.file?.buffer) {
    const uploaded = await uploadToCloudinary(req.file.buffer)
    updates.avatar = uploaded.secure_url
  }

  const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true, runValidators: true })
  res.json(success({
    user: {
      _id: user._id, name: user.name, email: user.email,
      phone: user.phone, avatar: user.avatar, gender: user.gender, role: user.role,
      addresses: user.addresses,
    }
  }, 'Profile updated.'))
})




exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body

  const user = await User.findById(req.user._id).select('+password')
  if (!(await user.matchPassword(currentPassword))) {
    return res.status(401).json(error('Current password is incorrect.', 401))
  }

  user.password = newPassword
  await user.save()

  logger.info(`Password changed for: ${user.email}`)
  sendTokens(res, user, 200, 'Password changed. Please use your new credentials.')
})





exports.addAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)


  if (req.body.isDefault) {
    user.addresses.forEach(a => { a.isDefault = false })
  }

  if (user.addresses.length === 0) req.body.isDefault = true

  user.addresses.push(req.body)
  await user.save()

  res.status(201).json(success({ addresses: user.addresses }, 'Address added.', 201))
})




exports.deleteAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
  user.addresses = user.addresses.filter(a => a._id.toString() !== req.params.addressId)
  await user.save()
  res.json(success({ addresses: user.addresses }, 'Address removed.'))
})
