
'use strict'
const router = require('express').Router()
const ctrl = require('../controllers/cartController')
const { protect } = require('../middleware/auth')
const { body, param, runValidation } = require('../middleware/validate')

router.use(protect)
router.get('/', ctrl.getCart)
router.get('/summary', ctrl.getCartSummary)
router.post('/', body('productId').isMongoId(), runValidation, ctrl.addToCart)
router.post('/sync', ctrl.syncCart)
router.post('/promo', ctrl.applyPromo)
router.post('/negotiate/:itemKey',
  param('itemKey').notEmpty(),
  body('negotiationSessionId').optional().isMongoId().withMessage('Valid negotiationSessionId required'),
  body('negotiatedPrice').optional().isFloat({ min: 1 }).withMessage('negotiatedPrice must be positive'),
  runValidation,
  ctrl.applyNegotiatedPrice
)
router.delete('/negotiate/:itemKey', ctrl.removeNegotiatedPrice)
router.put('/:key', ctrl.updateCartItem)
router.delete('/:key', ctrl.removeFromCart)
router.delete('/', ctrl.clearCart)
module.exports = router
