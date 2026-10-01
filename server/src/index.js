const app = require('./app');
const connectDB = require('./config/db');
const { startEmailPolling } = require('./services/emailIngestionService');
const { startSlaMonitoring } = require('./services/slaService');
const logger = require('./utils/logger');

connectDB();
startEmailPolling();
startSlaMonitoring();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => logger.info({ port: PORT }, 'Server started'));