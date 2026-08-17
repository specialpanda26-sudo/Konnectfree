const axios = require('axios');
const crypto = require('crypto');
const env = require('../config/env');
const logger = require('../utils/logger');

// Confirmed from IntaSend's published OpenAPI spec (developers.intasend.com/reference):
// a single gateway serves both sandbox and live traffic — which one you hit is
// determined by whether INTASEND_SECRET_KEY is a test or live key, not by URL.
const BASE_URL = 'https://api.intasend.com/api/v1';

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    Authorization: `Bearer ${env.intasend.secretKey}`,
    'Content-Type': 'application/json',
  },
});

/**
 * Triggers an M-Pesa STK push via IntaSend.
 * POST /payment/mpesa-stk-push/ — body: { amount, phone_number, api_ref }
 * (amount and phone_number are the only required fields per IntaSend's spec).
 * Response shape: { invoice: { invoice_id, state, mpesa_reference, ... }, customer, ... }
 * Docs: https://developers.intasend.com/reference/api_v1_payment_mpesa_stk_push_create
 */
async function initiateStkPush({ phone, amountKsh, apiRef }) {
  const { data } = await client.post('/payment/mpesa-stk-push/', {
    amount: amountKsh,
    phone_number: phone,
    api_ref: apiRef, // your own internal reference — echoed back in the webhook
  });
  return {
    invoiceId: data.invoice.invoice_id,
    mpesaReference: data.invoice.mpesa_reference || null, // usually empty until the payment actually completes
    raw: data,
  };
}

/**
 * Verifies that an incoming webhook actually came from IntaSend.
 * Per IntaSend's docs (developers.intasend.com/docs/setup): you set a
 * "challenge" value in the dashboard when configuring the webhook, and
 * IntaSend echoes it back as a `challenge` field in the JSON body of every
 * webhook call — there is no signing header. This MUST match before
 * trusting the payload, or anyone who finds your webhook URL could fake a
 * "payment successful" event and get free internet.
 */
function verifyWebhookSignature(req) {
  const provided = req.body?.challenge;
  if (!provided) return false;
  // Constant-time comparison to avoid timing attacks on the secret.
  const expected = Buffer.from(env.intasend.webhookChallenge);
  const actual = Buffer.from(String(provided));
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

module.exports = { initiateStkPush, verifyWebhookSignature };
