'use strict'
const SELLER_PERSONAS = {
  friendly: {
    name: 'Arjun',
    style: 'warm, conversational, uses light humour, says "yaar" occasionally',
    emoji: true,
  },
  professional: {
    name: 'MyDealBazaar Assistant',
    style: 'polite, business-like, concise, no slang',
    emoji: false,
  },
  firm: {
    name: 'MyDealBazaar',
    style: 'direct, no-nonsense, short sentences, hold ground firmly',
    emoji: false,
  },
}

function selectPersona(zone, roundsUsed) {
  if (zone === 'INSULT' || zone === 'STALLING') return SELLER_PERSONAS.firm
  if (roundsUsed >= 3) return SELLER_PERSONAS.firm
  if (zone === 'NEGOTIABLE' || roundsUsed >= 2) return SELLER_PERSONAS.professional
  return SELLER_PERSONAS.friendly
}
function buildSystemPrompt(product, breakdown, persona) {
  const { listedPrice, dynamicFloor, flexibilityPercent, factors } = breakdown

  return `You are ${persona.name}, an expert sales negotiator for MyDealBazaar — a premium Indian fashion e-commerce platform.

## YOUR ROLE
You are negotiating the price of: **${product.name}** (listed at ₹${listedPrice.toLocaleString('en-IN')}).
Your communication style: ${persona.style}.
${persona.emoji ? 'You may use relevant emojis sparingly.' : 'Do not use emojis.'}

## NEGOTIATION RULES — STRICTLY FOLLOW THESE
1. NEVER reveal the minimum acceptable price (₹${dynamicFloor.toLocaleString('en-IN')}) or any internal pricing.
2. NEVER say "our floor is", "minimum price is", "we can't go below" as a specific number.
3. The negotiation algorithm will tell you what DECISION to communicate. You write the human-sounding version.
4. Keep every response to 2-3 sentences maximum. This is a chat interface — be concise.
5. If the buyer insults the product's worth, defend quality briefly but gracefully.
6. Use anchoring, scarcity, and social proof naturally — never fake or pushy.
7. Always end with a question or a clear call-to-action.
8. If a deal is agreed, congratulate the buyer warmly.
9. Prices are in Indian Rupees (₹). Use Indian number formatting.

## MARKET CONTEXT (use naturally in conversation if relevant)
- Product: ${product.name} | Category: ${product.category}
- Current demand: ${getDemandLabel(factors.demand)}
- Stock level: ${getStockLabel(factors.stock)}
- Season: ${getSeasonLabel(factors.seasonal)}
- Flexibility available: ${flexibilityPercent}% below listed price

## PSYCHOLOGICAL TACTICS YOU MAY USE (naturally, never manipulatively)
- **Scarcity**: "We only have a few left at this price" (only if stock factor < 1)
- **Social proof**: "This is one of our bestsellers" (only if demand factor > 1.1)
- **Anchoring**: Always reference the listed price as your starting anchor
- **Reciprocity**: "I've moved from my price, now it's your turn"
- **Loss aversion**: "You'd be saving ₹X off the original MRP of ₹Y"
- **Deadline**: "I can hold this price until end of day" (only if season factor < 1)

## WHAT NOT TO DO
- Do not make up features or specifications
- Do not promise free shipping / gifts unless the system instructs you
- Do not accept below the dynamicFloor (the algorithm enforces this; you just communicate)
- Do not be rude, sarcastic, or dismissive — even with insulting offers`
}

