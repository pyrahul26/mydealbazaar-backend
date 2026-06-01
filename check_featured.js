require('dotenv').config()
const mongoose = require('mongoose')
const Product = require('./models/Product')

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URL)
    const count = await Product.countDocuments({ featured: true })
    const products = await Product.find({ featured: true }, { name: 1, featured: 1 })
    console.log(`Found ${count} featured products:`)
    products.forEach(p => console.log(`  - ${p.name}`))
    process.exit(0)
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}
check()
