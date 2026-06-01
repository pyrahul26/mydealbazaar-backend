
const router = require('express').Router()
const ctrl = require('../controllers/orderController')
const { protect, adminOnly } = require('../middleware/auth')
const { placeOrderRules, runValidation } = require('../middleware/validate')


router.use(protect)




router.get('/', ctrl.getMyOrders)
router.post('/', placeOrderRules, runValidation, ctrl.placeOrder)
router.get('/:id', ctrl.getOrderById)
router.put('/:id/cancel', ctrl.cancelOrder)
router.post('/:id/return', ctrl.returnOrder)
router.get('/admin/all', adminOnly, ctrl.getAllOrders)
router.get('/admin/stats', adminOnly, ctrl.getDashboardStats)
router.put('/:id/status', adminOnly, ctrl.updateOrderStatus)

module.exports = router
