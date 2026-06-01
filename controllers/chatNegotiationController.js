'use strict'

const Product = require('../models/Product')
const ChatNegotiation = require('../models/ChatNegotiation')
const { Cart } = require('../models/Wishlist')
const { success, error } = require('../utils/apiResponse')
const { asyncHandler } = require('../middleware/errorHandler')
const {
  extractPriceFromMessage,
  calculateCounterOffer,
} = require('../utils/chatNegotiationPricing')
const {
  isAcceptanceMessage,
  isRejectionMessage,
  buildCounterResponse,
  buildNoPriceResponse,
  buildDealAcceptedResponse,
  buildDealRejectedResponse,
  buildWaitingConfirmationResponse,
} = require('../utils/chatNegotiationResponses')

const resolveProductPricing = (product) => {
  const original_price = Number(
    product.original_price ??
    product.originalPrice ??
    product.price ??
    product.min_price ??
    0
  )

  const configuredMin = Number(
    product.seller_min_price ??
    product.min_price ??
    original_price
  )



  const fallbackDrop = Math.max(50, Math.round(original_price * 0.08))
  const fallbackMin = Math.max(1, original_price - fallbackDrop)

  const seller_min_price = Number.isFinite(configuredMin) && configuredMin > 0 && configuredMin < original_price
    ? configuredMin
    : fallbackMin

  return {
    original_price: Math.round(original_price),
    seller_min_price: Math.round(Math.min(seller_min_price, original_price)),
  }
}

const getOrCreateNegotiation = async ({ userId, product }) => {
  let negotiation = await ChatNegotiation.findOne({
    user_id: userId,
    product_id: product._id,
  })

  if (!negotiation) {
    const pricing = resolveProductPricing(product)
    negotiation = await ChatNegotiation.create({
      user_id: userId,
      product_id: product._id,
      original_price: pricing.original_price,
      seller_min_price: pricing.seller_min_price,
      attempts_count: 0,
      max_attempts: 3,
      status: 'negotiating',
      is_price_locked: false,
      messages: [],
    })
  } else if (negotiation.max_attempts !== 3) {
    negotiation.max_attempts = 3
    negotiation.attempts_count = Math.min(Number(negotiation.attempts_count || 0), 3)
    await negotiation.save()
  }


  if (!negotiation.is_price_locked && negotiation.status === 'negotiating') {
    const pricing = resolveProductPricing(product)
    const needsPricingSync =
      Number(negotiation.original_price) !== pricing.original_price ||
      Number(negotiation.seller_min_price) >= Number(negotiation.original_price)

    if (needsPricingSync) {
      negotiation.original_price = pricing.original_price
      negotiation.seller_min_price = pricing.seller_min_price
      if (negotiation.last_bot_price != null) {
        negotiation.last_bot_price = Math.min(Number(negotiation.last_bot_price), pricing.original_price)
      }
      await negotiation.save()
    }
  }

  return negotiation
}

const updateCartWithNegotiatedPrice = async ({ userId, product, finalPrice, itemKey }) => {
  const cart = await Cart.getOrCreate(userId)
  let item = null

  if (itemKey) {
    item = cart.items.find(i => i.key === itemKey)
  }

  if (!item) {
    item = cart.items.find(i => i.product?.toString() === product._id.toString())
  }

  if (!item) {
    return null
  }

  const listedPrice = Number(item.originalPrice ?? item.price ?? item.min_price ?? product.originalPrice ?? product.min_price)
  item.originalPrice = item.originalPrice ?? listedPrice
  item.price = finalPrice
  item.negotiatedPrice = finalPrice
  item.priceLocked = true
  item.is_price_locked = true
  item.savedAmount = +(listedPrice - finalPrice).toFixed(2)

  await cart.save()
  return { cart, item }
}


