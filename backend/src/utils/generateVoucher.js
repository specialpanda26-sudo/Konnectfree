const crypto = require('crypto');

// Cryptographically random voucher codes — not Math.random(), which is
// predictable and unsuitable for anything that represents money.
// Excludes ambiguous characters (0/O, 1/I) since these get read off
// printed vouchers by hand.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateVoucherCode(length = 10) {
  let code = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code.match(/.{1,5}/g).join('-'); // e.g. AB3F9-KL2M7
}

module.exports = generateVoucherCode;
