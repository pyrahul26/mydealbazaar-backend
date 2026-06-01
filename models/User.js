const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, default: 'Home', trim: true },
    fullName: { type: String, required: [true, 'Full name for delivery is required'], trim: true },
    phone: { type: String, required: [true, 'Phone number is required'], trim: true },
    line1: { type: String, required: [true, 'Address line 1 is required'], trim: true },
    line2: { type: String, default: '', trim: true },
    city: { type: String, required: [true, 'City is required'], trim: true },
    state: { type: String, required: [true, 'State is required'], trim: true },
    pin: { type: String, required: [true, 'PIN code is required'], trim: true },
    country: { type: String, default: 'India', trim: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true, timestamps: false }
)


const userSchema = new mongoose.Schema(
  {

    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [80, 'Name cannot exceed 80 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Enter a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    phone: {
      type: String,
      default: '',
      trim: true,
    },
    avatar: {
      type: String,
      default: '',
    },
    gender: {
      type: String,
      enum: ['male', 'female'],
      default: 'male',
    },


    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    isEmailVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },


    addresses: [addressSchema],


    preferences: {
      newsletter: { type: Boolean, default: true },
      smsAlerts: { type: Boolean, default: false },
      currency: { type: String, default: 'INR' },
    },


    totalOrders: { type: Number, default: 0, min: 0 },
    totalSpent: { type: Number, default: 0, min: 0 },


    lastLoginAt: { type: Date },
    passwordChangedAt: { type: Date },
    emailVerifyToken: { type: String, select: false },
    emailVerifyExpiry: { type: Date, select: false },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpiry: { type: Date, select: false },
    refreshToken: { type: String, select: false },
  },
  {
    timestamps: true,
    collection: 'userinfo',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)





userSchema.index({ createdAt: -1 })
userSchema.index({ role: 1, isActive: 1 })






userSchema.virtual('memberTier').get(function () {
  if (this.totalSpent >= 50000) return 'Platinum'
  if (this.totalSpent >= 20000) return 'Gold'
  if (this.totalSpent >= 5000) return 'Silver'
  return 'Bronze'
})


userSchema.virtual('defaultAddress').get(function () {
  const addresses = Array.isArray(this.addresses) ? this.addresses : []
  return addresses.find(a => a.isDefault) || addresses[0] || null
})





userSchema.pre('save', async function (next) {

  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 12)
  this.passwordChangedAt = new Date(Date.now() - 1000)
  next()
})


userSchema.pre('save', function (next) {
  const addresses = Array.isArray(this.addresses) ? this.addresses : []
  const defaults = addresses.filter(a => a.isDefault)
  if (defaults.length > 1) {

    addresses.forEach((a, i) => {
      a.isDefault = i === addresses.length - 1
    })
  }

  if (defaults.length === 0 && addresses.length > 0) {
    addresses[0].isDefault = true
  }
  next()
})





userSchema.methods.matchPassword = function (plainText) {
  return bcrypt.compare(plainText, this.password)
}

userSchema.methods.passwordChangedAfter = function (jwtIssuedAt) {
  if (!this.passwordChangedAt) return false
  return Math.floor(this.passwordChangedAt.getTime() / 1000) > jwtIssuedAt
}


userSchema.methods.recordOrder = async function (orderTotal) {
  this.totalOrders += 1
  this.totalSpent += orderTotal
  return this.save()
}






userSchema.statics.publicFields = function () {
  return 'name email phone avatar gender role addresses totalOrders totalSpent createdAt'
}

module.exports = mongoose.model('User', userSchema)
