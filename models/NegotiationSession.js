const mongoose = require('mongoose')


const offerSchema = new mongoose.Schema(
  {
    round: { type: Number, required: true },
    amount: { type: Number, required: true, min: 0 },
    role: { type: String, enum: ['buyer', 'seller'], required: true },
    zone: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
)


const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    offerAmount: { type: Number, default: null },
  },
  { _id: false }
)


const pricingSnapshotSchema = new mongoose.Schema(
  {
    listedPrice: { type: Number },
    baseMinPrice: { type: Number },
    dynamicFloor: { type: Number },
    hardFloor: { type: Number },
    flexibilityPercent: { type: Number },
    factors: {
      time: { type: Number },
      demand: { type: Number },
      stock: { type: Number },
      timeOfDay: { type: Number },
      seasonal: { type: Number },
      combined: { type: Number },
    },
    computedAt: { type: Date, default: Date.now },
  },
  { _id: false }
)


const negotiationSessionSchema = new mongoose.Schema(
  {

    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },


    state: {
      type: String,
      enum: ['OPEN', 'ACTIVE', 'ACCEPTED', 'REJECTED', 'EXPIRED'],
      default: 'OPEN',
      index: true,
    },
    round: { type: Number, default: 0, min: 0 },
    maxRounds: { type: Number, default: 3 },


    listedPrice: { type: Number, required: true },
    baseMinPrice: { type: Number, required: true },
    finalPrice: { type: Number, default: null },
    lastSellerCounter: { type: Number, default: null },
    rejectionReason: { type: String, default: '' },


    pricingSnapshot: pricingSnapshotSchema,


    offers: [offerSchema],


    messages: [messageSchema],


    demandData: {
      views: { type: Number, default: 0 },
      wishlistCount: { type: Number, default: 0 },
      recentOrders: { type: Number, default: 0 },
    },


    finalSavingsAmount: { type: Number, default: null },
    finalSavingsPercent: { type: Number, default: null },
    durationSeconds: { type: Number, default: null },
    aiProvider: { type: String, default: 'openai' },
    aiModel: { type: String, default: 'gpt-4o' },


    expiresAt: { type: Date, index: { expires: 0 } },
  },
  {
    timestamps: true,
    collection: 'negotiationsessions',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)


negotiationSessionSchema.index({ user: 1, product: 1 })
negotiationSessionSchema.index({ state: 1, createdAt: -1 })
negotiationSessionSchema.index({ createdAt: -1 })


negotiationSessionSchema.virtual('isComplete').get(function () {
  return ['ACCEPTED', 'REJECTED', 'EXPIRED'].includes(this.state)
})

negotiationSessionSchema.virtual('roundsLeft').get(function () {
  return Math.max(0, this.maxRounds - this.round)
})


negotiationSessionSchema.pre('save', function (next) {
  if (this.isNew && !this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  }

  if (this.finalPrice && this.listedPrice && !this.finalSavingsAmount) {
    this.finalSavingsAmount = +(this.listedPrice - this.finalPrice).toFixed(2)
    this.finalSavingsPercent = +((1 - this.finalPrice / this.listedPrice) * 100).toFixed(1)
  }
  next()
})

module.exports = mongoose.model('NegotiationSession', negotiationSessionSchema)
