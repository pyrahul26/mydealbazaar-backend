


const express = require('express')
const router = express.Router()
const Product = require('../models/Product')

const ensureCart = (req) => {
  if (!req.session.cart) req.session.cart = {}
}

router.get('/', (req, res) => {
  const cart = req.session.cart || {}
  const items = Object.values(cart)

  const total = items.reduce((sum, item) => sum + Number(item.negotiatedPrice ?? item.price ?? item.originalPrice ?? 0), 0)
  const originalTotal = items.reduce((sum, item) => sum + Number(item.originalPrice ?? item.price ?? 0), 0)

  res.json({
    success: true,
    cart: items,
    summary: {
      itemCount: items.length,
      total,
      originalTotal,
      totalSaved: originalTotal - total,
    },
  })
})

router.post('/:productId', async (req, res) => {
  try {
    const { productId } = req.params

    const product = await Product.findById(productId)
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' })

    ensureCart(req)

    const existing = req.session.cart[productId]
    if (existing) {
      return res.json({ success: true, message: 'Already in cart', cart: req.session.cart[productId] })
    }

    req.session.cart[productId] = {
      productId,
      name: product.name,
      image: product.image,
      price: product.originalPrice ?? product.min_price ?? 0,
      originalPrice: product.originalPrice,
      mrp: product.mrp,
      negotiatedPrice: product.originalPrice ?? product.min_price ?? 0,
      savedAmount: 0,
    }

    res.json({ success: true, message: 'Added to cart', cart: req.session.cart[productId] })
  } catch (err) {
    console.error('[Guest Cart Error]', err)
    res.status(500).json({ success: false, error: 'Server error' })
  }
})

router.patch('/:productId/apply-negotiation', (req, res) => {
  const { productId } = req.params

  const negoState = req.session.negotiation?.[productId]
  if (!negoState || !negoState.dealDone || !negoState.negotiatedPrice) {
    return res.status(400).json({
      success: false,
      error: 'No completed negotiation found for this product',
    })
  }

  if (!req.session.cart?.[productId]) {
    return res.status(400).json({
      success: false,
      error: 'Product not in cart. Add to cart first.',
    })
  }

  const item = req.session.cart[productId]
  const priorListed = item.negotiatedPrice ?? item.originalPrice ?? item.price ?? product.originalPrice ?? product.min_price
  item.negotiatedPrice = negoState.negotiatedPrice
  item.savedAmount = priorListed - negoState.negotiatedPrice

  res.json({
    success: true,
    message: 'Negotiated price applied to cart',
    cartItem: item,
  })
})

router.delete('/:productId', (req, res) => {
  const { productId } = req.params
  if (req.session.cart) delete req.session.cart[productId]
  res.json({ success: true, message: 'Removed from cart' })
})

router.delete('/', (req, res) => {
  req.session.cart = {}
  res.json({ success: true, message: 'Cart cleared' })
})

module.exports = router