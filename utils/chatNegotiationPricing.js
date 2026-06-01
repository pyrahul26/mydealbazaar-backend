'use strict'

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const extractPriceFromMessage = (message = '') => {
  const text = String(message).replace(/,/g, ' ').toLowerCase()
  const match = text.match(/(?:₹|rs\.?|inr)?\s*(\d{2,7})(?:\s*\/)?/i)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value)
}

const calculateCounterOffer = ({
  originalPrice,
  sellerMinPrice,
  userOffer,
  attempt,
  maxAttempts = 3,
  previousBotPrice,
}) => {
  const baseOriginal = Math.round(originalPrice)
  const rawFloor = Math.round(sellerMinPrice)
  const minDrop = Math.max(30, Math.round(baseOriginal * 0.06))
  const floor = rawFloor >= baseOriginal
    ? Math.max(1, baseOriginal - minDrop)
    : rawFloor
  const prev = previousBotPrice != null ? Math.round(previousBotPrice) : baseOriginal
  const offered = clamp(Math.round(userOffer), floor, baseOriginal)
  const range = Math.max(0, baseOriginal - floor)

  if (range === 0) {
    return Math.max(1, baseOriginal - 1)
  }

  const normalizedProgress = maxAttempts > 1
    ? clamp((attempt - 1) / (maxAttempts - 1), 0, 1)
    : 1

  const targetRatio = 0.12 + (0.84 * normalizedProgress)
  const buyerPressure = clamp((baseOriginal - offered) / range, 0, 1)
  const buyerInfluence = Math.round(range * buyerPressure * 0.06)

  let counter = Math.round(baseOriginal - (range * targetRatio) - buyerInfluence)

  if (previousBotPrice != null) {
    const maxDropFromPrevious = prev - Math.max(15, Math.round(range * 0.08))
    counter = Math.min(counter, maxDropFromPrevious)
  }


  const minimumMargin = attempt >= maxAttempts ? Math.max(15, Math.round(range * 0.08)) : Math.max(15, Math.round(range * 0.04))
  const minAllowed = Math.max(floor + minimumMargin, offered + Math.max(15, Math.round(range * 0.04)))

  counter = clamp(counter, minAllowed, baseOriginal - 1)
  return Math.round(counter)
}

module.exports = {
  extractPriceFromMessage,
  calculateCounterOffer,
}
