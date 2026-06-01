'use strict'

const path = require('path')
const ejs = require('ejs')
const { Resend } = require('resend')
const Payment = require('../models/Payment')
const Order = require('../models/Order')
const { Cart } = require('../models/Wishlist')
const User = require('../models/User')
const {
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  fetchPaymentDetails,
  initiateRefund,
  isConfigured,
  paiseToRupees,
} = require('../utils/razorpay')
const { success, error, paginated } = require('../utils/apiResponse')
const { asyncHandler } = require('../middleware/errorHandler')
const logger = require('../utils/logger')
const { validationResult } = require('express-validator')

const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured.')
  }
  return new Resend(apiKey)
}

const formatINR = (amount) => {
  const value = Number(amount) || 0
  return new Intl.NumberFormat('en-IN').format(value)
}


exports.createPaymentOrder = asyncHandler(async (req, res) => {
  const {
    amount,
    deliveryAddress,
    paymentMethod = 'razorpay',
    promoCode = '',
  } = req.body

  if (!deliveryAddress?.fullName || !deliveryAddress?.phone ||
    !deliveryAddress?.line1 || !deliveryAddress?.city ||
    !deliveryAddress?.state || !deliveryAddress?.pin) {
    return res.status(400).json(error('Complete delivery address is required.', 400))
  }

  const cart = await Cart.findOne({ user: req.user._id })
    .populate('items.product', 'name image price inStock min_price')

  if (!cart || cart.items.length === 0) {
    return res.status(400).json(error('Your cart is empty.', 400))
  }

  const outOfStock = cart.items.filter(i => !i.product?.inStock)
  if (outOfStock.length > 0) {
    return res.status(400).json(
      error(`Out of stock: ${outOfStock.map(i => i.product?.name).join(', ')}`, 400)
    )
  }

  const effectiveSubtotal = cart.items.reduce((sum, i) => {
    const price = i.negotiatedPrice != null ? i.negotiatedPrice : i.price
    return sum + price * i.qty
  }, 0)

  const shipping = effectiveSubtotal >= 1999 ? 0 : 199
  const tax = Math.round(effectiveSubtotal * 0.05)
  const discount = cart.discount || 0
  const computedTotal = +(effectiveSubtotal + shipping + tax - discount).toFixed(2)
  const requestedTotal = Number(amount)
  const total = Number.isFinite(requestedTotal) && requestedTotal > 0 ? requestedTotal : computedTotal

  const cartSnapshot = {
    items: cart.items.map(i => ({
      productId: i.product._id,
      name: i.product.name,
      image: i.product.image,
      price: i.price,
      negotiatedPrice: i.negotiatedPrice || null,
      effectivePrice: i.negotiatedPrice != null ? i.negotiatedPrice : i.price,
      size: i.size,
      color: i.color,
      qty: i.qty,
      priceLocked: i.priceLocked || false,
      negotiationSessionId: i.negotiationSessionId || null,
    })),
    subtotal: effectiveSubtotal,
    shipping,
    tax,
    discount,
    total,
    promoCode,
  }

  const receiptId = `${process.env.PAYMENT_RECEIPT_PREFIX || 'SH'}-${req.user._id.toString().slice(-8)}-${Date.now()}`
  const razorpayOrder = await createRazorpayOrder(total, receiptId, {
    userId: req.user._id.toString(),
    userEmail: req.user.email,
    cartItemCount: cart.items.length,
    paymentMethod,
  })

  const payment = await Payment.create({
    userId: req.user._id,
    orderId: null,
    razorpayOrderId: razorpayOrder.id,
    amountInPaise: razorpayOrder.amount,
    amount: total,
    currency: razorpayOrder.currency || 'INR',
    paymentStatus: 'initiated',
    paymentMethod,
    cartSnapshot,
    deliveryAddress,
    receiptId,
    isMock: razorpayOrder._isMock || false,
  })

  logger.info(
    `[Payment] Order created: ${razorpayOrder.id} | ₹${total} | ` +
    `user=${req.user._id} | mock=${payment.isMock}`
  )

  res.status(201).json(success({
    orderId: razorpayOrder.id,
    razorpayOrderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    amountInRupees: total,
    currency: razorpayOrder.currency || 'INR',
    keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock',
    paymentId: payment._id,
    prefill: {
      name: req.user.name,
      email: req.user.email,
      contact: req.user.phone || '',
    },
    breakdown: {
      subtotal: effectiveSubtotal,
      shipping,
      tax,
      discount,
      total,
    },
    isMock: payment.isMock,
  }, 'Payment order created.', 201))
})


