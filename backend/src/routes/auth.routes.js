const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { loginLimiter } = require('../middleware/rateLimiters');
const authController = require('../controllers/auth.controller');

const router = express.Router();

router.post(
  '/login',
  loginLimiter,
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  authController.login
);

module.exports = router;