exports.startSession = asyncHandler(async (req, res) => {
  const { productId } = req.params
  const userId = req.user._id

  const product = await Product.findOne({ _id: productId, isActive: true })
  if (!product) return res.status(404).json(error('Product not found.', 404))

  const negotiation = await getOrCreateNegotiation({ userId, product })

  if (negotiation.is_price_locked || negotiation.status === 'accepted') {
    return res.status(409).json(error('Price already locked for this product. Re-negotiation is not allowed.', 409))
  }

  const openingMessage = negotiation.messages?.length
    ? negotiation.messages[negotiation.messages.length - 1].text
    : `Let’s negotiate ${product.name}. Share your best price offer.`

  return res.json(success({
    product_id: product._id,
    status: negotiation.status,
    attempts_count: negotiation.attempts_count,
    max_attempts: negotiation.max_attempts,
    final_price: negotiation.final_price,
    session: {
      _id: negotiation._id,
      user_id: negotiation.user_id,
      product_id: negotiation.product_id,
      attempts_count: negotiation.attempts_count,
      max_attempts: negotiation.max_attempts,
      last_bot_price: negotiation.last_bot_price,
      final_price: negotiation.final_price,
      status: negotiation.status,
      is_price_locked: negotiation.is_price_locked,
    },
    message: openingMessage,
  }, 'Negotiation session ready.'))
})


