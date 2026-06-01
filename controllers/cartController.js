



'use strict'

const { Cart } = require('../models/Wishlist')
const Product = require('../models/Product')
const NegotiationSession = require('../models/NegotiationSession')
const { success, error } = require('../utils/apiResponse')
const { asyncHandler } = require('../middleware/errorHandler')
const logger = require('../utils/logger')

const PROMOS = {
  MyDealBazaar10: { discount: 10, type: 'percent', message: '10% discount applied!' },
  FLAT200: { discount: 200, type: 'flat', message: '₹200 flat discount applied!' },
  WELCOME: { discount: 15, type: 'percent', message: 'Welcome! 15% off your order.' },
  SAVE50: { discount: 50, type: 'flat', message: '₹50 off on your cart!' },
}


const formatCart = (cart) => {
  const items = cart.items.map(item => {
    const basePrice = item.originalPrice ?? item.price ?? item.mrp ?? 0
    const effectivePrice = item.negotiatedPrice != null ? item.negotiatedPrice : basePrice
    return {
      key: item.key,
      product: item.product,
      name: item.name,
      image: item.image,
      size: item.size,
      color: item.color,
      qty: item.qty,
      price: item.price ?? basePrice,
      originalPrice: item.originalPrice ?? item.price ?? basePrice,
      mrp: item.mrp ?? null,
      negotiatedPrice: item.negotiatedPrice,
      is_price_locked: item.is_price_locked || item.priceLocked || false,
      effectivePrice,
      priceLocked: item.priceLocked || item.is_price_locked || false,
      savedAmount: item.savedAmount || 0,
      negotiationSessionId: item.negotiationSessionId || null,
      lineTotal: +(effectivePrice * item.qty).toFixed(2),
    }
  })
  const subtotal = +items.reduce((s, i) => s + i.effectivePrice * i.qty, 0).toFixed(2)
  const shipping = subtotal >= 1999 ? 0 : 199
  const tax = +Math.round(subtotal * 0.05).toFixed(2)
  const discount = cart.discount || 0
  const total = +(subtotal + shipping + tax - discount).toFixed(2)
  return {
    items, subtotal, shipping, tax, discount, total,
    itemCount: items.reduce((s, i) => s + i.qty, 0),
    promoCode: cart.promoCode || '',
    negotiation: {
      hasNegotiatedItems: items.some(i => i.negotiatedPrice != null),
      totalNegotiationSavings: +items.reduce((s, i) => s + (i.savedAmount || 0) * i.qty, 0).toFixed(2),
      lockedItemCount: items.filter(i => i.priceLocked).length,
    },
  }
}


exports.getCart = asyncHandler(async (req, res) => {
  const cart = await Cart.getOrCreate(req.user._id)
  res.json(success({ cart: formatCart(cart) }, 'Cart fetched.'))
})


exports.addToCart = asyncHandler(async (req, res) => {
  const { productId, size, color, qty = 1 } = req.body
  const product = await Product.findOne({ _id: productId, isActive: true })
  if (!product) return res.status(404).json(error('Product not found.', 404))
  if (!product.inStock) return res.status(400).json(error('Product is out of stock.', 400))

  const cart = await Cart.getOrCreate(req.user._id)
  const rSize = size || product.sizes[0] || ''
  const rColor = color || product.colors[0] || ''
  const key = `${productId}-${rSize}-${rColor}`

  const existing = cart.items.find(i => i.key === key)
  if (existing) {
    existing.qty += Number(qty)
  } else {
    cart.items.push({
      product: productId, key,
      name: product.name, image: product.image,
      price: product.originalPrice ?? product.min_price ?? 0,
      originalPrice: product.originalPrice ?? product.min_price ?? 0,
      mrp: product.mrp || null,
      size: rSize, color: rColor, qty: Number(qty),
      negotiatedPrice: null, negotiationSessionId: null, priceLocked: false, is_price_locked: false, savedAmount: 0,
    })
  }
  await cart.save()
  await cart.populate('items.product', 'name image price inStock min_price')
  logger.info(`[Cart] added: ${product.name} user=${req.user._id}`)
  res.status(200).json(success({ cart: formatCart(cart) }, `"${product.name}" added to cart.`))
})


