'use strict'

const mongoose = require('mongoose')

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, required: true, trim: true },
    offer: { type: Number, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
)

const chatNegotiationSchema = new mongoose.Schema(
  {
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    original_price: { type: Number, required: true, min: 0 },
    seller_min_price: { type: Number, required: true, min: 0 },

    attempts_count: { type: Number, default: 0, min: 0, max: 3 },
    max_attempts: { type: Number, default: 3 },

    last_user_price: { type: Number, default: null },
    last_bot_price: { type: Number, default: null },
    final_price: { type: Number, default: null },

    status: {
      type: String,
      enum: ['negotiating', 'accepted', 'rejected'],
      default: 'negotiating',
      index: true,
    },
    is_price_locked: {
      type: Boolean,
      default: false,
      index: true,
    },

    messages: [messageSchema],
  },
  {
    timestamps: true,
    collection: 'negotiations',
  }
)

chatNegotiationSchema.index({ user_id: 1, product_id: 1 }, { unique: true })
chatNegotiationSchema.index({ createdAt: -1 })

module.exports = mongoose.model('ChatNegotiation', chatNegotiationSchema)
