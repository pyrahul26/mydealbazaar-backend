



const success = (data = {}, message = 'Success', statusCode = 200) => ({
  success: true,
  statusCode,
  message,
  ...data,
})


const error = (message = 'Something went wrong', statusCode = 500, details = null) => ({
  success:    false,
  statusCode,
  message,
  ...(details && { details }),
})


const paginated = (data, page, limit, total) => ({
  success: true,
  data,
  pagination: {
    page:    Number(page),
    limit:   Number(limit),
    total,
    pages:   Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1,
  },
})

module.exports = { success, error, paginated }
