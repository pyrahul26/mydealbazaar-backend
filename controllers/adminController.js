'use strict'
const mongoose = require('mongoose')
const User = require('../models/User')
const Product = require('../models/Product')
const Order = require('../models/Order')
const NegotiationSession = require('../models/NegotiationSession')
const ChatNegotiation = require('../models/ChatNegotiation')
const { success, error, paginated } = require('../utils/apiResponse')
const { asyncHandler } = require('../middleware/errorHandler')
const cloudinary = require('../Cloudinary/cloudinary')
const streamifier = require('streamifier')
const logger = require('../utils/logger')

const parseBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    if (v === 'true') return true
    if (v === 'false') return false
  }
  return fallback
}

const parseNumber = (value, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const parseStringArray = (value) => {
  if (Array.isArray(value)) return value
  if (value === undefined || value === null) return []

  const raw = String(value).trim()
  if (!raw) return []


  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {

    }
  }


  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}


const uploadToCloudinary = (fileBuffer, folder = 'MyDealBazaar/products') =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [
          { width: 800, height: 800, crop: 'limit' },
          { quality: 'auto', fetch_format: 'auto' },
        ],
      },
      (err, result) => (err ? reject(err) : resolve(result))
    )
    streamifier.createReadStream(fileBuffer).pipe(stream)
  })






