'use strict'

const currency = (n) => `₹${Number(n).toLocaleString('en-IN')}`

const acceptanceRegex = /\b(deal|done|ok|okay|buy|confirm|accepted|yes|book)\b/i
const rejectionRegex = /\b(no|reject|cancel|not interested|leave|skip|pass)\b/i

const isAcceptanceMessage = (text = '') => acceptanceRegex.test(text)
const isRejectionMessage  = (text = '') => rejectionRegex.test(text)

const buildLowOfferResponse = (sellerMinPrice) =>
  `Sorry, that price is too low. Please increase your offer. I can consider offers from ${currency(sellerMinPrice)} onwards.`

const buildCounterResponse = (counterPrice, attempt, maxAttempts) => {
  if (attempt === 1) {
    return `Hmm, that’s quite low. I can offer you this product for ${currency(counterPrice)}.`
  }
  if (attempt === 2) {
    return `I understand your budget, but I can reduce it to ${currency(counterPrice)}.`
  }
  return `Alright, this is my final offer — ${currency(counterPrice)}. I cannot go any lower.`
}

const buildNoPriceResponse = () =>
  'Please share your offer as a number (example: "I can pay 1300").'

const buildDealAcceptedResponse = (finalPrice) =>
  `Great! Deal confirmed at ${currency(finalPrice)}. I have updated your cart with this negotiated price.`

const buildDealRejectedResponse = (originalPrice) =>
  `Sorry, I cannot reduce further. The product remains at ${currency(originalPrice)}.`

const buildWaitingConfirmationResponse = (finalPrice) =>
  `Your final negotiated price is ${currency(finalPrice)}. Reply with Deal/Done/Buy/Confirm to accept, or anything else to cancel.`

module.exports = {
  isAcceptanceMessage,
  isRejectionMessage,
  buildLowOfferResponse,
  buildCounterResponse,
  buildNoPriceResponse,
  buildDealAcceptedResponse,
  buildDealRejectedResponse,
  buildWaitingConfirmationResponse,
}
