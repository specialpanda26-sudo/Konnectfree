const express = require('express');
const webhookController = require('../controllers/webhook.controller');

const router = express.Router();

// Note: mounted with express.json() like the rest of the app here — this
// is correct for IntaSend, whose webhook auth is a `challenge` string
// echoed back inside the JSON body (see src/services/intasend.service.js),
// not a raw-body HMAC signature header.
router.post('/intasend', webhookController.intasendWebhook);

module.exports = router;
