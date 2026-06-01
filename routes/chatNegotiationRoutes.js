'use strict'

const router = require('express').Router()
const ctrl = require('../controllers/chatNegotiationController')
const { protect } = require('../middleware/auth')
const { body, param, runValidation } = require('../middleware/validate')
const { apiLimiter } = require('../middleware/rateLimiter')

router.use(protect)

router.post('/:productId/start',
  apiLimiter,
  param('productId').isMongoId().withMessage('Invalid productId'),
  runValidation,
  ctrl.startSession
)

router.post('/:productId/message',
  apiLimiter,
  param('productId').isMongoId().withMessage('Invalid productId'),
  body('message').trim().notEmpty().withMessage('Message is required'),
  body('itemKey').optional().isString(),
  runValidation,
  ctrl.processChatMessage
)

router.get('/:productId/session',
  param('productId').isMongoId().withMessage('Invalid productId'),
  runValidation,
  ctrl.getSession
)

router.post('/:productId/reset',
  param('productId').isMongoId().withMessage('Invalid productId'),
  runValidation,
  ctrl.resetSession
)

module.exports = router
