'use strict'
const logger = require('../utils/logger')

const HARD_FLOOR_RATIO = 0.60
const MAX_TIME_DISCOUNT = 0.15
const MAX_STOCK_DISCOUNT = 0.20
const DEMAND_PREMIUM_CAP = 0.25

function computeTimeFactor(listedAt) {
  const now = Date.now()
  const listedDate = new Date(listedAt).getTime()
  const daysListed = Math.max(0, (now - listedDate) / (1000 * 60 * 60 * 24))

  const factor = 1 - MAX_TIME_DISCOUNT * (1 - Math.exp(-daysListed / 90))
  return +factor.toFixed(4)
}
function computeDemandFactor({ views = 0, wishlistCount = 0, recentOrders = 0 }) {
  const normalizedViews = Math.min(1, views / 100)
  const normalizedWishlist = Math.min(1, wishlistCount / 50)
  const normalizedOrders = Math.min(1, recentOrders / 10)

  const demandScore = (
    normalizedViews * 0.30 +
    normalizedWishlist * 0.40 +
    normalizedOrders * 0.30
  )

  const factor = 1 + DEMAND_PREMIUM_CAP * Math.min(1, demandScore)
  return +factor.toFixed(4)
}
function computeStockFactor(stockCount, maxStock = 100) {
  const ratio = Math.min(1, stockCount / maxStock)

  if (ratio < 0.10) return 1.05
  if (ratio < 0.25) return 1.02
  if (ratio < 0.50) return 1.00
  if (ratio < 0.75) return 0.95
  return 0.80
}
function computeTimeOfDayFactor(nowHour = new Date().getHours()) {
  if (nowHour >= 0 && nowHour < 6) return 0.96
  if (nowHour >= 6 && nowHour < 9) return 0.98
  if (nowHour >= 9 && nowHour < 22) return 1.00
  return 0.97
}
const SEASONAL_FACTORS = {
  0: 0.88,
  6: 0.90,
  9: 0.87,
  10: 0.85,
  11: 0.89,
}

function computeSeasonalFactor(nowMonth = new Date().getMonth()) {
  return SEASONAL_FACTORS[nowMonth] || 1.00
}
function computeDynamicFloor(product, demandData = {}, now = new Date()) {
  const listedPrice = product.originalPrice ?? product.price ?? 0
  const baseMinPrice = product.min_price


  const hardFloor = Math.round(listedPrice * HARD_FLOOR_RATIO)


  const timeFactor = computeTimeFactor(product.createdAt || product.updatedAt || now)
  const demandFactor = computeDemandFactor(demandData)
  const stockFactor = computeStockFactor(product.stockCount || 50)
  const timeOfDayFactor = computeTimeOfDayFactor(now.getHours())
  const seasonalFactor = computeSeasonalFactor(now.getMonth())


  const combinedMultiplier = timeFactor * demandFactor * stockFactor * timeOfDayFactor * seasonalFactor


  const rawFloor = Math.round(baseMinPrice * combinedMultiplier)


  const dynamicFloor = Math.max(hardFloor, Math.min(rawFloor, listedPrice))

  const breakdown = {
    listedPrice,
    baseMinPrice,
    hardFloor,
    factors: {
      time: timeFactor,
      demand: demandFactor,
      stock: stockFactor,
      timeOfDay: timeOfDayFactor,
      seasonal: seasonalFactor,
      combined: +combinedMultiplier.toFixed(4),
    },
    rawFloor,
    dynamicFloor,
    flexibilityPercent: +(((listedPrice - dynamicFloor) / listedPrice) * 100).toFixed(1),
  }

  logger.debug(`[DynamicPricing] ${product.name}: floor ₹${dynamicFloor} (flex: ${breakdown.flexibilityPercent}%)`)

  return breakdown
}
function classifyOffer(offeredPrice, breakdown) {
  const { dynamicFloor, hardFloor, listedPrice } = breakdown

  if (offeredPrice < hardFloor * 0.70) return 'INSULT'
  if (offeredPrice < dynamicFloor * 0.80) return 'TOO_LOW'
  if (offeredPrice < dynamicFloor * 0.95) return 'NEGOTIABLE'
  if (offeredPrice < dynamicFloor) return 'NEAR_FLOOR'
  if (offeredPrice >= listedPrice) return 'FULL_PRICE'
  return 'ACCEPTABLE'
}
function computeCounterOffer(arg1, breakdown, zone) {
  if (typeof arg1 === 'object' && arg1 !== null && arg1.originalPrice != null) {
    const {
      originalPrice,
      sellerMinPrice,
      userOffer,
      attempt = 1,
      previousBotPrice = null,
    } = arg1

    const original = Math.round(originalPrice)
    const floor = Math.round(sellerMinPrice)
    const offer = Math.round(userOffer)
    const previous = previousBotPrice != null ? Math.round(previousBotPrice) : original
    const range = Math.max(0, original - floor)

    if (range === 0) {
      return original
    }



    const maxRounds = 4
    const progressRatio = Math.min(attempt / maxRounds, 1)



    const gradualPrice = original - (range * progressRatio)


    const buyerPressure = Math.max(0, Math.min(1, (original - offer) / range))
    const buyerInfluence = Math.round(range * buyerPressure * 0.06)

    let counter = Math.round(gradualPrice - buyerInfluence)


    if (previous != null && counter > previous) {
      const minDropFromPrevious = Math.max(15, Math.round(range * 0.05))
      counter = previous - minDropFromPrevious
    }


    const minAllowed = Math.max(floor, offer + Math.max(10, Math.round(range * 0.03)))

    counter = Math.max(counter, minAllowed)
    counter = Math.min(counter, original - 1)


    return Math.max(floor, Math.round(counter))
  }

  const offeredPrice = arg1
  const { dynamicFloor, listedPrice } = breakdown

  switch (zone) {
    case 'INSULT':
      return listedPrice

    case 'TOO_LOW': {
      const counter = offeredPrice + (listedPrice - offeredPrice) * 0.80
      return Math.max(Math.round(counter), dynamicFloor)
    }

    case 'NEGOTIABLE': {
      const counter = (dynamicFloor + listedPrice) / 2
      return Math.max(Math.round(counter), dynamicFloor)
    }

    case 'NEAR_FLOOR': {
      const gap = dynamicFloor - offeredPrice
      const counter = offeredPrice + gap * 0.40
      return Math.max(Math.round(counter), dynamicFloor)
    }

    case 'ACCEPTABLE':
    case 'FULL_PRICE':
      return offeredPrice

    default:
      return dynamicFloor
  }
}

module.exports = {
  computeDynamicFloor,
  computeTimeFactor,
  computeDemandFactor,
  computeStockFactor,
  computeTimeOfDayFactor,
  computeSeasonalFactor,
  classifyOffer,
  computeCounterOffer,
  HARD_FLOOR_RATIO,
}
