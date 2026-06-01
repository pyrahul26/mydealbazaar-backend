'use strict'
const OpenAI = require('openai')
const Product = require('../models/Product')
const NegotiationSession = require('../models/NegotiationSession')
const { Cart } = require('../models/Wishlist')
const { computeDynamicFloor } = require('../negotiation/dynamicPricing')
const { evaluateOffer, buildSummary, STATE, MAX_ROUNDS } = require('../negotiation/negotiationEngine')
const {
  buildConversationMessages,
  buildOfferExtractionPrompt,
  buildGreetingMessages,
} = require('../negotiation/promptDesigner')
const { success, error } = require('../utils/apiResponse')
const { asyncHandler } = require('../middleware/errorHandler')
const logger = require('../utils/logger')


let openaiClient = null
function getOpenAI() {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      logger.warn('[Negotiation] OPENAI_API_KEY not set — running in demo mode')
      return null
    }
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}


async function callOpenAI(messages, fallbackMessage) {
  const ai = getOpenAI()
  if (!ai) return fallbackMessage

  try {
    const res = await ai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages,
      max_tokens: 200,
      temperature: 0.7,
      top_p: 0.9,
    })
    return res.choices[0]?.message?.content?.trim() || fallbackMessage
  } catch (err) {
    logger.error(`[OpenAI] ${err.message}`)
    return fallbackMessage
  }
}


async function extractOffer(buyerMessage, listedPrice) {
  const ai = getOpenAI()
  if (!ai) {

    const match = buyerMessage.match(/[\d,]+(\.\d+)?k?/i)
    if (!match) return null
    let val = parseFloat(match[0].replace(/,/g, ''))
    if (match[0].toLowerCase().endsWith('k')) val *= 1000
    return isNaN(val) ? null : Math.round(val)
  }

  try {
    const { buildOfferExtractionPrompt } = require('../negotiation/promptDesigner')
    const messages = buildOfferExtractionPrompt(buyerMessage, listedPrice)
    const res = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 60,
      temperature: 0,
      response_format: { type: 'json_object' },
    })
    const parsed = JSON.parse(res.choices[0]?.message?.content || '{}')
    return parsed.hasOffer ? parsed.offer : null
  } catch (err) {
    logger.warn(`[OpenAI extract] ${err.message}`)
    return null
  }
}

async function updateCartWithNegotiatedPrice({ userId, product, finalPrice, itemKey, sessionId = null }) {
  const cart = await Cart.getOrCreate(userId)
  let item = null

  if (itemKey) {
    item = cart.items.find(i => i.key === itemKey)
  }

  if (!item) {
    item = cart.items.find(i => i.product?.toString() === product._id.toString())
  }

  if (!item) return null

  const listedPrice = Number(item.originalPrice ?? item.price ?? item.min_price ?? product.originalPrice ?? product.min_price ?? finalPrice)
  item.originalPrice = listedPrice
  item.price = finalPrice
  item.negotiatedPrice = finalPrice
  item.negotiationSessionId = sessionId
  item.priceLocked = true
  item.is_price_locked = true
  item.savedAmount = +(listedPrice - finalPrice).toFixed(2)

  await cart.save()
  return cart
}





