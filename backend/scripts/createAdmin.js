/**
 * Creates the first admin account. Run once after setting up MongoDB:
 *   npm run create-admin
 *
 * Deliberately interactive/CLI-only — there is no default admin
 * account and no seeded password anywhere in this codebase.
 */
require('dotenv').config();
const readline = require('readline');
const mongoose = require('mongoose');
const Admin = require('../src/models/Admin');

function ask(rl, question, hidden = false) {
  return new Promise((resolve) => {
    if (!hidden) { rl.question(question, resolve); return; }
    // Basic hidden input for the password prompt
    const stdin = process.stdin;
    process.stdout.write(question);
    let input = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (char) => {
      char = char.toString();
      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(input);
      } else if (char === '\u0003') {
        process.exit();
      } else if (char === '\u007f') {
        input = input.slice(0, -1);
      } else {
        input += char;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set — copy .env.example to .env first.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const username = (await ask(rl, 'Admin username: ')).trim().toLowerCase();
  const password = await ask(rl, 'Admin password (min 10 chars): ', true);
  rl.close();

  if (!username) { console.error('Username required.'); process.exit(1); }
  if (!password || password.length < 10) { console.error('Password must be at least 10 characters.'); process.exit(1); }

  const existing = await Admin.findOne({ username });
  if (existing) { console.error(`Admin "${username}" already exists.`); process.exit(1); }

  const passwordHash = await Admin.hashPassword(password);
  await Admin.create({ username, passwordHash, role: 'owner' });

  console.log(`Admin "${username}" created with owner role.`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
