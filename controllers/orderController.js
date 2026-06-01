const Order = require('../models/Order')
const { Cart } = require('../models/Wishlist')
const { success, error, paginated } = require('../utils/apiResponse')
const { asyncHandler } = require('../middleware/errorHandler')
const logger = require('../utils/logger')

exports.getMyOrders = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query

  const filter = { user: req.user._id }
  if (status) filter.status = status

  const pageNum = Math.max(1, Number(page))
  const pageSize = Math.min(50, Number(limit))
  const skip = (pageNum - 1) * pageSize

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .select('-statusHistory -__v'),
    Order.countDocuments(filter),
  ])

  res.json(paginated(orders, pageNum, pageSize, total))
})




exports.getOrderById = asyncHandler(async (req, res) => {
  const query = req.user.role === 'admin'
    ? { _id: req.params.id }
    : { _id: req.params.id, user: req.user._id }

  const order = await Order.findOne(query)
    .populate('user', 'name email phone')
    .populate('items.product', 'name image price category')

  if (!order) return res.status(404).json(error('Order not found.', 404))
  res.json(success({ order }, 'Order fetched.'))
})






exports.placeOrder = asyncHandler(async (req, res) => {
  const { deliveryAddress, paymentMethod, promoCode = '', paymentId = '' } = req.body


  const cart = await Cart.findOne({ user: req.user._id })
    .populate('items.product', 'name image price inStock stockCount')

  if (!cart || cart.items.length === 0) {
    return res.status(400).json(error('Your cart is empty. Add items before placing an order.', 400))
  }


  const outOfStock = cart.items.filter(i => !i.product?.inStock)
  if (outOfStock.length > 0) {
    const names = outOfStock.map(i => i.product?.name || 'Unknown').join(', ')
    return res.status(400).json(
      error(`The following items are out of stock: ${names}. Please remove them before ordering.`, 400)
    )
  }


  const subtotal = cart.subtotal
  const shippingCost = subtotal >= 1999 ? 0 : 199
  const tax = Math.round(subtotal * 0.05)
  const discount = cart.discount || 0
  const total = +(subtotal + shippingCost + tax - discount).toFixed(2)


  const items = cart.items.map(i => ({
    product: i.product._id,
    name: i.product.name,
    image: i.product.image,

    price: i.negotiatedPrice != null ? i.negotiatedPrice : i.price,
    originalPrice: i.price,
    negotiatedPrice: i.negotiatedPrice || null,
    negotiationSessionId: i.negotiationSessionId || null,
    size: i.size,
    color: i.color,
    qty: i.qty,
    category: i.product?.category || '',
  }))


  const order = await Order.create({
    user: req.user._id,
    items,
    deliveryAddress,
    paymentMethod,
    paymentStatus: paymentMethod === 'cod' ? 'pending' : 'paid',
    paymentId,
    paidAt: paymentMethod !== 'cod' ? new Date() : undefined,
    subtotal,
    shippingCost,
    tax,
    discount,
    total,
    promoCode,
    estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    statusHistory: [{ status: 'Processing', message: 'Order placed successfully.' }],
  })


  await Cart.findOneAndUpdate(
    { user: req.user._id },
    { items: [], promoCode: '', discount: 0 }
  )

  logger.info(`Order placed: ${order.orderNumber} by user ${req.user._id} — ₹${total}`)

  res.status(201).json(success(
    { order: { _id: order._id, orderNumber: order.orderNumber, total, status: order.status, estimatedDelivery: order.estimatedDelivery } },
    `Order ${order.orderNumber} placed successfully.`, 201
  ))
})





exports.cancelOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id })
  if (!order) return res.status(404).json(error('Order not found.', 404))

  const cancellable = ['Processing', 'Confirmed']
  if (!cancellable.includes(order.status)) {
    return res.status(400).json(
      error(`Cannot cancel an order with status "${order.status}". Contact support.`, 400)
    )
  }

  order.status = 'Cancelled'
  order.cancelReason = req.body.reason || 'Cancelled by customer'
  await order.save()

  logger.info(`Order cancelled: ${order.orderNumber}`)
  res.json(success({ order: { _id: order._id, orderNumber: order.orderNumber, status: order.status } }, 'Order cancelled successfully.'))
})





exports.returnOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id })
  if (!order) return res.status(404).json(error('Order not found.', 404))

  if (order.status !== 'Delivered') {
    return res.status(400).json(error('Only delivered orders can be returned.', 400))
  }

  const daysSinceDelivery = order.deliveredAt
    ? (Date.now() - order.deliveredAt.getTime()) / (1000 * 60 * 60 * 24)
    : 0

  if (daysSinceDelivery > 30) {
    return res.status(400).json(error('Return window has expired (30 days from delivery).', 400))
  }

  order.status = 'Returned'
  await order.save()

  res.json(success({ order: { _id: order._id, orderNumber: order.orderNumber, status: order.status } }, 'Return request submitted. Refund will be processed within 5-7 business days.'))
})





exports.updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, message = '', trackingNumber } = req.body

  const validStatuses = ['Processing', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled', 'Returned']
  if (!validStatuses.includes(status)) {
    return res.status(400).json(error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400))
  }

  const order = await Order.findById(req.params.id)
  if (!order) return res.status(404).json(error('Order not found.', 404))

  order.status = status
  if (trackingNumber) order.trackingNumber = trackingNumber
  if (status === 'Delivered') {
    order.deliveredAt = new Date()
    order.paymentStatus = 'paid'
  }


  if (message) order.statusHistory.push({ status, message, updatedBy: req.user._id })

  await order.save()

  logger.info(`Order ${order.orderNumber} status → ${status} by admin ${req.user._id}`)
  res.json(success({ order: { _id: order._id, orderNumber: order.orderNumber, status, trackingNumber: order.trackingNumber } }, `Order status updated to "${status}".`))
})





exports.getAllOrders = asyncHandler(async (req, res) => {
  const { status, userId, page = 1, limit = 20 } = req.query

  const filter = {}
  if (status) filter.status = status
  if (userId) filter.user = userId

  const pageNum = Math.max(1, Number(page))
  const pageSize = Math.min(100, Number(limit))
  const skip = (pageNum - 1) * pageSize

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .populate('user', 'name email phone')
      .select('-statusHistory'),
    Order.countDocuments(filter),
  ])


  const stats = await Order.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$total' },
      },
    },
  ])

  res.json({
    ...paginated(orders, pageNum, pageSize, total),
    stats: stats.reduce((acc, s) => ({ ...acc, [s._id]: { count: s.count, amount: s.totalAmount } }), {}),
  })
})




exports.getDashboardStats = asyncHandler(async (req, res) => {
  const [
    totalOrders,
    totalRevenue,
    ordersByStatus,
    recentOrders,
    topProducts,
  ] = await Promise.all([
    Order.countDocuments(),
    Order.aggregate([{ $match: { paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Order.find().sort({ createdAt: -1 }).limit(5).populate('user', 'name email').select('orderNumber total status createdAt user'),
    Order.aggregate([
      { $unwind: '$items' },
      { $group: { _id: '$items.product', name: { $first: '$items.name' }, totalSold: { $sum: '$items.qty' }, revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } } } },
      { $sort: { totalSold: -1 } },
      { $limit: 5 },
    ]),
  ])

  res.json(success({
    stats: {
      totalOrders,
      totalRevenue: totalRevenue[0]?.total || 0,
      ordersByStatus: ordersByStatus.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
      recentOrders,
      topProducts,
    },
  }, 'Dashboard stats fetched.'))
})