exports.startSession = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.productId, isActive: true })
  if (!product) return res.status(404).json(error('Product not found.', 404))


  const existing = await NegotiationSession.findOne({
    user: req.user._id,
    product: product._id,
    state: { $in: ['OPEN', 'ACTIVE'] },
  })
  if (existing) {
    return res.json(success({
      session: existing,
      isExisting: true,
      message: 'You already have an active negotiation for this product.',
    }, 'Existing session found.'))
  }


  const demandData = await fetchDemandData(product._id)


  const breakdown = computeDynamicFloor(product, demandData)


  const greetingMessages = buildGreetingMessages(product, breakdown)
  const listingPrice = product.originalPrice ?? product.price ?? 0
  const minimumPrice = product.min_price ?? listingPrice
  const greetingText = await callOpenAI(greetingMessages,
    `Hi! 👋 You're negotiating for ${product.name}, listed at ₹${listingPrice.toLocaleString('en-IN')}. ` +
    `I can negotiate down to ₹${minimumPrice.toLocaleString('en-IN')}. What's your best offer?`
  )


  const session = await NegotiationSession.create({
    user: req.user._id,
    product: product._id,
    state: STATE.OPEN,
    round: 0,
    listedPrice: product.originalPrice ?? product.price ?? product.min_price ?? 0,
    baseMinPrice: product.min_price ?? minimumPrice,
    demandData,
    pricingSnapshot: {
      listedPrice: breakdown.listedPrice,
      baseMinPrice: breakdown.baseMinPrice,
      dynamicFloor: breakdown.dynamicFloor,
      hardFloor: breakdown.hardFloor,
      flexibilityPercent: breakdown.flexibilityPercent,
      factors: breakdown.factors,
    },
    messages: [
      { role: 'assistant', content: greetingText },
    ],
  })

  logger.info(`[Negotiate] Session started: ${session._id} for product ${product.name}`)

  res.status(201).json(success({
    session: {
      _id: session._id,
      state: session.state,
      round: session.round,
      maxRounds: session.maxRounds,
      listedPrice: session.listedPrice,
      baseMinPrice: session.baseMinPrice,
    },
    message: greetingText,
    product: {
      _id: product._id,
      name: product.name,
      price: product.originalPrice ?? product.price ?? product.min_price ?? 0,
      minPrice: minimumPrice,
      image: product.image,
    },
  }, 'Negotiation started.', 201))
})