exports.updateCartItem = asyncHandler(async (req, res) => {
  const { qty } = req.body
  const itemKey = decodeURIComponent(req.params.key)
  const cart = await Cart.findOne({ user: req.user._id })
  if (!cart) return res.status(404).json(error('Cart not found.', 404))
  const item = cart.items.find(i => i.key === itemKey)
  if (!item) return res.status(404).json(error('Item not found.', 404))
  if (Number(qty) <= 0) cart.items = cart.items.filter(i => i.key !== itemKey)
  else item.qty = Number(qty)
  await cart.save()
  await cart.populate('items.product', 'name image price inStock')
  res.json(success({ cart: formatCart(cart) }, 'Cart updated.'))
})


exports.removeFromCart = asyncHandler(async (req, res) => {
  const itemKey = decodeURIComponent(req.params.key)
  const cart = await Cart.findOne({ user: req.user._id })
  if (!cart) return res.status(404).json(error('Cart not found.', 404))
  cart.items = cart.items.filter(i => i.key !== itemKey)
  await cart.save()
  await cart.populate('items.product', 'name image price inStock')
  res.json(success({ cart: formatCart(cart) }, 'Item removed.'))
})


exports.clearCart = asyncHandler(async (req, res) => {
  await Cart.findOneAndUpdate({ user: req.user._id }, { items: [], promoCode: '', discount: 0 })
  res.json(success({ cart: { items: [], subtotal: 0, shipping: 0, tax: 0, discount: 0, total: 0, itemCount: 0, negotiation: { hasNegotiatedItems: false, totalNegotiationSavings: 0 } } }, 'Cart cleared.'))
})


exports.syncCart = asyncHandler(async (req, res) => {
  const { items = [] } = req.body
  const cart = await Cart.getOrCreate(req.user._id)
  for (const g of items) {
    const product = await Product.findOne({ _id: g.productId, isActive: true, inStock: true })
    if (!product) continue
    const rSize = g.size || product.sizes[0] || ''
    const rColor = g.color || product.colors[0] || ''
    const key = `${g.productId}-${rSize}-${rColor}`
    const ex = cart.items.find(i => i.key === key)
    if (ex) ex.qty += Number(g.qty) || 1
    else cart.items.push({ product: g.productId, key, name: product.name, image: product.image, price: product.originalPrice ?? product.min_price ?? 0, originalPrice: product.originalPrice ?? product.min_price ?? 0, mrp: product.mrp || null, size: rSize, color: rColor, qty: Number(g.qty) || 1, negotiatedPrice: null, negotiationSessionId: null, priceLocked: false, is_price_locked: false, savedAmount: 0 })
  }
  await cart.save()
  await cart.populate('items.product', 'name image price inStock')
  res.json(success({ cart: formatCart(cart) }, 'Cart synced.'))
})


exports.applyPromo = asyncHandler(async (req, res) => {
  const code = (req.body.code || '').trim().toUpperCase()
  const promo = PROMOS[code]
  if (!promo) return res.status(400).json(error('Invalid or expired promo code.', 400))
  const cart = await Cart.findOne({ user: req.user._id })
  if (!cart || cart.items.length === 0) return res.status(400).json(error('Cart is empty.', 400))
  const effSub = cart.items.reduce((s, i) => s + (i.negotiatedPrice ?? i.price ?? i.originalPrice ?? 0) * i.qty, 0)
  cart.promoCode = code
  cart.discount = promo.type === 'percent' ? +Math.round(effSub * promo.discount / 100).toFixed(2) : Math.min(promo.discount, effSub)
  await cart.save()
  await cart.populate('items.product', 'name image price inStock')
  res.json(success({ cart: formatCart(cart), promoDiscount: cart.discount, message: promo.message }, promo.message))
})






