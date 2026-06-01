








'use strict'

const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/paymentController')
const { protect, adminOnly } = require('../middleware/auth')
const { body, param, query,
  runValidation } = require('../middleware/validate')
const rateLimit = require('express-rate-limit')


const paymentLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  handler: (req, res) => res.status(429).json({
    success: false, statusCode: 429,
    message: 'Too many payment requests. Please wait a moment.',
  }),
})




const rawBodyMiddleware = (req, res, next) => {
  let data = []
  req.on('data', chunk => data.push(chunk))
  req.on('end', () => {
    req.rawBody = Buffer.concat(data).toString()
    try {
      req.body = JSON.parse(req.rawBody)
    } catch (_) {
      req.body = {}
    }
    next()
  })
  req.on('error', next)
}






router.get('/config', ctrl.getPaymentConfig)



router.post('/webhook',
  rawBodyMiddleware,
  ctrl.handleWebhook
)






router.get('/history',
  protect,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  runValidation,
  ctrl.getPaymentHistory
)


router.get('/status/:razorpayOrderId',
  protect,
  ctrl.checkPaymentStatus
)


router.get('/:paymentId',
  protect,
  param('paymentId').isMongoId().withMessage('Invalid paymentId'),
  runValidation,
  ctrl.getPaymentById
)


router.post('/create-order',
  protect,
  paymentLimiter,
  [
    body('amount').optional().isFloat({ min: 1 }).withMessage('Amount must be greater than 0'),
    body('deliveryAddress.fullName').notEmpty().withMessage('Full name required'),
    body('deliveryAddress.phone').notEmpty().withMessage('Phone required'),
    body('deliveryAddress.line1').notEmpty().withMessage('Address required'),
    body('deliveryAddress.city').notEmpty().withMessage('City required'),
    body('deliveryAddress.state').notEmpty().withMessage('State required'),
    body('deliveryAddress.pin').notEmpty().withMessage('PIN required'),
  ],
  runValidation,
  ctrl.createPaymentOrder
)


router.post(['/verify', '/verify-payment'], protect, paymentLimiter,
  [
    body('razorpayOrderId').notEmpty().withMessage('razorpayOrderId required'),
    body('razorpayPaymentId').notEmpty().withMessage('razorpayPaymentId required'),
    body('razorpaySignature').notEmpty().withMessage('razorpaySignature required'),
  ],
  runValidation,
  ctrl.verifyPayment
)

router.post('/send-order-mail',
  protect,
  paymentLimiter,
  [
    body('user').isObject().withMessage('user object is required'),
    body('user.email').isEmail().withMessage('Valid user email is required'),
    body('user.name').optional().isString(),
    body('carts').isArray({ min: 1 }).withMessage('carts must be a non-empty array'),
    body('totalQty').optional().isNumeric(),
    body('totalPrice').optional().isNumeric(),
  ],
  runValidation,
  ctrl.sendOrderMail
)

router.post('/refund/:orderId', protect, param('orderId').isMongoId().withMessage('Invad orderId'), runValidation, ctrl.refundPayment)
router.get('/admin/all', protect, adminOnly, ctrl.getAllPayments)

module.exports = router