exports.submitOffer = asyncHandler(async (req, res) => {
  const { message: buyerMessage, offerAmount, itemKey = '' } = req.body

  if (!buyerMessage?.trim()) {
    return res.status(400).json(error('Message is required.', 400))
  }


  const session = await NegotiationSession.findOne({
    _id: req.params.sessionId,
    user: req.user._id,
  })
  if (!session) return res.status(404).json(error('Session not found.', 404))
  if (session.state === STATE.ACCEPTED) return res.status(400).json(error('This negotiation is already accepted.', 400))
  if (session.state === STATE.REJECTED) return res.status(400).json(error('This negotiation has ended.', 400))
  if (session.state === STATE.EXPIRED) return res.status(400).json(error('This session has expired.', 400))


  const product = await Product.findById(session.product)
  if (!product) return res.status(404).json(error('Product no longer available.', 404))

  const text = String(buyerMessage).trim()


  if (session.finalPrice != null && session.state === STATE.ACTIVE) {
    if (/(\bdeal\b|\bdone\b|\bbuy\b|\bconfirm\b|\byes\b|\bok\b|\bokay\b|\bthik\s*hai\b)/i.test(text)) {
      session.state = STATE.ACCEPTED
      session.messages.push({ role: 'user', content: text })
      session.messages.push({
        role: 'assistant',
        content: `Great! Deal confirmed at ₹${session.finalPrice.toLocaleString('en-IN')}. I have updated your cart with this negotiated price.`,
      })

      await session.save()

      await updateCartWithNegotiatedPrice({
        userId: req.user._id,
        product,
        finalPrice: session.finalPrice,
        itemKey,
        sessionId: session._id,
      })

      return res.json(success({
        message: `Great! Deal confirmed at ₹${session.finalPrice.toLocaleString('en-IN')}. I have updated your cart with this negotiated price.`,
        product_id: product._id,
        final_price: session.finalPrice,
        status: 'accepted',
        decision: 'ACCEPT',
        zone: 'CONFIRMATION',
        counterPrice: null,
        roundsLeft: 0,
        session: {
          _id: session._id,
          state: session.state,
          round: session.round,
        },
        summary: buildSummary(session, {
          breakdown: session.pricingSnapshot,
          finalPrice: session.finalPrice,
          decision: 'ACCEPT',
        }),
      }, 'Deal accepted.'))
    }

    session.state = STATE.REJECTED
    session.messages.push({ role: 'user', content: text })
    session.messages.push({
      role: 'assistant',
      content: `Sorry, I cannot reduce further. The product remains at ₹${session.listedPrice.toLocaleString('en-IN')}.`,
    })
    await session.save()

    return res.json(success({
      message: `Sorry, I cannot reduce further. The product remains at ₹${session.listedPrice.toLocaleString('en-IN')}.`,
      status: 'rejected',
      decision: 'REJECT',
      zone: 'CONFIRMATION',
      counterPrice: null,
      roundsLeft: 0,
      session: {
        _id: session._id,
        state: session.state,
        round: session.round,
      },
    }, 'Negotiation rejected.'))
  }


  let offeredPrice = offerAmount
  if (!offeredPrice) {
    offeredPrice = await extractOffer(text, session.listedPrice)
  }
  if (!offeredPrice || isNaN(offeredPrice) || offeredPrice <= 0) {

    const chatMessages = [
      ...session.messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
      {
        role: 'system', content: `[DIRECTIVE] The buyer hasn't made a specific offer yet.
        Acknowledge their message warmly and ask them to name their price.
        Remind them the product is ₹${session.listedPrice.toLocaleString('en-IN')}.
        Keep it to 1-2 sentences.` },
    ]
    const aiReply = await callOpenAI(chatMessages,
      `Sure! Just name your best price for the ${product.name} and we'll see what we can do!`
    )
    session.messages.push({ role: 'user', content: text })
    session.messages.push({ role: 'assistant', content: aiReply })
    await session.save()

    return res.json(success({ message: aiReply, sessionId: session._id, expectsOffer: true }, 'Awaiting offer.'))
  }

  offeredPrice = Math.round(offeredPrice)


  const breakdown = computeDynamicFloor(product, session.demandData)


  const engineResult = evaluateOffer(
    { ...session.toObject(), offers: session.offers },
    offeredPrice,
    product,
    session.demandData
  )


  const aiMessages = buildConversationMessages(
    product,
    breakdown,
    session.messages.map(m => ({ role: m.role, content: m.content })),
    text,
    offeredPrice,
    engineResult,
    session.round
  )
  const aiReply = await callOpenAI(aiMessages, engineResult.message)


  session.messages.push({ role: 'user', content: text, offerAmount: offeredPrice })
  session.messages.push({ role: 'assistant', content: aiReply })

  session.offers.push({
    round: session.round + 1,
    amount: offeredPrice,
    role: 'buyer',
    zone: engineResult.zone,
  })

  if (engineResult.counterPrice) {
    session.offers.push({
      round: session.round + 1,
      amount: engineResult.counterPrice,
      role: 'seller',
      zone: engineResult.zone,
    })
    session.lastSellerCounter = engineResult.counterPrice
  }

  session.round += 1
  Object.assign(session, engineResult.sessionUpdate || {})

  if (engineResult.finalPrice) {
    session.finalPrice = engineResult.finalPrice
    session.durationSeconds = Math.round((Date.now() - session.createdAt.getTime()) / 1000)
  }

  await session.save()

  const summary = buildSummary(session, engineResult)

  logger.info(`[Negotiate] Round ${session.round}: user offered ₹${offeredPrice} → seller counter ₹${engineResult.counterPrice || 'ACCEPT'} (zone: ${engineResult.zone})`)

  res.json(success({
    message: aiReply,
    decision: engineResult.decision,
    status: engineResult.decision === 'ACCEPT' ? 'accepted' : engineResult.decision === 'REJECT' ? 'rejected' : 'pending',
    zone: engineResult.zone,
    counterPrice: engineResult.counterPrice,
    finalPrice: engineResult.finalPrice,
    roundsLeft: Math.max(0, MAX_ROUNDS - session.round),
    session: {
      _id: session._id,
      state: session.state,
      round: session.round,
    },
    summary: engineResult.decision !== 'COUNTER' ? summary : undefined,
  }, 'Offer processed.'))
})





exports.getSession = asyncHandler(async (req, res) => {
  const session = await NegotiationSession.findOne({
    _id: req.params.sessionId,
    user: req.user._id,
  }).populate('product', 'name price min_price image category')

  if (!session) return res.status(404).json(error('Session not found.', 404))

  res.json(success({
    session: {
      _id: session._id,
      state: session.state,
      round: session.round,
      maxRounds: session.maxRounds,
      roundsLeft: session.roundsLeft,
      listedPrice: session.listedPrice,
      finalPrice: session.finalPrice,
      lastCounter: session.lastSellerCounter,
      product: session.product,
      offers: session.offers,
      messages: session.messages.filter(m => m.role !== 'system'),
      pricingSnapshot: session.pricingSnapshot,
      createdAt: session.createdAt,
    },
  }, 'Session fetched.'))
})





