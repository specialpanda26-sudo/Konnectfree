const app = require('./app');
const connectDB = require('./config/db');
const env = require('./config/env');
const logger = require('./utils/logger');
const { startCleanupJob } = require('./services/cleanup.service');

async function start() {
  await connectDB();
  app.listen(env.port, () => {
    logger.info(`Konnect Free backend listening on port ${env.port} [${env.nodeEnv}]`);
  });
  // Periodically flip bound-but-expired devices to 'expired' and ask the
  // router to remove them. See src/services/cleanup.service.js.
  startCleanupJob(5);
}

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection:', err);
  process.exit(1);
});

start();
