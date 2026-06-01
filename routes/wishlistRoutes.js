
const router = require('express').Router()
const ctrl = require('../controllers/wishlistController')
const { protect } = require('../middleware/auth')


router.use(protect)


router.get('/', ctrl.getWishlist)
router.post('/', ctrl.addToWishlist)
router.post('/toggle', ctrl.toggleWishlist)
router.delete('/', ctrl.clearWishlist)
router.delete('/:productId', ctrl.removeFromWishlist)
router.post('/:productId/move-to-cart', ctrl.moveToCart)

module.exports = router
