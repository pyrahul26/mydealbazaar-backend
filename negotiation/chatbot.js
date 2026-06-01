const intentsData = require('./intents.json')

function detectIntent(userInput) {
  const text = userInput.toLowerCase().trim()

  let bestMatch = { tag: 'unknown', score: 0 }

  for (const intent of intentsData.intents) {
    for (const pattern of intent.patterns) {
      const patternWords = pattern.toLowerCase().split(' ')
      const matchCount = patternWords.filter(word => text.includes(word)).length
      const score = matchCount / patternWords.length

      if (score > bestMatch.score) {
        bestMatch = { tag: intent.tag, score }
      }
    }
  }

  if (bestMatch.score < 0.4 && extractPrice(userInput) !== null) {
    return 'make_offer'
  }

  return bestMatch.score >= 0.3 ? bestMatch.tag : 'unknown'
}

function extractPrice(text) {
  const cleaned = text.replace(/,/g, '')

  const rupeePrefixMatch = cleaned.match(/(?:₹|rs\.?\s*|rupees?\s*|inr\s*)(\d+)/i)
  if (rupeePrefixMatch) return parseInt(rupeePrefixMatch[1])

  const numbers = cleaned.match(/\b(\d{3,6})\b/g)
  if (numbers && numbers.length > 0) {
    return parseInt(numbers[numbers.length - 1])
  }

  return null
}

function fillTemplate(template, vars = {}) {
  return template.replace(/\{(\w+)\}/g, (match, key, offset, source) => {
    if (vars[key] !== undefined) {
      const priceFields = ['price', 'originalPrice', 'min_price', 'final_price', 'counter_price']
      if (priceFields.includes(key) && typeof vars[key] === 'number') {
        const prefixWindow = source.slice(Math.max(0, offset - 6), offset)
        const hasCurrencyPrefix = /(?:₹|rs\.?|inr)\s*$/i.test(prefixWindow)
        return hasCurrencyPrefix ? `${vars[key]}` : `₹${vars[key]}`
      }
      return vars[key]
    }
    return match
  })
}

function pickResponse(tag) {
  const intent = intentsData.intents.find(i => i.tag === tag)
  if (!intent) return 'Sorry, I did not understand that. Can you rephrase?'
  const responses = intent.responses
  return responses[Math.floor(Math.random() * responses.length)]
}

function negotiate(userOffer, product, sessionNego) {
  const { price, originalPrice, mrp, min_price, name } = product
  const attemptsCount = Number(sessionNego.attempts_count || 0)
  const previousBotPrice = sessionNego.lastCounter || null
  const startingPrice = Number(originalPrice ?? price)
  const displayOriginalPrice = Number(mrp ?? originalPrice ?? price)
  const floorPrice = Number(min_price ?? originalPrice ?? price)

  const vars = {
    product_name: name,
    price: startingPrice,
    originalPrice: displayOriginalPrice,
    min_price: floorPrice,
  }

  if (sessionNego.dealDone) {
    return {
      response: `We already have a deal at ₹${sessionNego.negotiatedPrice} for **${name}** 🎉`,
      sessionUpdate: sessionNego,
      negotiatedPrice: sessionNego.negotiatedPrice,
      dealDone: true,
    }
  }

  if (userOffer >= startingPrice) {
    const finalPrice = startingPrice
    return {
      response: fillTemplate(pickResponse('accept_deal'), { ...vars, final_price: finalPrice }),
      sessionUpdate: { ...sessionNego, dealDone: true, negotiatedPrice: finalPrice, lastCounter: null },
      negotiatedPrice: finalPrice,
      dealDone: true,
    }
  }

  if (previousBotPrice !== null && userOffer >= previousBotPrice) {
    return {
      response: fillTemplate(pickResponse('accept_deal'), { ...vars, final_price: previousBotPrice }),
      sessionUpdate: { ...sessionNego, dealDone: true, negotiatedPrice: previousBotPrice, lastCounter: null, attempts_count: attemptsCount },
      negotiatedPrice: previousBotPrice,
      dealDone: true,
    }
  }

  const counter = require('./../utils/chatNegotiationPricing').calculateCounterOffer({
    originalPrice: startingPrice,
    sellerMinPrice: floorPrice,
    userOffer,
    attempt: Math.min(3, attemptsCount + 1),
    maxAttempts: 3,
    previousBotPrice,
  })

  return {
    response: fillTemplate(pickResponse('counter_offer'), { ...vars, counter_price: counter }),
    sessionUpdate: { ...sessionNego, dealDone: false, negotiatedPrice: null, lastCounter: counter, attempts_count: Math.min(3, attemptsCount + 1) },
    negotiatedPrice: null,
    dealDone: false,
  }
}

