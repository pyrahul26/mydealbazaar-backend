const Product = require('../models/Product')
const { success, error, paginated } = require('../utils/apiResponse')
const { asyncHandler } = require('../middleware/errorHandler')


exports.getProducts = asyncHandler(async (req, res) => {
  const {
    category, sort = '', search = '',
    maxPrice, minPrice,
    page = 1, limit = 12,
    badge, inStock,
  } = req.query


  const filter = { isActive: true }

  if (category && category !== 'all') filter.category = category
  if (badge) filter.badge = badge
  if (inStock !== undefined) filter.inStock = inStock === 'true'



  if (maxPrice || minPrice) {
    filter.min_price = {}
    if (minPrice) filter.min_price.$gte = Number(minPrice)
    if (maxPrice) filter.min_price.$lte = Number(maxPrice)
  }


  if (search.trim()) {
    filter.$or = [
      { name: { $regex: search.trim(), $options: 'i' } },
      { description: { $regex: search.trim(), $options: 'i' } },
      { tags: { $in: [new RegExp(search.trim(), 'i')] } },
    ]
  }


  const sortMap = {
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    rating: { rating: -1, numReviews: -1 },
    newest: { createdAt: -1 },
    popular: { numReviews: -1, rating: -1 },
  }
  const sortObj = sortMap[sort] || { featured: -1, createdAt: -1 }


  const pageNum = Math.max(1, Number(page))
  const pageSize = Math.min(50, Math.max(1, Number(limit)))
  const skip = (pageNum - 1) * pageSize


  const [products, total] = await Promise.all([
    Product.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(pageSize)
      .select('-reviews -__v'),
    Product.countDocuments(filter),
  ])

  res.json(paginated(products, pageNum, pageSize, total))
})




exports.getFeaturedProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({ featured: true, isActive: true })
    .limit(8)
    .sort({ createdAt: -1 })
    .select('-reviews -__v')
  res.json(success({ products }, 'Featured products fetched.'))
})




exports.getCategories = asyncHandler(async (req, res) => {
  const counts = await Product.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ])
  const map = Object.fromEntries(counts.map(c => [c._id, c.count]))
  res.json(success({
    categories: [
      { id: 'men', label: 'Men', count: map.men || 0 },
      { id: 'women', label: 'Women', count: map.women || 0 },
      { id: 'others', label: 'Accessories', count: map.others || 0 },
    ]
  }, 'Categories fetched.'))
})




exports.getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, isActive: true })
    .populate('reviews.user', 'name avatar')
  if (!product) return res.status(404).json(error('Product not found.', 404))
  res.json(success({ product }, 'Product fetched.'))
})




exports.getRelatedProducts = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).select('category tags')
  if (!product) return res.status(404).json(error('Product not found.', 404))

  const related = await Product.find({
    _id: { $ne: product._id },
    isActive: true,
    $or: [
      { category: product.category },
      { tags: { $in: product.tags } },
    ],
  })
    .limit(4)
    .select('-reviews -__v')

  res.json(success({ products: related }, 'Related products.'))
})




exports.addReview = asyncHandler(async (req, res) => {
  const { rating, comment, title = '' } = req.body
  const product = await Product.findById(req.params.id)
  if (!product) return res.status(404).json(error('Product not found.', 404))

  const alreadyReviewed = product.reviews.some(
    r => r.user.toString() === req.user._id.toString()
  )
  if (alreadyReviewed) {
    return res.status(400).json(error('You have already reviewed this product.', 400))
  }

  product.reviews.push({
    user: req.user._id,
    name: req.user.name,
    avatar: req.user.avatar || '',
    rating: Number(rating),
    title,
    comment,
  })
  product.syncRating()
  await product.save()

  res.status(201).json(success(
    { review: product.reviews.at(-1), rating: product.rating, numReviews: product.numReviews },
    'Review added.', 201
  ))
})




exports.deleteReview = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
  if (!product) return res.status(404).json(error('Product not found.', 404))

  const review = product.reviews.id(req.params.reviewId)
  if (!review) return res.status(404).json(error('Review not found.', 404))

  const isOwner = review.user.toString() === req.user._id.toString()
  if (!isOwner && req.user.role !== 'admin') {
    return res.status(403).json(error('Not authorised to delete this review.', 403))
  }

  review.deleteOne()
  product.syncRating()
  await product.save()

  res.json(success({}, 'Review deleted.'))
})




exports.createProduct = asyncHandler(async (req, res) => {
  const product = await Product.create(req.body)
  res.status(201).json(success({ product }, 'Product created.', 201))
})




exports.updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(
    req.params.id, req.body, { new: true, runValidators: true }
  )
  if (!product) return res.status(404).json(error('Product not found.', 404))
  res.json(success({ product }, 'Product updated.'))
})




exports.deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(
    req.params.id, { isActive: false }, { new: true }
  )
  if (!product) return res.status(404).json(error('Product not found.', 404))
  res.json(success({}, 'Product deleted.'))
})
