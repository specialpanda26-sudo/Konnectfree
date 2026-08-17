const mongoose = require('mongoose');
const env = require('./env');

async function connectDB() {
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(env.mongoUri, {
      // Modern mongoose (8.x) doesn't need most legacy options, but keep
      // connection timeouts tight so a bad URI fails fast instead of hanging.
      serverSelectionTimeoutMS: 8000,
    });
    console.log('[db] connected to MongoDB');
  } catch (err) {
    console.error('[db] connection failed:', err.message);
    process.exit(1);
  }

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] disconnected from MongoDB');
  });
}

module.exports = connectDB;