exports.getDashboard = asyncHandler(async (req, res) => {
  const [
    totalProducts,
    totalUsers,
    totalOrders,
    outOfStock,
    pendingOrders,
    revenueAgg,
    recentOrders,
    topProducts,
    monthlySales,
  ] = await Promise.all([
    Product.countDocuments({ isActive: true }),
    User.countDocuments({ isActive: true, role: 'user' }),
    Order.countDocuments(),
    Product.countDocuments({ isActive: true, inStock: false }),
    Order.countDocuments({ status: 'Processing' }),


    Order.aggregate([
      { $match: { 'payment.status': 'paid' } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),


    Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('user', 'name email avatar')
      .select('orderNumber status total createdAt user payment'),


    Order.aggregate([
      { $unwind: '$items' },
      { $group: { _id: '$items.product', name: { $first: '$items.name' }, image: { $first: '$items.image' }, totalSold: { $sum: '$items.qty' }, revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } } } },
      { $sort: { totalSold: -1 } },
      { $limit: 5 },
    ]),


    Order.aggregate([
      {
        $match: {
          'payment.status': 'paid',
          createdAt: { $gte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ])

  const totalRevenue = revenueAgg[0]?.total || 0

  res.json(
    success(
      {
        stats: { totalProducts, totalUsers, totalOrders, totalRevenue, outOfStock, pendingOrders },
        recentOrders,
        topProducts,
        monthlySales,
      },
      'Dashboard data fetched'
    )
  )
})






exports.getProducts = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(50, parseInt(req.query.limit) || 12)
  const skip = (page - 1) * limit
  const { search, category, inStock } = req.query

  const filter = {}
  if (search) filter.$text = { $search: search }
  if (category) filter.category = category
  if (inStock === 'true') filter.inStock = true
  if (inStock === 'false') filter.inStock = false

  const [products, total] = await Promise.all([
    Product.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-reviews -__v'),
    Product.countDocuments(filter),
  ])

  res.json(paginated(products, page, limit, total))
})


exports.getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
  if (!product) return res.status(404).json(error('Product not found', 404))
  res.json(success({ product }, 'Product fetched'))
})


exports.createProduct = asyncHandler(async (req, res) => {
  const {
    name, description, shortDescription, originalPrice, mrp,
    category, subCategory, sizes, colors, badge, featured,
    stockCount, inStock, tags, metaTitle, metaDescription,
  } = req.body

  let imageUrl = req.body.image || ''
  let imagesArr = []


  if (req.files?.image?.[0]) {
    const result = await uploadToCloudinary(req.files.image[0].buffer)
    imageUrl = result.secure_url
  }


  if (req.files?.images) {
    const uploads = await Promise.all(
      req.files.images.map(f => uploadToCloudinary(f.buffer))
    )
    imagesArr = uploads.map(u => u.secure_url)
  }

  const product = await Product.create({
    name, description, shortDescription,
    originalPrice: parseNumber(originalPrice, 0),
    mrp: mrp ? parseNumber(mrp, 0) : null,
    category, subCategory,
    sizes: parseStringArray(sizes),
    colors: parseStringArray(colors),
    badge,
    featured: parseBoolean(featured, false),
    stockCount: parseNumber(stockCount, 100),
    inStock: parseBoolean(inStock, true),
    tags: parseStringArray(tags),
    image: imageUrl,
    images: imagesArr,
    metaTitle, metaDescription,
  })

  logger.info(`[Admin] Product created: ${product.name} by ${req.user.email}`)
  res.status(201).json(success({ product }, 'Product created successfully', 201))
})


exports.updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
  if (!product) return res.status(404).json(error('Product not found', 404))

  const fields = [
    'name', 'description', 'shortDescription', 'originalPrice', 'mrp',
    'category', 'subCategory', 'badge',
    'metaTitle', 'metaDescription',
  ]
  fields.forEach(f => { if (req.body[f] !== undefined) product[f] = req.body[f] })

  if (req.body.featured !== undefined) {
    product.featured = parseBoolean(req.body.featured, product.featured)
  }
  if (req.body.inStock !== undefined) {
    product.inStock = parseBoolean(req.body.inStock, product.inStock)
  }
  if (req.body.stockCount !== undefined) {
    product.stockCount = parseNumber(req.body.stockCount, product.stockCount)
  }
  if (req.body.originalPrice !== undefined) {
    product.originalPrice = parseNumber(req.body.originalPrice, product.originalPrice)
  }
  if (req.body.mrp !== undefined) {
    product.mrp = req.body.mrp === '' ? null : parseNumber(req.body.mrp, product.mrp)
  }


  if (req.body.sizes !== undefined) product.sizes = parseStringArray(req.body.sizes)
  if (req.body.colors !== undefined) product.colors = parseStringArray(req.body.colors)
  if (req.body.tags !== undefined) product.tags = parseStringArray(req.body.tags)


  if (req.files?.image?.[0]) {
    const result = await uploadToCloudinary(req.files.image[0].buffer)
    product.image = result.secure_url
  }
  if (req.files?.images) {
    const uploads = await Promise.all(req.files.images.map(f => uploadToCloudinary(f.buffer)))
    product.images = uploads.map(u => u.secure_url)
  }


  if (product.stockCount === 0) product.inStock = false

  await product.save()
  logger.info(`[Admin] Product updated: ${product.name} by ${req.user.email}`)
  res.json(success({ product }, 'Product updated successfully'))
})


exports.deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
  if (!product) return res.status(404).json(error('Product not found', 404))

  product.isActive = false
  await product.save()

  logger.info(`[Admin] Product soft-deleted: ${product.name} by ${req.user.email}`)
  res.json(success({}, 'Product deleted successfully'))
})






exports.getOrders = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(50, parseInt(req.query.limit) || 15)
  const skip = (page - 1) * limit
  const { status, search } = req.query

  const filter = {}
  if (status) filter.status = status
  if (search) filter.orderNumber = { $regex: search, $options: 'i' }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email phone')
      .select('-__v'),
    Order.countDocuments(filter),
  ])

  res.json(paginated(orders, page, limit, total))
})


exports.getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('user', 'name email phone')
    .populate('items.product', 'name image')
  if (!order) return res.status(404).json(error('Order not found', 404))
  res.json(success({ order }, 'Order fetched'))
})


