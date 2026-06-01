require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const Product = require('../models/Product')
const User = require('../models/User')
const Order = require('../models/Order')
const { Wishlist, Cart } = require('../models/Wishlist')

const PRODUCTS_DATA = [
  {
    name: 'Premium Leather Jacket', min_price: 5999, price: 7999, originalPrice: 9999, mrp: 11000,
    category: 'men', subCategory: 'jackets', badge: 'Bestseller', featured: true,
    image: 'https://images.pexels.com/photos/17783373/pexels-photo-17783373.jpeg',
    images: ['https://images.pexels.com/photos/17783373/pexels-photo-17783373.jpeg'],
    description: 'Full-grain lambskin leather jacket with a satin lining and YKK hardware.',
    shortDescription: 'Full-grain lambskin, satin lining, YKK zips.',
    rating: 4.8, numReviews: 214, inStock: true, stockCount: 22,
    sizes: ['S', 'M', 'L', 'XL'], colors: ['Jet Black', 'Cognac Brown'],
    tags: ['jacket', 'leather', 'premium', 'winter'],

    variants: [
      { size: 'S', color: 'Jet Black', sku: 'JLKT-S-BLK', price: 5999, stockCount: 5, inStock: true },
      { size: 'M', color: 'Jet Black', sku: 'JLKT-M-BLK', price: 7999, stockCount: 8, inStock: true },
      { size: 'L', color: 'Jet Black', sku: 'JLKT-L-BLK', price: 7999, stockCount: 3, inStock: true },
      { size: 'XL', color: 'Jet Black', sku: 'JLKT-XL-BLK', price: 8499, stockCount: 2, inStock: true },
      { size: 'S', color: 'Cognac Brown', sku: 'JLKT-S-COG', price: 7699, stockCount: 4, inStock: true },
    ],
  },
  {
    name: 'Classic Oxford Shirt', min_price: 999, price: 1299, originalPrice: 1999, mrp: 3229,
    category: 'men', subCategory: 'shirts', badge: 'Sale', featured: false,
    image: 'https://images.pexels.com/photos/3622613/pexels-photo-3622613.jpeg?w=500&h=667&fit=crop',
    images: ['https://images.pexels.com/photos/3622613/pexels-photo-3622613.jpeg?w=500&h=667&fit=crop'],
    description: 'A timeless Oxford shirt crafted from premium 100% Egyptian cotton.',
    shortDescription: '100% Egyptian cotton, button-down collar.',
    rating: 4.5, numReviews: 128, inStock: true, stockCount: 80,
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['White', 'Sky Blue', 'Charcoal'],
    tags: ['shirts', 'formal', 'cotton'],
    variants: [],
  },
  {
    name: 'Slim Fit Chinos', min_price: 5999, price: 7999, originalPrice: 9999, mrp: 12000,
    category: 'men', subCategory: 'trousers', badge: 'Sale', featured: false,
    image: 'https://images.pexels.com/photos/9464625/pexels-photo-9464625.jpeg',
    images: ['https://images.pexels.com/photos/9464625/pexels-photo-9464625.jpeg'],
    description: 'Versatile slim-fit chinos in a refined stretch-cotton blend.',
    shortDescription: 'Stretch-cotton, slim silhouette.',
    rating: 4.3, numReviews: 95, inStock: true, stockCount: 60,
    sizes: ['28', '30', '32', '34', '36'], colors: ['Khaki', 'Navy', 'Olive', 'Black'],
    tags: ['trousers', 'casual', 'stretch'],
    variants: [],
  },
  {
    name: 'Tailored Wool Blazer', min_price: 4999, price: 4999, originalPrice: 6499, mrp: 8000,
    category: 'men', subCategory: 'blazers', badge: null, featured: false,
    image: 'https://images.pexels.com/photos/27438330/pexels-photo-27438330.jpeg',
    images: ['https://images.pexels.com/photos/27438330/pexels-photo-27438330.jpeg'],
    description: 'A heritage wool blazer with half-canvas construction for superior drape.',
    shortDescription: 'Half-canvas, horn buttons, jetted pockets.',
    rating: 4.6, numReviews: 78, inStock: true, stockCount: 35,
    sizes: ['38', '40', '42', '44'], colors: ['Charcoal', 'Navy', 'Tweed'],
    tags: ['blazer', 'formal', 'wool'],
    variants: [],
  },
  {
    name: 'Floral Midi Dress', min_price: 5999, price: 7999, originalPrice: 9999, mrp: 11000,
    category: 'women', subCategory: 'dresses', badge: 'New', featured: true,
    image: 'https://images.pexels.com/photos/28193925/pexels-photo-28193925.jpeg',
    images: ['https://images.pexels.com/photos/28193925/pexels-photo-28193925.jpeg'],
    description: 'A dreamy floral-print midi dress in lightweight chiffon.',
    shortDescription: 'Lightweight chiffon, wrap neckline, tiered skirt.',
    rating: 4.7, numReviews: 183, inStock: true, stockCount: 45,
    sizes: ['XS', 'S', 'M', 'L'], colors: ['Floral Pink', 'Floral Blue'],
    tags: ['dress', 'summer', 'floral'],
    variants: [],
  },
  {
    name: 'Silk Evening Blouse', min_price: 2999, price: 2999, originalPrice: 3999, mrp: 5000,
    category: 'women', subCategory: 'tops', badge: null, featured: false,
    image: 'https://images.pexels.com/photos/20636648/pexels-photo-20636648.jpeg',
    images: ['https://images.pexels.com/photos/20636648/pexels-photo-20636648.jpeg'],
    description: 'A luxurious 100% silk blouse with sculptural sleeves.',
    shortDescription: '100% silk charmeuse, sculptural sleeves.',
    rating: 4.5, numReviews: 67, inStock: true, stockCount: 30,
    sizes: ['XS', 'S', 'M', 'L', 'XL'], colors: ['Ivory', 'Champagne', 'Black'],
    tags: ['blouse', 'silk', 'evening'],
    variants: [],
  },
  {
    name: 'Denim Trucker Jacket', min_price: 2499, price: 2499, originalPrice: 3299, mrp: 4000,
    category: 'women', subCategory: 'jackets', badge: 'Sale', featured: false,
    image: 'https://images.pexels.com/photos/30526284/pexels-photo-30526284.jpeg',
    images: ['https://images.pexels.com/photos/30526284/pexels-photo-30526284.jpeg'],
    description: 'A classic denim trucker jacket reimagined in a modern cropped silhouette.',
    shortDescription: 'Stonewashed selvedge denim, brass hardware.',
    rating: 4.4, numReviews: 112, inStock: true, stockCount: 55,
    sizes: ['XS', 'S', 'M', 'L'], colors: ['Mid Wash', 'Dark Indigo'],
    tags: ['jacket', 'denim', 'casual'],
    variants: [],
  },
  {
    name: 'High-Rise Trousers', min_price: 1899, price: 1899, originalPrice: 2599, mrp: 3000,
    category: 'women', subCategory: 'trousers', badge: 'New', featured: true,
    image: 'https://images.pexels.com/photos/16624071/pexels-photo-16624071.jpeg',
    images: ['https://images.pexels.com/photos/16624071/pexels-photo-16624071.jpeg'],
    description: 'Wide-leg, high-rise trousers cut from a fluid viscose-linen blend.',
    shortDescription: 'Viscose-linen, wide-leg, high-rise.',
    rating: 4.2, numReviews: 55, inStock: true, stockCount: 70,
    sizes: ['XS', 'S', 'M', 'L', 'XL'], colors: ['Cream', 'Blush', 'Sage'],
    tags: ['trousers', 'wide-leg', 'linen'],
    variants: [],
  },
  {
    name: 'Oversized Fleece Hoodie', min_price: 1799, price: 1799, originalPrice: 2499, mrp: 4000,
    category: 'others', subCategory: 'hoodies', badge: 'Bestseller', featured: true,
    image: 'https://images.pexels.com/photos/16982942/pexels-photo-16982942.jpeg',
    images: ['https://images.pexels.com/photos/16982942/pexels-photo-16982942.jpeg'],
    description: 'Ultra-soft garment-dyed fleece hoodie in a relaxed oversized fit.',
    shortDescription: 'Garment-dyed fleece, oversized, kangaroo pocket.',
    rating: 4.9, numReviews: 312, inStock: true, stockCount: 100,
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['Stone', 'Ash Grey', 'Washed Black', 'Dusty Pink'],
    tags: ['hoodie', 'casual', 'unisex', 'fleece'],
    variants: [
      { size: 'S', color: 'Stone', sku: 'FHD-S-STN', price: 1699, stockCount: 30, inStock: true },
      { size: 'M', color: 'Stone', sku: 'FHD-M-STN', price: 1799, stockCount: 25, inStock: true },
      { size: 'L', color: 'Ash Grey', sku: 'FHD-L-ASH', price: 1799, stockCount: 20, inStock: true },
      { size: 'XL', color: 'Washed Black', sku: 'FHD-XL-WBK', price: 1899, stockCount: 15, inStock: true },
      { size: 'XXL', color: 'Dusty Pink', sku: 'FHD-XXL-DPK', price: 1999, stockCount: 10, inStock: true },
    ],
  },
  {
    name: 'Low-Top Canvas Sneakers', min_price: 3299, price: 3299, originalPrice: 3999, mrp: 4500,
    category: 'others', subCategory: 'footwear', badge: null, featured: false,
    image: 'https://images.pexels.com/photos/6128329/pexels-photo-6128329.jpeg',
    images: ['https://images.pexels.com/photos/6128329/pexels-photo-6128329.jpeg'],
    description: 'Vulcanised canvas sneakers with a leather insole and cupsole construction.',
    shortDescription: 'Vulcanised canvas, leather insole, cupsole.',
    rating: 4.6, numReviews: 228, inStock: true, stockCount: 90,
    sizes: ['UK 5', 'UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11'],
    colors: ['Off White', 'Black', 'Ecru'],
    tags: ['sneakers', 'shoes', 'canvas'],
    variants: [],
  },
  {
    name: 'Leather Crossbody Bag', min_price: 4499, price: 4499, originalPrice: 5999, mrp: 7000,
    category: 'others', subCategory: 'bags', badge: 'New', featured: true,
    image: 'https://images.pexels.com/photos/23223840/pexels-photo-23223840.jpeg',
    images: ['https://images.pexels.com/photos/23223840/pexels-photo-23223840.jpeg'],
    description: 'Full-grain vegetable-tanned leather crossbody with gold-tone turnlock.',
    shortDescription: 'Full-grain leather, gold turnlock, adjustable strap.',
    rating: 4.7, numReviews: 89, inStock: true, stockCount: 25,
    sizes: ['One Size'], colors: ['Tan', 'Black', 'Burgundy'],
    tags: ['bag', 'leather', 'accessories'],
    variants: [],
  },
  {
    name: 'Minimalist Quartz Watch', min_price: 6999, price: 6999, originalPrice: 8499, mrp: 10000,
    category: 'others', subCategory: 'watches', badge: 'Premium', featured: false,
    image: 'https://images.pexels.com/photos/5404640/pexels-photo-5404640.jpeg',
    images: ['https://images.pexels.com/photos/5404640/pexels-photo-5404640.jpeg'],
    description: 'Swiss quartz, 40mm stainless steel case, sapphire crystal, 50m WR.',
    shortDescription: 'Swiss quartz, sapphire crystal, 50m WR.',
    rating: 4.8, numReviews: 156, inStock: false, stockCount: 0,
    sizes: ['One Size'], colors: ['Silver/White', 'Gold/Black', 'Rose Gold'],
    tags: ['watch', 'accessories', 'luxury'],
    variants: [
      { size: 'One Size', color: 'Silver/White', sku: 'WCH-OS-SLW', price: 6499, stockCount: 0, inStock: false },
      { size: 'One Size', color: 'Gold/Black', sku: 'WCH-OS-GBK', price: 6999, stockCount: 0, inStock: false },
      { size: 'One Size', color: 'Rose Gold', sku: 'WCH-OS-RGD', price: 7499, stockCount: 0, inStock: false },
    ],
  },
]

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log('✅  Connected to MongoDB Atlas —', mongoose.connection.name)


    console.log('\n🗑️   Clearing collections…')
    await Promise.all([Product.deleteMany({}), User.deleteMany({}), Order.deleteMany({}), Wishlist.deleteMany({}), Cart.deleteMany({}),])
    console.log('products, userinfo, orderinfo, whishlistinfo, cartinfo — cleared\n')


    const products = []
    for (const p of PRODUCTS_DATA) {
      const doc = await new Product(p).save()
      const minP = doc.variants.length > 0 ? Math.min(...doc.variants.map(v => v.price)) : doc.originalPrice
      console.log(`📦  ${doc.name.padEnd(32)} price: ₹${doc.originalPrice}  min_price: ₹${doc.min_price || minP}`)
      products.push(doc)
    }

    const getSellPrice = (product) => product.min_price ?? product.originalPrice ?? 0


    console.log('')
    const adminUser = await User.create({ name: 'Admin User', email: 'admin@MyDealBazaar.in', password: 'admin123', role: 'admin', isEmailVerified: true })
    const dhruvUser = await User.create({
      name: 'Dhruv Patel', email: 'dhruv@MyDealBazaar.in', password: 'user1234', role: 'user',
      phone: '+91 91234 56789', isEmailVerified: true,
      totalOrders: 1, totalSpent: 12177,
      addresses: [{
        label: 'Home', fullName: 'Dhruv Patel', phone: '+91 91234 56789',
        line1: '12 Park Street', line2: 'Flat 4B', city: 'Mumbai',
        state: 'Maharashtra', pin: '400001', country: 'India', isDefault: true,
      }],
    })
    const priyaUser = await User.create({ name: 'Priya Sharma', email: 'priya@example.com', password: 'user1234', role: 'user', phone: '+91 87654 32109', isEmailVerified: true })
    console.log(`👤  admin@MyDealBazaar.in   (admin)     password: admin123`)
    console.log(`👤  dhruv@MyDealBazaar.in   (user)      password: user1234`)
    console.log(`👤  priya@example.com (user)      password: user1234`)


    console.log('')
    const item0Price = getSellPrice(products[0])
    const item8Price = getSellPrice(products[8])
    const subtotal = item0Price + item8Price * 2
    const tax = Math.round(subtotal * 0.05)
    const total = subtotal + tax

    const order = await Order.create({
      user: dhruvUser._id,
      items: [
        { product: products[0]._id, name: products[0].name, image: products[0].image, price: item0Price, size: 'M', color: 'Jet Black', qty: 1, category: 'men' },
        { product: products[8]._id, name: products[8].name, image: products[8].image, price: item8Price, size: 'L', color: 'Stone', qty: 2, category: 'others' },
      ],
      deliveryAddress: { fullName: 'Dhruv Patel', phone: '+91 91234 56789', line1: '12 Park Street', city: 'Mumbai', state: 'Maharashtra', pin: '400001', country: 'India' },
      payment: { method: 'upi', status: 'paid', transactionId: 'TXN001', gateway: 'razorpay', paidAt: new Date() },
      subtotal,
      shippingCost: 0,
      tax,
      discount: 0,
      total,
      status: 'Delivered',
      deliveredAt: new Date(Date.now() - 3 * 86400000),
      estimatedDelivery: new Date(Date.now() + 4 * 86400000),
    })
    console.log(`🛒  Sample order created: ${order.orderNumber} — ₹${order.total}`)


    await Wishlist.create({ user: dhruvUser._id, items: [{ product: products[1]._id, priceWhenAdded: getSellPrice(products[1]) }, { product: products[11]._id, priceWhenAdded: getSellPrice(products[11]), notifyOnSale: true }] })
    await Wishlist.create({ user: priyaUser._id, items: [{ product: products[0]._id, priceWhenAdded: getSellPrice(products[0]) }] })
    console.log(`❤️   Wishlists seeded for Dhruv (2 items) and Priya (1 item)`)

    console.log('\n' + '═'.repeat(60))
    console.log('  SEED COMPLETE')
    console.log('═'.repeat(60))
    console.log(`  products      → ${products.length} docs  (collection: products)`)
    console.log(`  users         → 3 docs  (collection: userinfo)`)
    console.log(`  orders        → 1 doc   (collection: orderinfo)`)
    console.log(`  wishlists     → 2 docs  (collection: whishlistinfo)`)
    console.log('═'.repeat(60))
    console.log('  min_price is auto-set by the pre-save hook.')
    console.log('  Test with: GET /api/products?minPrice=1500&maxPrice=5000')
    console.log('═'.repeat(60) + '\n')

    process.exit(0)
  } catch (err) {
    console.error('\n❌  Seed failed:', err.message)
    console.error(err)
    process.exit(1)
  }
}

seed()
