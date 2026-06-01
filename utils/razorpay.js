

'use strict'

const crypto = require('crypto')
const logger = require('./logger')


let _razorpay = null

function getRazorpay() {
  if (_razorpay) return _razorpay

  const keyId     = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET

  if (!keyId || !keySecret ||
      keyId === 'rzp_test_your_key_id_here' ||
      keySecret === 'your_razorpay_key_secret_here') {
    logger.warn('[Razorpay] API keys not configured — running in MOCK mode')
    return null
  }

  try {
    const Razorpay = require('razorpay')
    _razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
    logger.info('[Razorpay] Client initialised ✅')
    return _razorpay
  } catch (err) {
    logger.error(`[Razorpay] Failed to initialise: ${err.message}`)
    return null
  }
}















async function createRazorpayOrder(amountInRupees, receipt, notes = {}) {
  const rzp = getRazorpay()

  const options = {
    amount:   Math.round(amountInRupees * 100),
    currency: process.env.PAYMENT_CURRENCY || 'INR',
    receipt:  receipt.substring(0, 40),
    notes,
    payment_capture: 1,
  }


  if (!rzp) {
    const mockId = `order_mock_${Date.now()}`
    logger.info(`[Razorpay MOCK] Created order: ${mockId} for ₹${amountInRupees}`)
    return {
      id:       mockId,
      entity:   'order',
      amount:   options.amount,
      currency: options.currency,
      receipt,
      status:   'created',
      _isMock:  true,
    }
  }

  try {
    const order = await rzp.orders.create(options)
    logger.info(`[Razorpay] Order created: ${order.id} | ₹${amountInRupees} | receipt=${receipt}`)
    return order
  } catch (err) {
    logger.error(`[Razorpay] Order creation failed: ${err.message}`)
    throw new Error(`Payment gateway error: ${err.message}`)
  }
}

















function verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature) {
  const keySecret = process.env.RAZORPAY_KEY_SECRET


  if (!keySecret || keySecret === 'your_razorpay_key_secret_here') {
    logger.warn('[Razorpay MOCK] Signature verification skipped — mock mode')
    return true
  }

  try {
    const payload       = `${razorpayOrderId}|${razorpayPaymentId}`
    const expectedHmac  = crypto
      .createHmac('sha256', keySecret)
      .update(payload)
      .digest('hex')


    const sigBuffer      = Buffer.from(razorpaySignature, 'hex')
    const expectedBuffer = Buffer.from(expectedHmac, 'hex')

    if (sigBuffer.length !== expectedBuffer.length) return false

    const isValid = crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    logger.info(`[Razorpay] Signature verification: ${isValid ? '✅ VALID' : '❌ INVALID'} for payment ${razorpayPaymentId}`)
    return isValid
  } catch (err) {
    logger.error(`[Razorpay] Signature verification error: ${err.message}`)
    return false
  }
}














function verifyWebhookSignature(rawBody, signature) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET

  if (!webhookSecret || webhookSecret === 'your_webhook_secret_here') {
    logger.warn('[Razorpay MOCK] Webhook signature verification skipped — mock mode')
    return true
  }

  try {
    const expectedHmac = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex')

    const sigBuffer = Buffer.from(signature,     'hex')
    const expBuffer = Buffer.from(expectedHmac,  'hex')

    if (sigBuffer.length !== expBuffer.length) return false
    return crypto.timingSafeEqual(sigBuffer, expBuffer)
  } catch (err) {
    logger.error(`[Razorpay] Webhook verification error: ${err.message}`)
    return false
  }
}








async function fetchPaymentDetails(paymentId) {
  const rzp = getRazorpay()
  if (!rzp) {
    return { id: paymentId, status: 'captured', _isMock: true }
  }
  try {
    return await rzp.payments.fetch(paymentId)
  } catch (err) {
    logger.error(`[Razorpay] fetchPayment failed: ${err.message}`)
    throw err
  }
}











async function initiateRefund(paymentId, amountInRupees = null, notes = '') {
  const rzp = getRazorpay()

  if (!rzp) {
    const mockRefundId = `rfnd_mock_${Date.now()}`
    logger.info(`[Razorpay MOCK] Refund initiated: ${mockRefundId} for payment ${paymentId}`)
    return { id: mockRefundId, payment_id: paymentId, status: 'processed', _isMock: true }
  }

  try {
    const refundOptions = {
      speed: 'normal',
      notes: { reason: notes },
    }
    if (amountInRupees) {
      refundOptions.amount = Math.round(amountInRupees * 100)
    }

    const refund = await rzp.payments.refund(paymentId, refundOptions)
    logger.info(`[Razorpay] Refund created: ${refund.id} for ₹${amountInRupees || 'full'} on payment ${paymentId}`)
    return refund
  } catch (err) {
    logger.error(`[Razorpay] Refund failed: ${err.message}`)
    throw new Error(`Refund error: ${err.message}`)
  }
}




function isConfigured() {
  const key    = process.env.RAZORPAY_KEY_ID
  const secret = process.env.RAZORPAY_KEY_SECRET
  return !!(key && secret &&
    key    !== 'rzp_test_your_key_id_here' &&
    secret !== 'your_razorpay_key_secret_here')
}




const paiseToRupees = (paise)  => +(paise  / 100).toFixed(2)
const rupeesToPaise = (rupees) => Math.round(rupees * 100)

module.exports = {
  getRazorpay,
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  fetchPaymentDetails,
  initiateRefund,
  isConfigured,
  paiseToRupees,
  rupeesToPaise,
}