exports.updateOrder = asyncHandler(async (req, res) => {
  const { status, trackingNumber, courierPartner, cancelReason, estimatedDelivery } = req.body
  const order = await Order.findById(req.params.id)
  if (!order) return res.status(404).json(error('Order not found', 404))

  const validStatuses = ['Processing', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled', 'Returned']
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json(error('Invalid status value', 400))
  }

  if (status) order.status = status
  if (trackingNumber) order.trackingNumber = trackingNumber
  if (courierPartner) order.courierPartner = courierPartner
  if (cancelReason) order.cancelReason = cancelReason
  if (estimatedDelivery) order.estimatedDelivery = new Date(estimatedDelivery)
  if (status === 'Delivered') order.deliveredAt = new Date()

  await order.save()
  logger.info(`[Admin] Order ${order.orderNumber} → ${order.status} by ${req.user.email}`)
  res.json(success({ order }, 'Order updated successfully'))
})


exports.deleteOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
  if (!order) return res.status(404).json(error('Order not found', 404))
  await order.deleteOne()
  res.json(success({}, 'Order deleted'))
})






exports.getUsers = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(50, parseInt(req.query.limit) || 15)
  const skip = (page - 1) * limit
  const { search, role } = req.query

  const filter = {}
  if (role) filter.role = role
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ]
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v -addresses -preferences'),
    User.countDocuments(filter),
  ])

  res.json(paginated(users, page, limit, total))
})


exports.updateUser = asyncHandler(async (req, res) => {
  const { role, isActive } = req.body


  if (String(req.params.id) === String(req.user._id)) {
    return res.status(400).json(error('Cannot edit your own account here', 400))
  }

  const user = await User.findById(req.params.id)
  if (!user) return res.status(404).json(error('User not found', 404))

  if (role !== undefined) user.role = role
  if (isActive !== undefined) user.isActive = isActive
  await user.save()

  logger.info(`[Admin] User ${user.email} updated by ${req.user.email}`)
  res.json(success({ user: { _id: user._id, name: user.name, email: user.email, role: user.role, isActive: user.isActive } }, 'User updated'))
})


exports.deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
  if (!user) return res.status(404).json(error('User not found', 404))
  if (String(req.params.id) === String(req.user._id)) {
    return res.status(400).json(error('Cannot delete your own account', 400))
  }

  user.isActive = false
  await user.save()
  res.json(success({}, 'User deactivated'))
})