exports.getUserHistory = asyncHandler(async (req, res) => {
  const sessions = await NegotiationSession.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate('product', 'name price image')
    .select('-messages -offers -pricingSnapshot')

  res.json(success({ sessions, count: sessions.length }, 'Negotiation history.'))
})






exports.getFloorPreview = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.productId, isActive: true })
  if (!product) return res.status(404).json(error('Product not found.', 404))

  const demandData = await fetchDemandData(product._id)
  const breakdown = computeDynamicFloor(product, demandData)


  const approxSavingsPercent = Math.floor(breakdown.flexibilityPercent * 0.7)

  res.json(success({
    listedPrice: breakdown.listedPrice,
    negotiable: breakdown.flexibilityPercent > 2,
    approxSavingsRange: `up to ${approxSavingsPercent}%`,
    demandLabel: breakdown.flexibilityPercent < 5 ? 'High demand' : 'Some flexibility available',
  }, 'Price preview.'))
})




exports.getAdminStats = asyncHandler(async (req, res) => {
  const [total, accepted, rejected, avgSavings] = await Promise.all([
    NegotiationSession.countDocuments(),
    NegotiationSession.countDocuments({ state: 'ACCEPTED' }),
    NegotiationSession.countDocuments({ state: 'REJECTED' }),
    NegotiationSession.aggregate([
      { $match: { state: 'ACCEPTED', finalSavingsPercent: { $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: '$finalSavingsPercent' }, total: { $sum: '$finalSavingsAmount' } } },
    ]),
  ])

  res.json(success({
    stats: {
      total,
      accepted,
      rejected,
      acceptanceRate: total > 0 ? +((accepted / total) * 100).toFixed(1) : 0,
      avgSavingsPercent: avgSavings[0]?.avg?.toFixed(1) || '0',
      totalDiscountGiven: avgSavings[0]?.total || 0,
    },
  }, 'Negotiation stats.'))
})




async function fetchDemandData(productId) {
  try {
    const Order = require('../models/Order')
    const { Wishlist } = require('../models/Wishlist')
    const NegotiationSession = require('../models/NegotiationSession')

    const [recentOrders, wishlistCount, viewCount] = await Promise.all([
      Order.countDocuments({
        'items.product': productId,
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      }),
      Wishlist.countDocuments({ 'items.product': productId }),
      NegotiationSession.countDocuments({
        product: productId,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
    ])

    return {
      recentOrders,
      wishlistCount,
      views: viewCount * 10,
    }
  } catch {
    return { views: 0, wishlistCount: 0, recentOrders: 0 }
  }
}







exports.lockPriceToCart = asyncHandler(async (req, res) => {
  const { itemKey } = req.body
  const { Cart } = require('../models/Wishlist')

  const session = await NegotiationSession.findOne({
    _id: req.params.sessionId,
    user: req.user._id,
    state: 'ACCEPTED',
  })
  if (!session) return res.status(404).json(error('Accepted session not found.', 404))
  if (!session.finalPrice) return res.status(400).json(error('No final price on session.', 400))

  const cart = await Cart.findOne({ user: req.user._id })
  if (!cart) return res.status(404).json(error('Cart not found. Add the product first.', 404))

  const item = cart.items.find(i => i.key === itemKey)
  if (!item) return res.status(404).json(error('Cart item not found.', 404))

  if (item.product?.toString() !== session.product?.toString()) {
    return res.status(400).json(error('Session product does not match cart item.', 400))
  }

  item.negotiatedPrice = session.finalPrice
  item.negotiationSessionId = session._id
  item.priceLocked = true
  item.savedAmount = +(item.price - session.finalPrice).toFixed(2)

  await cart.save()
  await cart.populate('items.product', 'name image price inStock')

  const savings = +(item.savedAmount * item.qty).toFixed(2)
  const { formatCart: _ } = require('../controllers/cartController')
  logger.info(`[Negotiate→Cart] locked ₹${session.finalPrice} for ${item.name}`)

  res.json(success({
    negotiatedPrice: session.finalPrice,
    listedPrice: item.price,
    savedAmount: item.savedAmount,
    totalSavings: savings,
    cartItemKey: itemKey,
    sessionId: session._id,
  }, `Deal locked! ₹${session.finalPrice.toLocaleString('en-IN')} saved to your cart.`))
})
