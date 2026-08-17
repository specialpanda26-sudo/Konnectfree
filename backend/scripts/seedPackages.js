/**
 * Seeds the packages from the frontend so /api/packages returns
 * real data. Run once: node scripts/seedPackages.js
 *
 * These MUST match the card names in public/index.html exactly
 * (case-insensitive) — the frontend looks packages up by name to
 * attach the real packageId to each "Buy" button.
 *
 * NOTE on "Night Owl" and "Weekend": the Device/Package model only
 * supports a rolling duration (expiresAt = boundAt + durationHours),
 * not a fixed clock-time window. So these are modelled as a plain
 * duration a customer can start at any time (e.g. Night Owl = 8
 * hours from activation), NOT "only valid 10pm-6am" or "only valid
 * Fri-Sun" enforcement. True calendar-locked windows would need
 * extra scheduling logic (checking time-of-day/day-of-week at bind
 * time) that isn't built here yet — flag if you actually want that
 * enforced rather than just named that way.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Package = require('../src/models/Package');

const packages = [
  { slug: 'starter', name: 'Starter', dataLimitLabel: '1.5GB', periodLabel: '2 Hours', durationHours: 2, priceKsh: 50 },
  { slug: 'night-owl', name: 'Night Owl', dataLimitLabel: '5GB', periodLabel: '8 Hours', durationHours: 8, priceKsh: 80 },
  { slug: 'three-hour', name: '3-Hour', dataLimitLabel: '4GB', periodLabel: '3 Hours', durationHours: 3, priceKsh: 100 },
  { slug: 'daily', name: 'Daily', dataLimitLabel: '10GB', periodLabel: '24 Hours', durationHours: 24, priceKsh: 150 },
  { slug: 'weekend', name: 'Weekend', dataLimitLabel: '15GB', periodLabel: '54 Hours', durationHours: 54, priceKsh: 250 },
  { slug: 'weekly', name: 'Weekly', dataLimitLabel: '20GB', periodLabel: '1 Week', durationHours: 168, priceKsh: 350 },
  { slug: 'biweekly', name: 'Bi-Weekly', dataLimitLabel: '30GB', periodLabel: '2 Weeks', durationHours: 336, priceKsh: 600 },
  { slug: 'extended', name: 'Extended', dataLimitLabel: '40GB', periodLabel: '3 Weeks', durationHours: 504, priceKsh: 800 },
  { slug: 'monthly', name: 'Monthly', dataLimitLabel: '60GB', periodLabel: '1 Month', durationHours: 720, priceKsh: 1200 },
  { slug: 'family', name: 'Family', dataLimitLabel: '25GB', periodLabel: '1 Week', durationHours: 168, priceKsh: 1500 },
  { slug: 'unlimited', name: 'Unlimited', dataLimitLabel: 'Unlimited', periodLabel: '2 Months', durationHours: 1440, priceKsh: 2000 },
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