exports.verifyPayment = asyncHandler(async (req, res) => {
  const razorpayOrderId = req.body.razorpay_order_id || req.body.razorpayOrderId
  const razorpayPaymentId = req.body.razorpay_payment_id || req.body.razorpayPaymentId
  const razorpaySignature = req.body.razorpay_signature || req.body.razorpaySignature
  const paymentMethod = req.body.payment_method || req.body.paymentMethod || 'razorpay'
  const paymentId = req.body.paymentId

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return res.status(400).json(
      error('razorpay_order_id, razorpay_payment_id and razorpay_signature are required.', 400)
    )
  }

  const payment = await Payment.findOne({
    razorpayOrderId,
    user: req.user._id,
  })

  if (!payment) {
    return res.status(404).json(error('Payment record not found.', 404))
  }

  if (payment.status === 'captured' && payment.order) {
    const existingOrder = await Order.findById(payment.order)
    if (existingOrder) {
      return res.json(success({
        orderId: existingOrder._id,
        orderNumber: existingOrder.orderNumber,
        paymentId: payment.razorpayPaymentId,
        paymentStatus: payment.status,
        alreadyProcessed: true,
      }, 'Payment already processed.'))
    }
  }

  const isValid = verifyPaymentSignature(
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature
  )

  if (!isValid) {
    payment.status = 'failed'
    payment.failedAt = new Date()
    payment.failureReason = 'Signature verification failed — possible tamper attempt'
    await payment.save()

    logger.warn(
      `[Payment] INVALID signature: orderId=${razorpayOrderId} ` +
      `paymentId=${razorpayPaymentId} user=${req.user._id}`
    )

    return res.status(400).json(
      error('Payment verification failed. If money was deducted, it will be refunded in 5-7 days.', 400)
    )
  }

  payment.razorpayPaymentId = razorpayPaymentId
  payment.razorpaySignature = razorpaySignature
  payment.status = 'captured'
  payment.capturedAt = new Date()
  payment.method = paymentMethod
  await payment.save()


  const snap = payment.cartSnapshot

  const orderItems = snap.items.map(i => ({
    product: i.productId,
    name: i.name,
    image: i.image,
    price: i.effectivePrice,
    originalPrice: i.price,
    negotiatedPrice: i.negotiatedPrice || null,
    negotiationSessionId: i.negotiationSessionId || null,
    size: i.size,
    color: i.color,
    qty: i.qty,
  }))

  const order = await Order.create({
    user: req.user._id,
    items: orderItems,
    deliveryAddress: payment.deliveryAddress,
    payment: {
      method: paymentMethod,
      status: 'paid',
      transactionId: razorpayPaymentId,
      gateway: 'razorpay',
      paidAt: new Date(),
    },
    subtotal: snap.subtotal,
    shippingCost: snap.shipping,
    tax: snap.tax,
    discount: snap.discount,
    total: snap.total,
    promoCode: snap.promoCode || '',
    status: 'Confirmed',
    statusHistory: [
      { status: 'Processing', message: 'Order initiated.' },
      { status: 'Confirmed', message: `Payment confirmed via Razorpay (${razorpayPaymentId}).` },
    ],
    estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  })


  payment.order = order._id
  await payment.save()


  await Cart.findOneAndUpdate(
    { user: req.user._id },
    { items: [], promoCode: '', discount: 0 }
  )


  await User.findByIdAndUpdate(req.user._id, {
    $inc: { totalOrders: 1, totalSpent: snap.total },
  })

  // Email sending disabled: previously sent order confirmation here.
  // Keeping flow simple: no external email is sent from the backend.

  logger.info(
    `[Payment] ✅ Verified & order created: ${order.orderNumber} | ` +
    `₹${snap.total} | user=${req.user._id} | payment=${razorpayPaymentId}`
  )

  res.json(success({
    orderId: order._id,
    orderNumber: order.orderNumber,
    total: order.total,
    amount: payment.amountInRupees,
    status: order.status,
    paymentStatus: payment.status,
    estimatedDelivery: order.estimatedDelivery,
    paymentId: razorpayPaymentId,
    gatewayPaymentId: paymentId || razorpayPaymentId,
  }, `Payment successful! Order ${order.orderNumber} confirmed. 🎉`))
})


