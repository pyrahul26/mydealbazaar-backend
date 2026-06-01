'use strict'

const {
  computeDynamicFloor,
  classifyOffer,
  computeCounterOffer,
} = require('./dynamicPricing')

const STATE = {
  OPEN: 'OPEN',
  ACTIVE: 'ACTIVE',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
}

const MAX_ROUNDS = 4
const SESSION_TTL_MS = 30 * 60 * 1000
const STALL_THRESHOLD = 0.02

function evaluateOffer(session, newOffer, product, demandData = {}) {
  const now = new Date()
  const breakdown = computeDynamicFloor(product, demandData, now)
  const { dynamicFloor, listedPrice } = breakdown


  if (session.createdAt && now - new Date(session.createdAt) > SESSION_TTL_MS) {
    return buildResult('REJECT', null, null, 'EXPIRED', breakdown,
      'This negotiation session has expired. Please start a new one.',
      { state: STATE.EXPIRED }
    )
  }


  const roundsUsed = Number(session.round || 0)


  const buyerOffers = (session.offers || []).filter(offer => offer.role === 'buyer')
  const prevOffer = buyerOffers.at(-1)?.amount || 0
  if (prevOffer > 0 && roundsUsed >= 2) {
    const movement = (newOffer - prevOffer) / prevOffer
    if (movement < STALL_THRESHOLD && newOffer < dynamicFloor) {
      return buildResult('REJECT', null, null, 'STALLING', breakdown,
        `Your offers are barely moving. Our final price is ₹${dynamicFloor.toLocaleString('en-IN')}. Take it or leave it.`,
        { state: STATE.REJECTED, rejectionReason: 'buyer_stalling' }
      )
    }
  }


  const zone = classifyOffer(newOffer, breakdown)
  const attempt = Math.min(MAX_ROUNDS, roundsUsed + 1)
  const counter = computeCounterOffer({
    originalPrice: listedPrice,
    sellerMinPrice: Math.min(dynamicFloor, product.min_price ?? dynamicFloor),
    userOffer: newOffer,
    attempt,
    previousBotPrice: session.lastSellerCounter,
  })


  if (zone === 'INSULT') {
    return buildResult('REJECT', null, null, zone, breakdown,
      `₹${newOffer.toLocaleString('en-IN')} is far below what we can accept. ` +
      `This item is listed at ₹${listedPrice.toLocaleString('en-IN')} for good reason.`,
      { state: STATE.REJECTED, rejectionReason: 'insult_offer' }
    )
  }



  if (attempt < MAX_ROUNDS) {
    const roundsLeft = MAX_ROUNDS - attempt
    const progressPercent = Math.round((attempt / MAX_ROUNDS) * 100)
    const savings = listedPrice - counter
    const savingsPercent = Math.round((savings / listedPrice) * 100)
    return buildResult('COUNTER', null, counter, zone, breakdown,
      `Thanks for your offer of ₹${newOffer.toLocaleString('en-IN')}! ` +
      `I can come down to ₹${counter.toLocaleString('en-IN')} (save ${savingsPercent}%). ` +
      `Let's keep negotiating! ${roundsLeft} round${roundsLeft !== 1 ? 's' : ''} left.`,
      { state: STATE.ACTIVE, lastCounterPrice: counter }
    )
  }


  return buildResult('FINAL_OFFER', counter, null, zone, breakdown,
    `This is my final offer: ₹${counter.toLocaleString('en-IN')}! ` +
    `I've brought it down as much as I can. Say "Deal", "Done", "Buy", or "Confirm" to lock it in! 🎉`,
    { state: STATE.ACTIVE, lastCounterPrice: counter, finalPrice: counter }
  )
}

function buildResult(decision, finalPrice, counterPrice, zone, breakdown, message, sessionUpdate) {
  return {
    decision,
    finalPrice,
    counterPrice,
    zone,
    breakdown: {
      dynamicFloor: breakdown.dynamicFloor,
      listedPrice: breakdown.listedPrice,
      hardFloor: breakdown.hardFloor,
      flexibilityPercent: breakdown.flexibilityPercent,
      factors: breakdown.factors,
    },
    message,
    sessionUpdate,
  }
}

function buildSummary(session, finalResult) {
  const offers = session.offers || []
  const first = offers[0]?.amount || 0
  const last = offers.at(-1)?.amount || 0

  return {
    sessionId: session._id,
    productId: session.product,
    userId: session.user,
    rounds: offers.length,
    firstOffer: first,
    lastOffer: last,
    listedPrice: finalResult.breakdown?.listedPrice,
    finalPrice: finalResult.finalPrice,
    outcome: finalResult.decision,
    savingsAmount: finalResult.finalPrice
      ? finalResult.breakdown.listedPrice - finalResult.finalPrice
      : null,
    savingsPercent: finalResult.finalPrice
      ? +((1 - finalResult.finalPrice / finalResult.breakdown.listedPrice) * 100).toFixed(1)
      : null,
    buyerMovement: offers.length > 1 ? last - first : 0,
    durationSeconds: session.createdAt
      ? Math.round((Date.now() - new Date(session.createdAt).getTime()) / 1000)
      : null,
  }
}

module.exports = {
  evaluateOffer,
  buildSummary,
  STATE,
  MAX_ROUNDS,
  SESSION_TTL_MS,
}
