const mongoose = require('mongoose')


const wishlistItemSchema = new mongoose.Schema(
  {

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
    },
    addedAt: { type: Date, default: Date.now },
    notifyOnSale: { type: Boolean, default: false },
    priceWhenAdded: { type: Number, default: null },
  },
  { _id: false }
)


const wishlistSchema = new mongoose.Schema(
  {

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],

    },

    items: [wishlistItemSchema],


    itemCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    collection: 'whishlistinfo',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)




wishlistSchema.index({ user: 1 }, { unique: true })
wishlistSchema.index({ 'items.product': 1 })
wishlistSchema.index({ updatedAt: -1 })




wishlistSchema.pre('save', function (next) {
  this.itemCount = this.items.length
  next()
})






wishlistSchema.methods.hasProduct = function (productId) {
  return this.items.some(i => i.product.toString() === productId.toString())
}


wishlistSchema.methods.addProduct = function (productId, currentPrice = null) {
  if (!this.hasProduct(productId)) {
    this.items.push({
      product: productId,
      addedAt: new Date(),
      priceWhenAdded: currentPrice,
    })
  }
  return this
}


wishlistSchema.methods.removeProduct = function (productId) {
  this.items = this.items.filter(
    i => i.product.toString() !== productId.toString()
  )
  return this
}


wishlistSchema.methods.toggle = function (productId, currentPrice = null) {
  const wasPresent = this.hasProduct(productId)
  if (wasPresent) this.removeProduct(productId)
  else this.addProduct(productId, currentPrice)
  return { added: !wasPresent }
}


wishlistSchema.methods.setNotifyOnSale = function (productId, value = true) {
  const item = this.items.find(i => i.product.toString() === productId.toString())
  if (item) item.notifyOnSale = value
  return this
}






wishlistSchema.statics.getOrCreate = async function (userId) {
  let doc = await this.findOne({ user: userId }).populate({
    path: 'items.product',
    select: 'name price min_price originalPrice image category badge inStock rating',
  })
  if (!doc) doc = await this.create({ user: userId, items: [] })
  return doc
}



wishlistSchema.statics.getUsersWhoWishlisted = function (productId) {
  return this.find({ 'items.product': productId })
    .populate('user', 'name email preferences')
    .select('user')
}




const cartItemSchema = new mongoose.Schema(
  {

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },


    key: { type: String, required: true },


    name: { type: String, default: '' },
    image: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, default: null },
    size: { type: String, default: '' },
    color: { type: String, default: '' },
    qty: { type: Number, required: true, min: 1, default: 1 },




    negotiatedPrice: {
      type: Number,
      default: null,
      min: 0,
    },
    is_price_locked: {
      type: Boolean,
      default: false,
    },


    negotiationSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NegotiationSession',
      default: null,
    },


    priceLocked: {
      type: Boolean,
      default: false,
    },

    savedAmount: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
)

const cartSchema = new mongoose.Schema(
  {

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    items: [cartItemSchema],
    promoCode: { type: String, default: '' },
    discount: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'cartinfo',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)


cartSchema.virtual('subtotal').get(function () {
  return +this.items.reduce((s, i) => s + i.price * i.qty, 0).toFixed(2)
})
cartSchema.virtual('shipping').get(function () {
  return this.subtotal >= 1999 ? 0 : 199
})
cartSchema.virtual('tax').get(function () {
  return +Math.round(this.subtotal * 0.05).toFixed(2)
})
cartSchema.virtual('total').get(function () {
  return +(this.subtotal + this.shipping + this.tax - this.discount).toFixed(2)
})
cartSchema.virtual('itemCount').get(function () {
  return this.items.reduce((s, i) => s + i.qty, 0)
})

cartSchema.statics.getOrCreate = async function (userId) {
  let cart = await this.findOne({ user: userId }).populate('items.product', 'name image price inStock min_price')
  if (!cart) cart = await this.create({ user: userId, items: [] })
  return cart
}

const Wishlist = mongoose.model('Wishlist', wishlistSchema)
const Cart = mongoose.model('Cart', cartSchema)

module.exports = { Wishlist, Cart }
