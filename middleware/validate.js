const { body, param, query, validationResult } = require('express-validator')

const runValidation = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      statusCode: 422,
      message: 'Validation failed',
      errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
    })
  }
  next()
}


const signupRules = [
  body('name')
    .trim().notEmpty().withMessage('Name is required')
    .isLength({ max: 80 }).withMessage('Name max 80 characters'),
  body('email')
    .trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Enter a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
]

const loginRules = [
  body('email')
    .trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Enter a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required'),
]

const changePasswordRules = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
]


const productCreateRules = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('category')
    .isIn(['men', 'women', 'others'])
    .withMessage('Category must be men, women, or others'),
  body('image').notEmpty().withMessage('Image URL is required'),
]

const productQueryRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be 1–50'),
  query('maxPrice').optional().isFloat({ min: 0 }).withMessage('maxPrice must be positive'),
  query('sort')
    .optional()
    .isIn(['price_asc', 'price_desc', 'rating', 'newest', ''])
    .withMessage('Invalid sort option'),
]


const addToCartRules = [
  body('productId').notEmpty().withMessage('productId is required').isMongoId().withMessage('Invalid productId'),
  body('size').optional().isString(),
  body('color').optional().isString(),
  body('qty').optional().isInt({ min: 1 }).withMessage('qty must be at least 1'),
]


const placeOrderRules = [
  body('deliveryAddress.fullName').notEmpty().withMessage('Delivery name is required'),
  body('deliveryAddress.phone').notEmpty().withMessage('Phone is required'),
  body('deliveryAddress.line1').notEmpty().withMessage('Address line 1 is required'),
  body('deliveryAddress.city').notEmpty().withMessage('City is required'),
  body('deliveryAddress.state').notEmpty().withMessage('State is required'),
  body('deliveryAddress.pin').notEmpty().withMessage('PIN code is required'),
  body('paymentMethod')
    .notEmpty().withMessage('Payment method is required')
    .isIn(['card', 'upi', 'netbank', 'cod', 'wallet', 'razorpay'])
    .withMessage('Invalid payment method'),
]


const reviewRules = [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1–5'),
  body('comment').trim().notEmpty().withMessage('Comment is required'),
]


const mongoIdParam = (paramName = 'id') => [
  param(paramName).isMongoId().withMessage(`Invalid ${paramName} format`),
]

module.exports = {
  body,
  param,
  query,
  runValidation,
  signupRules,
  loginRules,
  changePasswordRules,
  productCreateRules,
  productQueryRules,
  addToCartRules,
  placeOrderRules,
  reviewRules,
  mongoIdParam,
}
