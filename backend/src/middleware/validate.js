const { validationResult } = require('express-validator');
const { ApiError } = require('./errorHandler');

// Runs after an express-validator chain; turns validation failures into
// a clean 400 instead of letting bad input reach a controller.
module.exports = function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const message = errors.array().map((e) => e.msg).join('; ');
    return next(new ApiError(400, message));
  }
  next();
};