function processMessage(userInput, product, sessionNego = {}) {
  const { price, originalPrice, mrp, min_price, name } = product
  const startingPrice = Number(originalPrice ?? price)
  const displayOriginalPrice = Number(mrp ?? originalPrice ?? price)
  const floorPrice = Number(min_price ?? originalPrice ?? price)

  const vars = {
    product_name: name,
    price: startingPrice,
    originalPrice: displayOriginalPrice,
    min_price: floorPrice,
  }

  const intent = detectIntent(userInput)
  const extractedPrice = extractPrice(userInput)

  if (
    extractedPrice !== null &&
    ['make_offer', 'low_offer', 'high_offer', 'unknown'].includes(intent)
  ) {
    const result = negotiate(extractedPrice, product, sessionNego)
    return { ...result, intent: 'make_offer' }
  }

  if (extractedPrice !== null && extractedPrice > 0) {
    const result = negotiate(extractedPrice, product, sessionNego)
    return { ...result, intent: 'make_offer' }
  }

  switch (intent) {
    case 'greeting':
    case 'product_inquiry':
    case 'ask_discount':
    case 'ask_min_price':
    case 'thanks':
    case 'goodbye':
    case 'reject_deal':
      return {
        response: fillTemplate(pickResponse(intent), vars),
        sessionUpdate: sessionNego,
        negotiatedPrice: sessionNego.negotiatedPrice || null,
        dealDone: sessionNego.dealDone || false,
        intent,
      }

    case 'counter_offer': {
      if (sessionNego.lastCounter) {
        const reduced = require('./../utils/chatNegotiationPricing').calculateCounterOffer({
          originalPrice: startingPrice,
          sellerMinPrice: floorPrice,
          userOffer: sessionNego.lastCounter,
          attempt: Math.min(3, Number(sessionNego.attempts_count || 0) + 1),
          maxAttempts: 3,
          previousBotPrice: sessionNego.lastCounter,
        })
        const newSession = { ...sessionNego, lastCounter: reduced, attempts_count: Math.min(3, Number(sessionNego.attempts_count || 0) + 1) }
        return {
          response: fillTemplate(pickResponse('counter_offer'), { ...vars, counter_price: reduced }),
          sessionUpdate: newSession,
          negotiatedPrice: null,
          dealDone: false,
          intent,
        }
      }

      return {
        response: `Please make an offer first! **${name}** is listed at ₹${startingPrice}.`,
        sessionUpdate: sessionNego,
        negotiatedPrice: null,
        dealDone: false,
        intent,
      }
    }

    case 'accept_deal': {
      const agreedPrice = sessionNego.lastCounter || min_price
      const newSession = { ...sessionNego, dealDone: true, negotiatedPrice: agreedPrice, attempts_count: Number(sessionNego.attempts_count || 0) }
      return {
        response: fillTemplate(pickResponse('accept_deal'), { ...vars, final_price: agreedPrice }),
        sessionUpdate: newSession,
        negotiatedPrice: agreedPrice,
        dealDone: true,
        intent,
      }
    }

    default:
      return {
        response: `I didn't quite understand. Are you interested in **${name}** at ₹${startingPrice}? Make me an offer! 😊`,
        sessionUpdate: sessionNego,
        negotiatedPrice: null,
        dealDone: false,
        intent: 'unknown',
      }
  }
}

module.exports = { processMessage, detectIntent, extractPrice }