const { Wishlist } = require('../models/Wishlist')
const Product = require('../models/Product')
const { success, error } = require('../utils/apiResponse')
const { asyncHandler } = require('../middleware/errorHandler')




exports.getWishlist = asyncHandler(async (req, res) => {
  const wishlist = await Wishlist.getOrCreate(req.user._id)

  await wishlist.populate({
    path: 'items.product',
    select: 'name originalPrice mrp image category badge rating inStock',
  })

  res.json(success({
    items: wishlist.items,
    count: wishlist.items.length,
  }, 'Wishlist fetched.'))
})





exports.addToWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.body

  const product = await Product.findOne({ _id: productId, isActive: true })
  if (!product) return res.status(404).json(error('Product not found.', 404))

  const wishlist = await Wishlist.getOrCreate(req.user._id)

  if (wishlist.hasProduct(productId)) {
    return res.status(400).json(error('Product is already in your wishlist.', 400))
  }

  wishlist.addProduct(productId)
  await wishlist.save()
  await wishlist.populate({ path: 'items.product', select: 'name originalPrice mrp image category badge rating inStock' })

  res.status(201).json(success({ items: wishlist.items, count: wishlist.items.length }, `"${product.name}" added to wishlist.`, 201))
})




exports.removeFromWishlist = asyncHandler(async (req, res) => {
  const wishlist = await Wishlist.findOne({ user: req.user._id })
  if (!wishlist) return res.json(success({ items: [], count: 0 }, 'Wishlist is already empty.'))

  wishlist.removeProduct(req.params.productId)
  await wishlist.save()
  await wishlist.populate({ path: 'items.product', select: 'name originalPrice mrp image category badge rating inStock' })

  res.json(success({ items: wishlist.items, count: wishlist.items.length }, 'Item removed from wishlist.'))
})






exports.toggleWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.body

  const product = await Product.findOne({ _id: productId, isActive: true })
  if (!product) return res.status(404).json(error('Product not found.', 404))

  const wishlist = await Wishlist.getOrCreate(req.user._id)
  const wasAdded = !wishlist.hasProduct(productId)

  if (wasAdded) wishlist.addProduct(productId)
  else wishlist.removeProduct(productId)

  await wishlist.save()
  await wishlist.populate({ path: 'items.product', select: 'name price originalPrice image category badge rating inStock' })

  res.json(success({
    added: wasAdded,
    items: wishlist.items,
    count: wishlist.items.length,
  }, wasAdded ? `"${product.name}" added to wishlist.` : `"${product.name}" removed from wishlist.`))
})




exports.clearWishlist = asyncHandler(async (req, res) => {
  await Wishlist.findOneAndUpdate({ user: req.user._id }, { items: [] })
  res.json(success({ items: [], count: 0 }, 'Wishlist cleared.'))
})





exports.moveToCart = asyncHandler(async (req, res) => {
  const { productId } = req.params
  const { size, color } = req.body
  const { Cart } = require('../models/Wishlist')

  const product = await Product.findOne({ _id: productId, isActive: true })
  if (!product) return res.status(404).json(error('Product not found.', 404))
  if (!product.inStock) return res.status(400).json(error('Product is out of stock.', 400))


  const cart = await Cart.getOrCreate(req.user._id)
  const resolvedSize = size || product.sizes[0] || ''
  const resolvedColor = color || product.colors[0] || ''
  const key = `${productId}-${resolvedSize}-${resolvedColor}`
  const existing = cart.items.find(i => i.key === key)

  if (existing) existing.qty += 1
  else cart.items.push({
    product: productId, key,
    name: product.name, image: product.image, price: product.originalPrice ?? product.min_price ?? 0,
    originalPrice: product.originalPrice ?? product.min_price ?? 0, mrp: product.mrp || null,
    size: resolvedSize, color: resolvedColor, qty: 1,
  })
  await cart.save()


  const wishlist = await Wishlist.findOne({ user: req.user._id })
  if (wishlist) {
    wishlist.removeProduct(productId)
    await wishlist.save()
  }

  await cart.populate('items.product', 'name image price inStock')
  await wishlist?.populate({ path: 'items.product', select: 'name price image inStock' })

  res.json(success({
    cart: { items: cart.items, total: cart.total, itemCount: cart.itemCount },
    wishlist: { items: wishlist?.items || [], count: wishlist?.items.length || 0 },
  }, `"${product.name}" moved to cart.`))
})
