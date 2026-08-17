const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAdmin } = require('../middleware/auth');

const adminController = require('../controllers/admin.controller');
const voucherController = require('../controllers/voucher.controller');
const packageController = require('../controllers/package.controller');

const router = express.Router();

// Every route below requires a valid admin JWT.
router.use(requireAdmin);

router.get('/stats', adminController.getStats);
router.get('/router-status', adminController.getRouterStatus);
router.get('/devices', adminController.listDevices);
router.get('/devices/failed', adminController.listFailedDevices);
router.post('/devices/:id/retry-bind', adminController.retryDeviceBind);
router.get('/payments', adminController.listPayments);

router.get('/mpesa-reviews', adminController.listMpesaReviews);
router.post(
  '/mpesa-reviews/:id/approve',
  [body('packageId').isMongoId().withMessage('Invalid package')],
  validate,
  adminController.approveMpesaReview
);
router.post('/mpesa-reviews/:id/reject', adminController.rejectMpesaReview);

router.get('/vouchers', voucherController.listVouchers);
router.post(
  '/vouchers',
  [
    body('packageId').isMongoId().withMessage('Invalid package'),
    body('quantity').isInt({ min: 1, max: 500 }).withMessage('Quantity must be between 1 and 500'),
  ],
  validate,
  voucherController.generateVouchers
);

router.patch('/vouchers/:id/revoke', voucherController.revokeVoucher);

router.post('/packages', packageController.createPackage);
router.put('/packages/:id', packageController.updatePackage);

module.exports = router;
