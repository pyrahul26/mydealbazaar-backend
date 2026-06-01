'use strict'
const mongoose = require('mongoose')


const webhookEventSchema = new mongoose.Schema(
  {
    event: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed },
    receivedAt: { type: Date, default: Date.now },
    processed: { type: Boolean, default: false },
  },
  { _id: false }
)


const paymentSchema = new mongoose.Schema(
  {

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
      alias: 'userId',
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
      index: true,
      alias: 'orderId',
    },


    razorpayOrderId: {
      type: String,
      required: true,

    },
    razorpayPaymentId: {
      type: String,
      default: null,
      alias: 'paymentId',

    },
    razorpaySignature: {
      type: String,
      default: null,
    },
    razorpayRefundId: {
      type: String,
      default: null,
    },


    amountInPaise: { type: Number, required: true, min: 0 },
    amountInRupees: { type: Number, required: true, min: 0, alias: 'amount' },
    currency: { type: String, default: 'INR' },


    status: {
      type: String,
      enum: ['initiated', 'pending', 'captured', 'failed', 'refund_initiated', 'refunded'],
      default: 'initiated',
      index: true,
      alias: 'paymentStatus',
    },


    method: { type: String, default: '', alias: 'paymentMethod' },
    bank: { type: String, default: '' },
    wallet: { type: String, default: '' },
    vpa: { type: String, default: '' },
    cardLast4: { type: String, default: '' },
    cardNetwork: { type: String, default: '' },



    cartSnapshot: {
      items: { type: mongoose.Schema.Types.Mixed },
      subtotal: { type: Number },
      shipping: { type: Number },
      tax: { type: Number },
      discount: { type: Number },
      total: { type: Number },
      promoCode: { type: String, default: '' },
    },


    deliveryAddress: { type: mongoose.Schema.Types.Mixed },


    initiatedAt: { type: Date, default: Date.now },
    capturedAt: { type: Date },
    failedAt: { type: Date },
    refundedAt: { type: Date },


    failureReason: { type: String, default: '' },
    failureCode: { type: String, default: '' },


    refundAmountInRupees: { type: Number, default: 0 },
    refundReason: { type: String, default: '' },


    webhookEvents: [webhookEventSchema],


    receiptId: { type: String, default: '' },


    isMock: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: 'payments',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)


paymentSchema.index({ razorpayOrderId: 1 }, { unique: true })
paymentSchema.index({ razorpayPaymentId: 1 }, { sparse: true })
paymentSchema.index({ user: 1, createdAt: -1 })
paymentSchema.index({ status: 1, createdAt: -1 })


paymentSchema.virtual('isSuccessful').get(function () {
  return this.status === 'captured'
})

paymentSchema.virtual('isFailed').get(function () {
  return this.status === 'failed'
})

module.exports = mongoose.model('Payment', paymentSchema)
