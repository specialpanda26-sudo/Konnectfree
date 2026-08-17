const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { stkPushLimiter, voucherLimiter } = require('../middleware/rateLimiters');

const paymentController = require('../controllers/payment.controller');
const voucherController = require('../controllers/voucher.controller');
const deviceController = require('../controllers/device.controller');
const packageController = require('../controllers/package.controller');

const router = express.Router();

router.get('/packages', packageController.listPackages);

router.post(
  '/stk-push',
  stkPushLimiter,
  [
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name is required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
    body('mac').trim().notEmpty().withMessage('MAC address is required'),
    body('packageId').isMongoId().withMessage('Invalid package'),
  ],
  validate,
  paymentController.startStkPush
);

router.get('/stk-status/:invoiceId', paymentController.getPaymentStatus);
router.get('/device-status/:mac', paymentController.getDeviceStatus);

router.post(
  '/vouchers/activate',
  voucherLimiter,
  [
    body('code').trim().notEmpty().withMessage('Voucher code is required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
    body('mac').trim().notEmpty().withMessage('MAC address is required'),
  ],
  validate,
  voucherController.activateVoucher
);

router.post(
  '/reconnect',
  [body('identifier').trim().notEmpty().withMessage('Enter a phone number or voucher code')],
  validate,
  deviceController.reconnect
);

router.post(
  '/verify-mpesa-message',
  [
    body('message').trim().isLength({ min: 15 }).withMessage('Paste the full M-Pesa message'),
    body('phone').optional().trim(),
    body('mac').optional().trim(),
  ],
  validate,
  deviceController.verifyMpesaMessage
);

module.exports = router;
