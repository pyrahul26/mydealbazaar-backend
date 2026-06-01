
const router  = require('express').Router()
const ctrl    = require('../controllers/authController')
const { protect }                                   = require('../middleware/auth')
const upload                                        = require('../middleware/upload')
const { authLimiter }                               = require('../middleware/rateLimiter')
const { signupRules, loginRules,
  changePasswordRules, runValidation } = require('../middleware/validate')



router.post('/signup',
  authLimiter,
  signupRules,
  runValidation,
  ctrl.signup
)


router.post('/login',
  authLimiter,
  loginRules,
  runValidation,
  ctrl.login
)


router.post('/refresh-token', ctrl.refreshToken)



router.get('/me', protect, ctrl.getMe)


router.post('/logout', protect, ctrl.logout)


router.put('/profile', protect, upload.single('avatar'), ctrl.updateProfile)


router.put('/password',
  protect,
  changePasswordRules,
  runValidation,
  ctrl.changePassword
)


router.post('/address', protect, ctrl.addAddress)


router.delete('/address/:addressId', protect, ctrl.deleteAddress)

module.exports = router
