const mongoose = require('mongoose')
const orderItemSchema = new mongoose.Schema(
  {

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
    },

    name: { type: String, required: true },
    image: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, default: null },
    size: { type: String, default: '' },
    color: { type: String, default: '' },
    sku: { type: String, default: '' },
    qty: { type: Number, required: true, min: 1 },
    category: { type: String, default: '' },
    negotiatedPrice: { type: Number, default: null },
    negotiationSessionId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { _id: false }
)


const deliveryAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    line1: { type: String, required: true },
    line2: { type: String, default: '' },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pin: { type: String, required: true },
    country: { type: String, default: 'India' },
  },
  { _id: false }
)


const statusEventSchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    message: { type: String, default: '' },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
)


const paymentSchema = new mongoose.Schema(
  {
    method: {
      type: String,
      enum: ['card', 'upi', 'netbank', 'cod', 'wallet', 'razorpay'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    transactionId: { type: String, default: '' },
    gateway: { type: String, default: '' },
    paidAt: { type: Date },
    refundedAt: { type: Date },
    refundId: { type: String, default: '' },
  },
  { _id: false }
)


const orderSchema = new mongoose.Schema(
  {

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],

    },

    orderNumber: {
      type: String,

    },


    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: v => Array.isArray(v) && v.length > 0,
        message: 'Order must contain at least one item',
      },
    },


    deliveryAddress: {
      type: deliveryAddressSchema,
      required: [true, 'Delivery address is required'],
    },


    payment: {
      type: paymentSchema,
      required: true,
    },


    subtotal: { type: Number, required: true, min: 0 },
    shippingCost: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    promoCode: { type: String, default: '' },


    status: {
      type: String,
      enum: ['Processing', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled', 'Returned'],
      default: 'Processing',
      index: true,
    },
    statusHistory: [statusEventSchema],

    cancelReason: { type: String, default: '' },
    trackingNumber: { type: String, default: '' },
    courierPartner: { type: String, default: '' },
    estimatedDelivery: { type: Date },
    deliveredAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'orderinfo',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)




orderSchema.index({ createdAt: -1 })
orderSchema.index({ user: 1, status: 1 })
orderSchema.index({ user: 1, createdAt: -1 })
orderSchema.index({ 'payment.status': 1 })
orderSchema.index({ orderNumber: 1 }, { unique: true })





orderSchema.pre('save', async function (next) {

  if (this.isNew && !this.orderNumber) {
    const count = await mongoose.model('Order').countDocuments()
    this.orderNumber = `SH-${String(20001 + count).padStart(5, '0')}`
  }


  if (this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      message: `Status changed to ${this.status}`,
      at: new Date(),
    })
  }


  if (this.status === 'Delivered' && this.payment.method === 'cod') {
    this.payment.status = 'paid'
    this.payment.paidAt = new Date()
  }

  next()
})





orderSchema.virtual('itemCount').get(function () {
  const items = Array.isArray(this.items) ? this.items : []
  return items.reduce((s, i) => s + (Number(i.qty) || 0), 0)
})

orderSchema.virtual('isPaid').get(function () {
  return this.payment?.status === 'paid'
})

orderSchema.virtual('isCancellable').get(function () {
  return ['Processing', 'Confirmed'].includes(this.status)
})

orderSchema.virtual('isReturnable').get(function () {
  if (this.status !== 'Delivered' || !this.deliveredAt) return false
  const days = (Date.now() - this.deliveredAt.getTime()) / 86400000
  return days <= 30
})






orderSchema.statics.getRevenueStats = function () {
  return this.aggregate([
    { $match: { 'payment.status': 'paid' } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
        revenue: { $sum: '$total' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ])
}

module.exports = mongoose.model('Order', orderSchema)
