const app = require('./app');
const connectDB = require('./config/db');
const { startEmailPolling } = require('./services/emailIngestionService');
const { startSlaMonitoring } = require('./services/slaService');
const logger = require('./utils/logger');
const { getTarget, getUpstreamErrorDetails } = require('./utils/upstreamError');

async function checkDependency(service, baseUrl, path) {
  if (!baseUrl) {
    logger.warn({ service, reachable: false, reason: 'not_configured' }, 'Startup dependency check');
    return;
  }

  let targetUrl = baseUrl;
  try {
    if (path) {
      targetUrl = new URL(`${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`);
    }
    const response = await fetch(targetUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3_000),
    });
    if (response.status < 200 || response.status >= 300) {
      const pathNotVerified = [401, 404, 405].includes(response.status);
      logger.warn(
        {
          service,
          reachable: false,
          status: response.status,
          reason: pathNotVerified ? 'path_not_verified' : 'bad_response',
          ...getTarget(targetUrl),
        },
        pathNotVerified
          ? 'Startup dependency check (reachable, path not verified)'
          : 'Startup dependency check',
      );
      return;
    }
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

void checkDependency(
  'Inventory',
  process.env.INVENTORY_API_URL,
  process.env.INVENTORY_ASSETS_PATH || '/api/inventory/assets',
);
void checkDependency('CRM', process.env.CRM_LOGIN_URL);

const PORT = process.env.PORT || 5050;
// Listen on all network interfaces so other computers on the LAN can connect.
app.listen(PORT, '0.0.0.0', () => logger.info({ port: PORT }, 'Server started'));