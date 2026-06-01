const mongoose = require('mongoose')






const reviewSchema = new mongoose.Schema(
  {

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Reviewer user ID is required'],
    },
    name: { type: String, required: true, trim: true },
    avatar: { type: String, default: '' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 100, default: '' },
    comment: { type: String, required: true, trim: true, maxlength: 1000 },
    verified: { type: Boolean, default: false },
  },
  { timestamps: true, _id: true }
)




const variantSchema = new mongoose.Schema(
  {
    size: { type: String, required: true },
    color: { type: String, required: true },
    sku: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    stockCount: { type: Number, default: 0, min: 0 },
    inStock: { type: Boolean, default: true },
  },
  { _id: true }
)


const productSchema = new mongoose.Schema(
  {

    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [120, 'Name cannot exceed 120 characters'],
    },
    slug: {
      type: String,
      unique: true,
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    shortDescription: {
      type: String,
      maxlength: 200,
      default: '',
    },











    min_price: {
      type: Number,
      default: 0,
      min: [0, 'min_price cannot be negative'],

    },

    originalPrice: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },

    mrp: {
      type: Number,
      default: null,
      min: 0,

    },

    currency: {
      type: String,
      default: 'INR',
      enum: ['INR', 'USD', 'EUR'],
    },




    variants: [variantSchema],


    sizes: [{ type: String, trim: true }],
    colors: [{ type: String, trim: true }],


    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: ['men', 'women', 'others'],
      index: true,
    },
    subCategory: {
      type: String,
      default: '',
      trim: true,

    },
    tags: [{ type: String, lowercase: true, trim: true }],


    image: {
      type: String,
      required: [true, 'Main image URL is required'],
    },
    images: [{ type: String }],


    badge: {
      type: String,
      enum: ['Sale', 'New', 'Bestseller', 'Premium', null],
      default: null,
    },
    featured: { type: Boolean, default: false, index: true },


    inStock: { type: Boolean, default: true, index: true },
    stockCount: { type: Number, default: 100, min: 0 },


    reviews: [reviewSchema],
    rating: { type: Number, default: 0, min: 0, max: 5 },
    numReviews: { type: Number, default: 0, min: 0 },


    isActive: { type: Boolean, default: true, index: true },


    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
  },
  {
    timestamps: true,
    collection: 'products',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)




productSchema.index({ name: 'text', description: 'text', tags: 'text' })
productSchema.index({ originalPrice: 1 })
productSchema.index({ min_price: 1 })
productSchema.index({ min_price: 1, category: 1 })
productSchema.index({ rating: -1 })
productSchema.index({ createdAt: -1 })
productSchema.index({ category: 1, isActive: 1 })
productSchema.index({ featured: 1, isActive: 1 })






productSchema.pre('save', function (next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }
  next()
})


productSchema.pre('save', function (next) {
  if (this.variants && this.variants.length > 0) {

    this.min_price = Math.min(...this.variants.map(v => v.price))
  } else {

    this.min_price = this.originalPrice
  }

  next()
})






productSchema.virtual('discountPercent').get(function () {
  if (!this.mrp || this.mrp <= this.originalPrice) return 0
  return Math.round((1 - this.originalPrice / this.mrp) * 100)
})


productSchema.virtual('savingsAmount').get(function () {
  if (!this.mrp || this.mrp <= this.originalPrice) return 0
  return +(this.mrp - this.originalPrice).toFixed(2)
})






productSchema.methods.syncRating = function () {
  const total = this.reviews.length
  this.numReviews = total
  this.rating = total === 0
    ? 0
    : +(this.reviews.reduce((sum, r) => sum + r.rating, 0) / total).toFixed(1)
  return this
}


productSchema.methods.decrementStock = function (qty = 1) {
  this.stockCount = Math.max(0, this.stockCount - qty)
  if (this.stockCount === 0) this.inStock = false
  return this
}






productSchema.statics.findByPriceRange = function (minP, maxP, extraFilter = {}) {
  return this.find({
    ...extraFilter,
    isActive: true,
    min_price: { $gte: minP, $lte: maxP },
  })
}


productSchema.statics.findByCategory = function (category, sort = { createdAt: -1 }) {
  return this.find({ category, isActive: true })
    .sort(sort)
    .select('-reviews -__v')
}

module.exports = mongoose.model('Product', productSchema)
