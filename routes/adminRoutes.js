



'use strict'

const express = require('express')
const router = express.Router()
const multer = require('multer')

const { protect, adminOnly } = require('../middleware/auth')
const admin = require('../controllers/adminController')


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Only image files are allowed'), false)
  },
})

const productUpload = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'images', maxCount: 5 },
])


router.use(protect, adminOnly)


router.get('/dashboard', admin.getDashboard)
router.get('/products', admin.getProducts)
router.get('/products/:id', admin.getProduct)
router.post('/products', productUpload, admin.createProduct)
router.put('/products/:id', productUpload, admin.updateProduct)
router.delete('/products/:id', admin.deleteProduct)
router.get('/orders', admin.getOrders)
router.get('/orders/:id', admin.getOrder)
router.put('/orders/:id', admin.updateOrder)
router.delete('/orders/:id', admin.deleteOrder)
router.get('/users', admin.getUsers)
router.put('/users/:id', admin.updateUser)
router.delete('/users/:id', admin.deleteUser)
router.get('/analytics', admin.getAnalytics)
router.get('/inventory', admin.getInventory)
router.patch('/inventory/:id', admin.updateStock)
router.get('/negotiations', admin.getNegotiations)
router.put('/negotiations/:id', admin.updateNegotiation)

module.exports = router
