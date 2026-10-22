const app = require('./app');
const connectDB = require('./config/db');
const { startEmailPolling } = require('./services/emailIngestionService');
const { startSlaMonitoring } = require('./services/slaService');
const logger = require('./utils/logger');
const { getTarget, getUpstreamErrorDetails } = require('./utils/upstreamError');

async function checkDependency(service, envName) {
  const targetUrl = process.env[envName];
  if (!targetUrl) {
    logger.warn({ service, reachable: false, reason: 'not_configured' }, 'Startup dependency check');
    return;
  }

  try {
    const response = await fetch(targetUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3_000),
    });
    logger.info(
      { service, reachable: true, status: response.status, ...getTarget(targetUrl) },
      'Startup dependency check',
    );
  } catch (error) {
    logger.warn(
      { service, reachable: false, ...getUpstreamErrorDetails(error, targetUrl) },
      'Startup dependency check',
    );
  }
}

connectDB();
startEmailPolling();
startSlaMonitoring();

void checkDependency('Inventory', 'INVENTORY_API_URL');
void checkDependency('CRM', 'CRM_LOGIN_URL');

const PORT = process.env.PORT || 5050;
// Listen on all network interfaces so other computers on the LAN can connect.
app.listen(PORT, '0.0.0.0', () => logger.info({ port: PORT }, 'Server started'));