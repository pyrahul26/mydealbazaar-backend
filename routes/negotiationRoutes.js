


const router = require('express').Router()
const ctrl = require('../controllers/negotiationController')
const { protect, adminOnly } = require('../middleware/auth')
const { body, param, runValidation } = require('../middleware/validate')
const { apiLimiter } = require('../middleware/rateLimiter')


router.use(protect)





router.get('/:productId/preview',  param('productId').isMongoId().withMessage('Invalid productId'),runValidation,ctrl.getFloorPreview)
router.get('/history', ctrl.getUserHistory)
router.post('/:productId/start',apiLimiter,param('productId').isMongoId().withMessage('Invalid productId'),runValidation,ctrl.startSession)
router.post('/:sessionId/offer',
  apiLimiter,
  param('sessionId').isMongoId().withMessage('Invalid sessionId'),
  body('message').trim().notEmpty().withMessage('Message is required'),
  body('itemKey').optional().isString(),
  body('offerAmount').optional().isFloat({ min: 1 }).withMessage('offerAmount must be positive'),
  runValidation,
  ctrl.submitOffer
)
router.get('/:sessionId',param('sessionId').isMongoId().withMessage('Invalid sessionId'),runValidation,ctrl.getSession)
router.get('/admin/stats', adminOnly, ctrl.getAdminStats)
router.post('/:sessionId/lock-to-cart', protect, param('sessionId').isMongoId().withMessage('Invalid sessionId'), body('itemKey').notEmpty().withMessage('itemKey is required'), runValidation,ctrl.lockPriceToCart)


module.exports = router
