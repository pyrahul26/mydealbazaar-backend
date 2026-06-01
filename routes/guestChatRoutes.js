


const express = require('express')
const router = express.Router()
const Product = require('../models/Product')
const { processMessage } = require('../negotiation/chatbot')

const ensureSessionState = (req) => {
  if (!req.session.negotiation) req.session.negotiation = {}
  if (!req.session.cart) req.session.cart = {}
}

router.post('/:productId', async (req, res) => {
  try {
    const { productId } = req.params
    const { message } = req.body

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message is required' })
    }

    const product = await Product.findById(productId)
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' })
    }

    ensureSessionState(req)

    const currentState = req.session.negotiation[productId] || {
      attempts_count: 0,
      lastCounter: null,
      dealDone: false,
      negotiatedPrice: null,
    }

    const result = processMessage(message, product.toObject(), currentState)
    req.session.negotiation[productId] = result.sessionUpdate

    if (result.dealDone && result.negotiatedPrice) {
      const basePrice = product.originalPrice ?? product.price ?? 0
      req.session.cart[productId] = {
        productId,
        name: product.name,
        image: product.image,
        price: basePrice,
        originalPrice: basePrice,
        mrp: product.mrp ?? null,
        negotiatedPrice: result.negotiatedPrice,
        savedAmount: basePrice - result.negotiatedPrice,
      }
    }

    return res.json({
      success: true,
      response: result.response,
      intent: result.intent,
      dealDone: result.dealDone,
      negotiatedPrice: result.negotiatedPrice,
      product: {
        name: product.name,
        price: product.originalPrice ?? product.price,
        originalPrice: product.originalPrice ?? product.price,
        mrp: product.mrp ?? null,
        min_price: product.min_price,
        image: product.image,
      }
    })
  } catch (err) {
    console.error('[Guest Chat Error]', err)
    res.status(500).json({ success: false, error: 'Server error' })
  }
})

router.get('/:productId/state', (req, res) => {
  const { productId } = req.params
  const state = req.session.negotiation?.[productId] || {
    attempts_count: 0,
    lastCounter: null,
    dealDone: false,
    negotiatedPrice: null,
  }
  res.json({ success: true, productId, state })
})

router.delete('/:productId/reset', (req, res) => {
  const { productId } = req.params
  if (req.session.negotiation) delete req.session.negotiation[productId]
  if (req.session.cart) delete req.session.cart[productId]
  res.json({ success: true, message: 'Negotiation reset' })
})

module.exports = router