exports.handleWebhook = asyncHandler(async (req, res) => {

  const signature = req.headers['x-razorpay-signature']
  if (!signature) {
    return res.status(400).json({ error: 'Missing X-Razorpay-Signature header' })
  }

  const rawBody = req.rawBody || JSON.stringify(req.body)
  const isValid = verifyWebhookSignature(rawBody, signature)

  if (!isValid) {
    logger.warn('[Webhook] Invalid signature received — possible spoofing attempt')
    return res.status(400).json({ error: 'Invalid webhook signature' })
  }


  const event = req.body.event
  const entity = req.body.payload?.payment?.entity || req.body.payload?.refund?.entity || {}
  const orderId = entity.order_id
  const paymentId = entity.id

  logger.info(`[Webhook] Received event: ${event} | orderId=${orderId} | paymentId=${paymentId}`)


  const payment = orderId
    ? await Payment.findOne({ razorpayOrderId: orderId })
    : null


  if (payment) {
    payment.webhookEvents.push({ event, payload: entity, receivedAt: new Date() })

    payment.save().catch(err => logger.error(`[Webhook] Failed to log event: ${err.message}`))
  }


  switch (event) {


    case 'payment.captured':
    case 'order.paid': {
      if (!payment) break


      if (payment.status === 'captured') break

      payment.razorpayPaymentId = paymentId
      payment.status = 'captured'
      payment.capturedAt = new Date()
      payment.method = entity.method || ''
      payment.vpa = entity.vpa || ''
      payment.cardLast4 = entity.card?.last4 || ''
      payment.cardNetwork = entity.card?.network || ''
      payment.bank = entity.bank || ''

      await payment.save()


      if (!payment.order) {
        await createOrderFromPayment(payment, entity)
      } else {

        await Order.findByIdAndUpdate(payment.order, {
          'payment.status': 'paid',
          'payment.transactionId': paymentId,
          'payment.paidAt': new Date(),
        })
      }
      break
    }


    case 'payment.failed': {
      if (!payment) break

      payment.status = 'failed'
      payment.failedAt = new Date()
      payment.failureReason = entity.error_description || 'Payment declined'
      payment.failureCode = entity.error_code || ''
      await payment.save()


      if (payment.order) {
        await Order.findByIdAndUpdate(payment.order, {
          'payment.status': 'failed',
          status: 'Cancelled',
          cancelReason: `Payment failed: ${entity.error_description || 'declined'}`,
        })
      }

      logger.warn(`[Webhook] Payment FAILED: ${paymentId} | reason=${entity.error_description}`)
      break
    }


    case 'refund.processed': {
      const refundEntity = req.body.payload?.refund?.entity
      if (!refundEntity) break

      const paymentRecord = await Payment.findOne({
        razorpayPaymentId: refundEntity.payment_id,
      })
      if (!paymentRecord) break

      paymentRecord.status = 'refunded'
      paymentRecord.razorpayRefundId = refundEntity.id
      paymentRecord.refundedAt = new Date()
      paymentRecord.refundAmountInRupees = paiseToRupees(refundEntity.amount)
      await paymentRecord.save()


      if (paymentRecord.order) {
        await Order.findByIdAndUpdate(paymentRecord.order, {
          'payment.status': 'refunded',
          'payment.refundedAt': new Date(),
          'payment.refundId': refundEntity.id,
        })
      }

      logger.info(`[Webhook] Refund processed: ${refundEntity.id} | ₹${paiseToRupees(refundEntity.amount)}`)
      break
    }

    default:
      logger.debug(`[Webhook] Unhandled event: ${event}`)
  }


  res.status(200).json({ status: 'ok' })
})






