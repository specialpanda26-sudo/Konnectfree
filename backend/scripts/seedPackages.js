/**
 * Seeds the five packages from the frontend so /api/packages returns
 * real data. Run once: node scripts/seedPackages.js
 *
 * These MUST match the card names in konnect-free.html exactly
 * (case-insensitive) — the frontend looks packages up by name to
 * attach the real packageId to each "Buy" button.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Package = require('../src/models/Package');

const packages = [
  { slug: 'daily', name: 'Daily', dataLimitLabel: '10GB', periodLabel: '24 Hours', durationHours: 24, priceKsh: 180 },
  { slug: 'weekly', name: 'Weekly', dataLimitLabel: '12GB', periodLabel: '1 Week', durationHours: 168, priceKsh: 200 },
  { slug: 'extended', name: 'Extended', dataLimitLabel: '18GB', periodLabel: '3 Weeks', durationHours: 504, priceKsh: 450 },
  { slug: 'monthly', name: 'Monthly', dataLimitLabel: '30GB', periodLabel: '1 Month', durationHours: 720, priceKsh: 900 },
  { slug: 'two-months', name: '2 Months', dataLimitLabel: 'Unlimited', periodLabel: '2 Months', durationHours: 1440, priceKsh: 1600 },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  for (const p of packages) {
    await Package.findOneAndUpdate({ slug: p.slug }, p, { upsert: true });
    console.log(`Upserted package: ${p.name}`);
  }
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