exports.applyNegotiatedPrice = asyncHandler(async (req, res) => {
  const itemKey = decodeURIComponent(req.params.itemKey)
  const { negotiationSessionId, negotiatedPrice } = req.body

  const cart = await Cart.findOne({ user: req.user._id })
  if (!cart) return res.status(404).json(error('Cart not found.', 404))

  const item = cart.items.find(i => i.key === itemKey)
  if (!item) return res.status(404).json(error('Cart item not found.', 404))

  const listedPrice = item.price ?? item.originalPrice ?? item.mrp ?? 0
  let lockedPrice = listedPrice

  if (negotiatedPrice != null) {
    const parsedNegotiatedPrice = Number(negotiatedPrice)
    if (!Number.isFinite(parsedNegotiatedPrice) || parsedNegotiatedPrice <= 0) {
      return res.status(400).json(error('negotiatedPrice must be a positive number.', 400))
    }

    const product = await Product.findOne({ _id: item.product, isActive: true })
    const minPrice = product?.min_price ?? null
    if (minPrice != null && parsedNegotiatedPrice < minPrice) {
      return res.status(400).json(error(`Price must be at least ₹${minPrice.toLocaleString('en-IN')}.`, 400))
    }
    if (parsedNegotiatedPrice > listedPrice) {
      return res.status(400).json(error('Negotiated price cannot exceed the listed price.', 400))
    }

    item.negotiatedPrice = parsedNegotiatedPrice
    item.negotiationSessionId = null
    item.priceLocked = true
    item.is_price_locked = true
    item.price = parsedNegotiatedPrice
    item.originalPrice = item.originalPrice ?? listedPrice
    item.savedAmount = +(listedPrice - parsedNegotiatedPrice).toFixed(2)
    lockedPrice = parsedNegotiatedPrice
  } else {
    if (!negotiationSessionId) {
      return res.status(400).json(error('negotiationSessionId or negotiatedPrice is required.', 400))
    }


    const session = await NegotiationSession.findOne({
      _id: negotiationSessionId,
      user: req.user._id,
      state: 'ACCEPTED',
    })
    if (!session) {
      return res.status(404).json(error('Accepted negotiation session not found.', 404))
    }
    if (!session.finalPrice || session.finalPrice <= 0) {
      return res.status(400).json(error('Session has no valid final price.', 400))
    }


    if (item.product?.toString() !== session.product?.toString()) {
      return res.status(400).json(error('Negotiation session does not match this cart item.', 400))
    }


    if (item.priceLocked && item.negotiationSessionId?.toString() === negotiationSessionId) {
      return res.json(success({ cart: formatCart(cart) }, 'Price already locked.'))
    }

    item.negotiatedPrice = session.finalPrice
    item.negotiationSessionId = session._id
    item.priceLocked = true
    item.is_price_locked = true
    item.price = session.finalPrice
    item.originalPrice = item.originalPrice ?? listedPrice
    item.savedAmount = +(listedPrice - session.finalPrice).toFixed(2)
    lockedPrice = session.finalPrice
  }

  await cart.save()
  await cart.populate('items.product', 'name image price inStock')

  const totalSavings = +(item.savedAmount * item.qty).toFixed(2)
  logger.info(`[Cart] price locked: ${item.name} ₹${listedPrice}→₹${lockedPrice} saved=₹${totalSavings}`)

  res.json(success({
    cart: formatCart(cart),
    product_id: item.product,
    final_price: lockedPrice,
    status: 'accepted',
    lockedItem: {
      key: item.key,
      name: item.name,
      listedPrice,
      negotiatedPrice: lockedPrice,
      savedAmount: item.savedAmount,
      totalSavings,
    },
  }, `Price locked at ₹${lockedPrice.toLocaleString('en-IN')} — you saved ₹${totalSavings.toLocaleString('en-IN')}! 🎉`))
})





exports.removeNegotiatedPrice = asyncHandler(async (req, res) => {
  const itemKey = decodeURIComponent(req.params.itemKey)
  const cart = await Cart.findOne({ user: req.user._id })
  if (!cart) return res.status(404).json(error('Cart not found.', 404))
  const item = cart.items.find(i => i.key === itemKey)
  if (!item) return res.status(404).json(error('Cart item not found.', 404))
  const restoredPrice = item.originalPrice ?? item.price
  item.negotiatedPrice = null; item.negotiationSessionId = null
  item.priceLocked = false; item.is_price_locked = false; item.price = restoredPrice; item.savedAmount = 0
  await cart.save()
  await cart.populate('items.product', 'name image price inStock')
  res.json(success({ cart: formatCart(cart) }, 'Negotiated price removed.'))
})


exports.getCartSummary = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id })
  if (!cart || !cart.items.length) {
    return res.json(success({ summary: { itemCount: 0, subtotal: 0, shipping: 0, tax: 0, total: 0 } }, 'Cart empty.'))
  }
  const f = formatCart(cart)
  res.json(success({ summary: { itemCount: f.itemCount, subtotal: f.subtotal, shipping: f.shipping, tax: f.tax, discount: f.discount, total: f.total, promoCode: f.promoCode, ...f.negotiation } }, 'Cart summary.'))
})