exports.refundPayment = asyncHandler(async (req, res) => {
  const { reason = 'Customer requested refund', amount } = req.body


  const order = await Order.findOne({
    _id: req.params.orderId,
    user: req.user._id,
  })
  if (!order) return res.status(404).json(error('Order not found.', 404))

  if (order.payment.status === 'refunded') {
    return res.status(400).json(error('This order has already been refunded.', 400))
  }
  if (order.payment.status !== 'paid') {
    return res.status(400).json(error('Only paid orders can be refunded.', 400))
  }


  const payment = await Payment.findOne({ order: order._id })
  if (!payment) return res.status(404).json(error('Payment record not found.', 404))


  if (order.payment.method === 'cod') {
    order.payment.status = 'refunded'
    order.payment.refundedAt = new Date()
    order.status = 'Returned'
    await order.save()
    return res.json(success({ orderId: order._id, refundStatus: 'processed' }, 'COD order marked as refunded.'))
  }


  const refundAmount = amount ? Number(amount) : null
  const refund = await initiateRefund(
    payment.razorpayPaymentId,
    refundAmount,
    reason
  )


  payment.status = 'refund_initiated'
  payment.razorpayRefundId = refund.id
  payment.refundAmountInRupees = refundAmount || order.total
  payment.refundReason = reason
  await payment.save()

  order.payment.status = 'refunded'
  order.payment.refundId = refund.id
  order.payment.refundedAt = new Date()
  order.status = 'Returned'
  await order.save()

  logger.info(`[Payment] Refund initiated: ${refund.id} | ₹${refundAmount || order.total} | order=${order.orderNumber}`)

  res.json(success({
    refundId: refund.id,
    orderId: order._id,
    orderNumber: order.orderNumber,
    amount: refundAmount || order.total,
    status: refund.status,
    estimatedDays: '5-7 business days',
  }, `Refund of ₹${refundAmount || order.total} initiated. ${refund._isMock ? '(Mock)' : 'Credited in 5-7 days.'}`))
})




exports.getPaymentHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query
  const pageNum = Math.max(1, Number(page))
  const pageSize = Math.min(50, Number(limit))
  const skip = (pageNum - 1) * pageSize

  const [payments, total] = await Promise.all([
    Payment.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .populate('order', 'orderNumber status estimatedDelivery')
      .select('-webhookEvents -cartSnapshot -razorpaySignature'),
    Payment.countDocuments({ user: req.user._id }),
  ])

  res.json(paginated(payments, pageNum, pageSize, total))
})




exports.getPaymentById = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({
    _id: req.params.paymentId,
    user: req.user._id,
  })
    .populate('order', 'orderNumber status total estimatedDelivery items')
    .select('-webhookEvents -razorpaySignature')

  if (!payment) return res.status(404).json(error('Payment not found.', 404))
  res.json(success({ payment }, 'Payment details.'))
})






exports.checkPaymentStatus = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({
    razorpayOrderId: req.params.razorpayOrderId,
    user: req.user._id,
  }).populate('order', 'orderNumber status')

  if (!payment) return res.status(404).json(error('Payment not found.', 404))

  res.json(success({
    status: payment.status,
    razorpayOrderId: payment.razorpayOrderId,
    razorpayPaymentId: payment.razorpayPaymentId,
    amountInRupees: payment.amountInRupees,
    order: payment.order || null,
    isMock: payment.isMock,
  }, 'Payment status.'))
})





exports.getPaymentConfig = asyncHandler(async (req, res) => {
  res.json(success({
    keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock',
    currency: process.env.PAYMENT_CURRENCY || 'INR',
    isLive: process.env.RAZORPAY_KEY_ID?.startsWith('rzp_live_') || false,
    configured: isConfigured(),
  }, 'Payment config.'))
})

