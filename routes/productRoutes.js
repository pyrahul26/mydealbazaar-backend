
const router = require('express').Router()
const ctrl = require('../controllers/productController')
const { protect, adminOnly } = require('../middleware/auth')
const { productCreateRules, productQueryRules,
  reviewRules, mongoIdParam, runValidation } = require('../middleware/validate')



router.get('/',productQueryRules,runValidation,ctrl.getProducts)
router.get('/featured', ctrl.getFeaturedProducts)
router.get('/categories', ctrl.getCategories)
router.get('/:id',mongoIdParam('id'),runValidation,ctrl.getProductById)
router.get('/:id/related',mongoIdParam('id'),runValidation,ctrl.getRelatedProducts)
router.post('/:id/reviews',protect,mongoIdParam('id'),reviewRules,runValidation,ctrl.addReview)
router.delete('/:id/reviews/:reviewId',protect,ctrl.deleteReview)
router.post('/',protect,adminOnly,productCreateRules,runValidation,ctrl.createProduct)
router.put('/:id', protect, adminOnly, mongoIdParam('id'), runValidation, ctrl.updateProduct)
router.delete('/:id',protect,adminOnly,mongoIdParam('id'),runValidation,ctrl.deleteProduct)
module.exports = router