exports.processChatMessage = asyncHandler(async (req, res) => {
  const { productId } = req.params
  const { message = '', itemKey = '' } = req.body
  const userId = req.user._id

  const product = await Product.findOne({ _id: productId, isActive: true })
  if (!product) return res.status(404).json(error('Product not found.', 404))

  const cart = await Cart.getOrCreate(userId)
  const lockedItem = cart.items.find(i =>
    i.product?.toString() === product._id.toString() && (i.priceLocked || i.is_price_locked)
  )
  if (lockedItem) {
    return res.status(409).json(error('Price already locked for this product. Re-negotiation is not allowed.', 409))
  }

  const negotiation = await getOrCreateNegotiation({ userId, product })

  if (negotiation.is_price_locked || negotiation.status === 'accepted') {
    return res.status(409).json(error('Price already locked for this product. Re-negotiation is not allowed.', 409))
  }

  const text = String(message).trim()

  const resolveAcceptedPrice = () => negotiation.final_price ?? negotiation.last_bot_price ?? negotiation.original_price ?? product.originalPrice ?? product.min_price




  if (isAcceptanceMessage(text)) {
    const acceptedPrice = resolveAcceptedPrice()

    negotiation.attempts_count = Math.min(negotiation.max_attempts, Math.max(1, negotiation.attempts_count))
    negotiation.final_price = acceptedPrice
    negotiation.status = 'accepted'
    negotiation.is_price_locked = true
    negotiation.messages.push({ role: 'user', text })
    negotiation.messages.push({ role: 'assistant', text: buildDealAcceptedResponse(acceptedPrice) })

    const updated = await updateCartWithNegotiatedPrice({
      userId,
      product,
      finalPrice: acceptedPrice,
      itemKey,
    })

    await negotiation.save()

    return res.json(success({
      product_id: product._id,
      final_price: acceptedPrice,
      status: 'accepted',
      cart_updated: Boolean(updated),
    }, 'Deal accepted.'))
  }


  if (negotiation.attempts_count >= negotiation.max_attempts && negotiation.final_price != null) {
    if (isRejectionMessage(text)) {
      negotiation.status = 'rejected'
      negotiation.messages.push({ role: 'user', text })
      negotiation.messages.push({ role: 'assistant', text: buildDealRejectedResponse(negotiation.original_price) })
      await negotiation.save()

      return res.json(success({
        status: negotiation.status,
        final_price: null,
        attempts_count: negotiation.attempts_count,
        botMessage: buildDealRejectedResponse(negotiation.original_price),
      }, 'Negotiation rejected.'))
    }

    return res.json(success({
      status: negotiation.status,
      final_price: negotiation.final_price,
      attempts_count: negotiation.attempts_count,
      botMessage: buildWaitingConfirmationResponse(negotiation.final_price),
    }, 'Waiting for confirmation.'))
  }

  const offeredPrice = extractPriceFromMessage(text)
  if (!offeredPrice) {
    negotiation.messages.push({ role: 'user', text })
    negotiation.messages.push({ role: 'assistant', text: buildNoPriceResponse() })
    await negotiation.save()

    return res.status(400).json(error(buildNoPriceResponse(), 400))
  }


  const currentPrice = negotiation.last_bot_price ?? negotiation.original_price ?? product.originalPrice ?? product.min_price


  if (offeredPrice >= currentPrice) {
    negotiation.attempts_count = Math.min(negotiation.max_attempts, negotiation.attempts_count + 1)
    negotiation.final_price = offeredPrice
    negotiation.status = 'accepted'
    negotiation.is_price_locked = true
    negotiation.messages.push({ role: 'user', text, offer: offeredPrice })
    negotiation.messages.push({ role: 'assistant', text: buildDealAcceptedResponse(offeredPrice) })

    const updated = await updateCartWithNegotiatedPrice({ userId, product, finalPrice: offeredPrice, itemKey })

    await negotiation.save()
    return res.json(success({
      product_id: product._id,
      final_price: offeredPrice,
      status: 'accepted',
      cart_updated: Boolean(updated),
    }, 'Deal accepted.'))
  }


  if (negotiation.attempts_count >= negotiation.max_attempts) {
    negotiation.final_price = negotiation.last_bot_price ?? negotiation.final_price ?? currentPrice
    negotiation.status = 'negotiating'
    negotiation.is_price_locked = false
    await negotiation.save()

    return res.json(success({
      product_id: product._id,
      final_price: negotiation.final_price,
      status: 'negotiating',
      attempts_count: negotiation.attempts_count,
      attempts_left: 0,
      botMessage: buildWaitingConfirmationResponse(negotiation.final_price),
      requires_confirmation: true,
    }, 'Maximum negotiation attempts reached.'))
  }

  const attemptNumber = Math.min(negotiation.max_attempts, negotiation.attempts_count + 1)
  const botCounterPrice = calculateCounterOffer({
    originalPrice: negotiation.original_price,
    sellerMinPrice: negotiation.seller_min_price,
    userOffer: offeredPrice,
    attempt: attemptNumber,
    maxAttempts: negotiation.max_attempts,
    previousBotPrice: negotiation.last_bot_price,
  })

  negotiation.attempts_count = attemptNumber
  negotiation.last_user_price = offeredPrice
  negotiation.last_bot_price = botCounterPrice
  negotiation.status = 'negotiating'
  negotiation.messages.push({ role: 'user', text, offer: offeredPrice })


  if (attemptNumber === negotiation.max_attempts) {
    negotiation.final_price = botCounterPrice
  }

  const botMessage = buildCounterResponse(botCounterPrice, attemptNumber, negotiation.max_attempts)
  negotiation.messages.push({ role: 'assistant', text: botMessage, offer: botCounterPrice })
  await negotiation.save()

  return res.json(success({
    product_id: product._id,
    offeredPrice,
    counterPrice: botCounterPrice,
    attempts_count: negotiation.attempts_count,
    max_attempts: negotiation.max_attempts,
    attempts_left: Math.max(0, negotiation.max_attempts - negotiation.attempts_count),
    final_price: negotiation.final_price,
    status: negotiation.status,
    botMessage,
    requires_confirmation: attemptNumber === negotiation.max_attempts,
  }, 'Negotiation response generated.'))
})


exports.getSession = asyncHandler(async (req, res) => {
  const negotiation = await ChatNegotiation.findOne({
    user_id: req.user._id,
    product_id: req.params.productId,
    status: { $in: ['negotiating', 'accepted', 'rejected'] },
  }).sort({ updatedAt: -1 })

  if (!negotiation) {
    return res.status(404).json(error('Negotiation session not found.', 404))
  }

  res.json(success({
    session: negotiation,
  }, 'Negotiation session fetched.'))
})


exports.resetSession = asyncHandler(async (req, res) => {
  await ChatNegotiation.deleteMany({
    user_id: req.user._id,
    product_id: req.params.productId,
    status: 'negotiating',
  })

  res.json(success({}, 'Negotiation reset.'))
})