exports.getAnalytics = asyncHandler(async (req, res) => {
  const now = new Date()
  const start7 = new Date(now - 7 * 86400000)
  const start30 = new Date(now - 30 * 86400000)

  const [
    dailySales,
    weeklySales,
    monthlySales,
    ordersByStatus,
    categoryRevenue,
    negotiationStats,
  ] = await Promise.all([

    Order.aggregate([
      { $match: { 'payment.status': 'paid', createdAt: { $gte: start7 } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$total' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),


    Order.aggregate([
      { $match: { 'payment.status': 'paid', createdAt: { $gte: start30 } } },
      { $group: { _id: { $week: '$createdAt' }, revenue: { $sum: '$total' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),


    Order.aggregate([
      { $match: { 'payment.status': 'paid', createdAt: { $gte: new Date(now - 180 * 86400000) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, revenue: { $sum: '$total' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),


    Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),


    Order.aggregate([
      { $match: { 'payment.status': 'paid' } },
      { $unwind: '$items' },
      { $group: { _id: '$items.category', revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } }, sold: { $sum: '$items.qty' } } },
      { $sort: { revenue: -1 } },
    ]),


    ChatNegotiation.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).catch(() => []),
  ])

  res.json(
    success(
      { dailySales, weeklySales, monthlySales, ordersByStatus, categoryRevenue, negotiationStats },
      'Analytics data fetched'
    )
  )
})






exports.getInventory = asyncHandler(async (req, res) => {
  const [lowStock, outOfStock, all, stockByCategory] = await Promise.all([
    Product.find({ isActive: true, stockCount: { $gt: 0, $lte: 10 } })
      .select('name image category stockCount inStock originalPrice')
      .sort({ stockCount: 1 }),
    Product.find({ isActive: true, inStock: false })
      .select('name image category stockCount inStock originalPrice')
      .sort({ updatedAt: -1 }),
    Product.find({ isActive: true })
      .select('name image category stockCount inStock originalPrice')
      .sort({ stockCount: 1 })
      .limit(100),
    Product.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$category',
          totalStock: { $sum: { $ifNull: ['$stockCount', 0] } },
          products: { $sum: 1 },
        },
      },
      { $sort: { totalStock: -1 } },
    ]),
  ])

  const summary = {
    total: all.length,
    lowStockCount: lowStock.length,
    outOfStockCount: outOfStock.length,
  }

  res.json(success({ lowStock, outOfStock, all, stockByCategory, summary }, 'Inventory fetched'))
})


exports.updateStock = asyncHandler(async (req, res) => {
  const { stockCount } = req.body
  const product = await Product.findById(req.params.id)
  if (!product) return res.status(404).json(error('Product not found', 404))

  product.stockCount = Math.max(0, parseInt(stockCount))
  product.inStock = product.stockCount > 0
  await product.save()

  res.json(success({ product: { _id: product._id, name: product.name, stockCount: product.stockCount, inStock: product.inStock } }, 'Stock updated'))
})






exports.getNegotiations = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(50, parseInt(req.query.limit) || 15)
  const skip = (page - 1) * limit
  const { status } = req.query

  const filter = {}
  if (status === 'rejected') {
    filter.status = 'rejected'
  } else if (status === 'approved') {
    filter.status = 'accepted'
  } else if (status === 'completed') {
    filter.status = { $in: ['accepted', 'rejected'] }
  } else if (status === 'pending') {
    filter.status = 'negotiating'
    filter.is_price_locked = false
  } else if (status === 'active') {
    filter.status = 'negotiating'
  }

  const [sessions, total] = await Promise.all([
    ChatNegotiation.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user_id', 'name email avatar')
      .populate('product_id', 'name image originalPrice min_price'),
    ChatNegotiation.countDocuments(filter),
  ])

  const normalizeStatus = (s) => {
    if (s.status === 'accepted') return 'accepted'
    if (s.status === 'rejected') return 'rejected'
    if ((s.attempts_count || 0) >= (s.max_attempts || 3)) return 'pending'
    return 'active'
  }

  const data = sessions.map((s) => ({
    _id: s._id,
    product: s.product_id,
    user: s.user_id,
    offeredPrice: s.last_user_price ?? s.final_price ?? null,
    finalPrice: s.final_price ?? null,
    status: normalizeStatus(s),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }))

  res.json(paginated(data, page, limit, total))
})


exports.updateNegotiation = asyncHandler(async (req, res) => {
  const { adminDecision, status, adminNote } = req.body
  const decision = String(adminDecision || status || '').toLowerCase()

  let session = await ChatNegotiation.findById(req.params.id)
  if (session) {
    if (['approved', 'accepted'].includes(decision)) {
      session.status = 'accepted'
      session.is_price_locked = true
      if (!session.final_price && session.last_bot_price) {
        session.final_price = session.last_bot_price
      }
    } else if (decision === 'rejected') {
      session.status = 'rejected'
      session.is_price_locked = false
    } else if (['active', 'pending', 'negotiating'].includes(decision)) {
      session.status = 'negotiating'
    }

    await session.save()

    return res.json(success({ session }, 'Negotiation updated'))
  }


  session = await NegotiationSession.findById(req.params.id)
  if (!session) return res.status(404).json(error('Negotiation not found', 404))

  if (decision === 'rejected') session.status = 'REJECTED'
  else if (['approved', 'accepted'].includes(decision)) session.status = 'ACCEPTED'
  else if (['active', 'pending', 'negotiating'].includes(decision)) session.status = 'ACTIVE'
  if (adminNote) session.adminNote = adminNote

  await session.save()

  res.json(success({ session }, 'Negotiation updated'))
})