exports.sendOrderMail = asyncHandler(async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json(error('Validation failed.', 400, errors.array()))
  }

  const { user = {}, carts = [], totalQty, totalPrice } = req.body
  const toEmail = user?.email || req.user?.email

  if (!toEmail) {
    return res.status(400).json(error('User email is required to send order confirmation.', 400))
  }

  const normalizedItems = (Array.isArray(carts) ? carts : []).map(item => ({
    image: item?.image || item?.productImage || '',
    title: item?.name || item?.productTitle || item?.title || 'Product',
    qty: Number(item?.qty || item?.quantity || 1),
    price: Number(item?.effectivePrice ?? item?.price ?? 0),
  }))

  const computedQty = normalizedItems.reduce((sum, i) => sum + i.qty, 0)
  const computedTotal = normalizedItems.reduce((sum, i) => sum + (i.qty * i.price), 0)

  const templatePath = path.join(__dirname, '..', 'views', 'emails', 'orderConfirmation.ejs')

  const templateData = {
    customerName: user?.name || req.user?.name || 'Customer',
    customerEmail: toEmail,
    items: normalizedItems,
    totalQty: Number(totalQty) || computedQty,
    totalAmount: Number(totalPrice) || computedTotal,
    formatINR,
  }

  try {
    const html = await ejs.renderFile(templatePath, templateData)
    const resend = getResendClient()

    const result = await resend.emails.send({
      from: process.env.RESEND_FROM || 'MyDealBazaar <onboarding@resend.dev>',
      to: [toEmail],
      subject: 'Order Confirmed 🎉',
      html,
    })

    if (result?.error) {
      logger.error(`[Email] Resend API error: ${JSON.stringify(result.error)}`)
      return res.status(502).json(error('Unable to send order confirmation email.', 502, result.error))
    }

    logger.info(`[Email] Order confirmation sent to ${toEmail} | id=${result?.data?.id || result?.id || 'n/a'}`)
    return res.status(200).json(success({
      emailSent: true,
      to: toEmail,
      messageId: result?.data?.id || result?.id || null,
    }, 'Order confirmation email sent successfully.'))
  } catch (err) {
    logger.error(`[Email] Failed to send order confirmation: ${err.message}`)
    return res.status(500).json(error('Failed to send order confirmation email.', 500))
  }
})

exports.getAllPayments = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query
  const filter = {}
  if (status) filter.status = status

  const pageNum = Math.max(1, Number(page))
  const pageSize = Math.min(100, Number(limit))

  const [payments, total, stats] = await Promise.all([
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .populate('user', 'name email')
      .populate('order', 'orderNumber status')
      .select('-webhookEvents -cartSnapshot'),
    Payment.countDocuments(filter),
    Payment.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amountInRupees' },
        },
      },
    ]),
  ])

  res.json({
    ...paginated(payments, pageNum, pageSize, total),
    stats: stats.reduce((acc, s) => ({
      ...acc,
      [s._id]: { count: s.count, amount: s.totalAmount },
    }), {}),
  })
})




async function createOrderFromPayment(payment, razorpayPaymentEntity) {
  try {
    const snap = payment.cartSnapshot
    if (!snap || !snap.items?.length) {
      logger.warn(`[Webhook] No cart snapshot on payment ${payment._id}`)
      return
    }


    if (payment.order) return

    const orderItems = snap.items.map(i => ({
      product: i.productId,
      name: i.name,
      image: i.image,
      price: i.effectivePrice,
      originalPrice: i.price,
      negotiatedPrice: i.negotiatedPrice || null,
      size: i.size,
      color: i.color,
      qty: i.qty,
    }))

    const order = await Order.create({
      user: payment.user,
      items: orderItems,
      deliveryAddress: payment.deliveryAddress,
      payment: {
        method: payment.method || 'card',
        status: 'paid',
        transactionId: razorpayPaymentEntity.id || payment.razorpayPaymentId,
        gateway: 'razorpay',
        paidAt: new Date(),
      },
      subtotal: snap.subtotal,
      shippingCost: snap.shipping,
      tax: snap.tax,
      discount: snap.discount,
      total: snap.total,
      promoCode: snap.promoCode || '',
      status: 'Confirmed',
      statusHistory: [
        { status: 'Processing', message: 'Order initiated.' },
        { status: 'Confirmed', message: 'Payment confirmed via Razorpay webhook.' },
      ],
      estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })

    payment.order = order._id
    await payment.save()


    await Cart.findOneAndUpdate(
      { user: payment.user },
      { items: [], promoCode: '', discount: 0 }
    )


    await User.findByIdAndUpdate(payment.user, {
      $inc: { totalOrders: 1, totalSpent: snap.total },
    })

    logger.info(`[Webhook] Order created from webhook: ${order.orderNumber}`)
    return order
  } catch (err) {
    logger.error(`[Webhook] Failed to create order from payment: ${err.message}`)
  }
}
