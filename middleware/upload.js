const multer = require('multer')
const storage = multer.memoryStorage()

const fileFilter = (req, file, cb) => {
  if (!file.mimetype || !file.mimetype.startsWith('image/')) {
    return cb(new Error('Only image files are allowed.'), false)
  }
  cb(null, true)
}

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter,
})

module.exports = upload