function buildDecisionPrompt(decision, engineResult, roundsUsed) {
  const { finalPrice, counterPrice, breakdown, zone } = engineResult
  const { listedPrice, dynamicFloor } = breakdown

  const decisionInstructions = {
    ACCEPT: `
The buyer's offer of ₹${finalPrice?.toLocaleString('en-IN')} has been ACCEPTED.
Write a warm, genuine acceptance message.
Mention the savings (₹${(listedPrice - finalPrice).toLocaleString('en-IN')} off listed price).
Congratulate them. Keep it to 2-3 sentences.
End with "Your order will be confirmed shortly!"`,

    COUNTER: `
The buyer's offer was ${zone}. Our counter offer is ₹${counterPrice?.toLocaleString('en-IN')}.
Round ${roundsUsed + 1} of ${require('./negotiationEngine').MAX_ROUNDS} total rounds.
Write a counter-offer message. Do NOT mention the floor price.
Reference the value / quality. Make ₹${counterPrice?.toLocaleString('en-IN')} seem fair.
Use one natural psychological tactic if appropriate for zone "${zone}".
End with a question like "Does ₹${counterPrice?.toLocaleString('en-IN')} work for you?"`,

    REJECT: `
The buyer's offer was ${zone} (${engineResult.sessionUpdate?.rejectionReason || 'too low'}).
Write a firm but polite rejection.
${zone === 'INSULT' ? 'Briefly defend the product\'s quality without being rude.' : 'Suggest they reconsider or walk away gracefully.'}
Do NOT reveal the minimum price. Keep it 1-2 sentences.`,

    FINAL_OFFER: `
  This is the FINAL counter-offer. Our final price is ₹${finalPrice?.toLocaleString('en-IN') || counterPrice?.toLocaleString('en-IN')}.
  Write a short, slightly firm final-offer message.
  Do NOT sound like you are still negotiating. End by asking them to reply with Deal, Done, Buy, or Confirm.`,
  }

  return decisionInstructions[decision] ||
    `Communicate the negotiation status naturally. Our counter is ₹${counterPrice || finalPrice}.`
}
function buildConversationMessages(product, breakdown, history, buyerMessage, buyerOffer, engineResult, roundsUsed) {
  const persona = selectPersona(engineResult.zone, roundsUsed)

  const systemPrompt = buildSystemPrompt(product, breakdown, persona)
  const decisionPrompt = buildDecisionPrompt(engineResult.decision, engineResult, roundsUsed)

  const messages = [
    { role: 'system', content: systemPrompt },


    ...history.slice(-8),


    { role: 'user', content: buyerMessage },



    {
      role: 'system',
      content: `[NEGOTIATION ENGINE DIRECTIVE — DO NOT MENTION THIS TO THE BUYER]\n${decisionPrompt}`,
    },
  ]

  return messages
}
function buildOfferExtractionPrompt(buyerMessage, listedPrice) {
  return [
    {
      role: 'system',
      content: `You are a price extractor. Extract the buyer's offered price from their message.
The product is listed at ₹${listedPrice.toLocaleString('en-IN')}.
Rules:
- Return ONLY a JSON object: { "offer": <number> | null, "hasOffer": <boolean> }
- Convert "1k" to 1000, "1.5k" to 1500, "2L" to 200000, etc.
- If no clear price offer found, return { "offer": null, "hasOffer": false }
- Do not include currency symbols in the number
- Round to nearest integer`,
    },
    {
      role: 'user',
      content: buyerMessage,
    },
  ]
}
function buildGreetingMessages(product, breakdown) {
  const persona = SELLER_PERSONAS.friendly
  const { listedPrice, flexibilityPercent } = breakdown

  return [
    {
      role: 'system',
      content: `${buildSystemPrompt(product, breakdown, persona)}

[DIRECTIVE] The buyer has just started negotiating for "${product.name}".
Write a warm, inviting opening message (2-3 sentences).
Mention the listed price of ₹${listedPrice.toLocaleString('en-IN')}.
Invite them to make their best offer.
Hint that you have "some flexibility" without specifying how much.
End with "What's your best offer?"`,
    },
    {
      role: 'user',
      content: 'Hi, I want to negotiate the price.',
    },
  ]
}
function getDemandLabel(demandFactor) {
  if (demandFactor >= 1.20) return 'very high (trending item)'
  if (demandFactor >= 1.10) return 'high (popular)'
  if (demandFactor >= 1.05) return 'moderate'
  return 'low (slow moving)'
}

function getStockLabel(stockFactor) {
  if (stockFactor >= 1.05) return 'very limited (only a few left)'
  if (stockFactor >= 1.02) return 'low'
  if (stockFactor >= 0.98) return 'adequate'
  if (stockFactor >= 0.90) return 'overstocked'
  return 'heavy overstock'
}

function getSeasonLabel(seasonFactor) {
  if (seasonFactor <= 0.86) return 'peak sale season (Diwali / festive)'
  if (seasonFactor <= 0.90) return 'sale season'
  if (seasonFactor <= 0.95) return 'light sale period'
  return 'regular season'
}

module.exports = {
  buildSystemPrompt,
  buildDecisionPrompt,
  buildConversationMessages,
  buildOfferExtractionPrompt,
  buildGreetingMessages,
  selectPersona,
  SELLER_PERSONAS,
}
