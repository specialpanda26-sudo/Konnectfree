// Normalizes Kenyan phone numbers to the 2547XXXXXXXX / 2541XXXXXXXX
// format IntaSend and M-Pesa expect, from common input variants:
// 0712345678, 712345678, +254712345678, 254712345678.
function normalizePhone(input) {
  if (!input) return null;
  const digits = String(input).replace(/[^\d]/g, '');
  if (/^254(7|1)\d{8}$/.test(digits)) return digits;
  if (/^0(7|1)\d{8}$/.test(digits)) return '254' + digits.slice(1);
  if (/^(7|1)\d{8}$/.test(digits)) return '254' + digits;
  return null; // invalid — caller should reject
}
module.exports = normalizePhone;
