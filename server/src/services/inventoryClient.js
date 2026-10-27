const { createHash } = require('node:crypto');
const logger = require('../utils/logger');
const { getUpstreamErrorDetails, wrapUpstreamError } = require('../utils/upstreamError');

const TOKEN_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

const tokenCache = new Map();
const loginPromises = new Map();

function inventoryUrl(pathEnvName, defaultPath) {
  const baseUrl = process.env.INVENTORY_API_URL;
  if (!baseUrl) throw new Error('INVENTORY_API_URL is not configured');

  const path = process.env[pathEnvName] || defaultPath;
  return new URL(`${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`);
}

function safeMessage(error) {
  let message = error?.message || 'Inventory request failed';
  for (const secret of [process.env.INVENTORY_SERVICE_PASSWORD, ...[...tokenCache.values()].map(({ token }) => token)]) {
    if (secret) message = message.split(secret).join('[Redacted]');
  }
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [Redacted]');
}

function safeResponseBody(body) {
  if (typeof body !== 'string') return body;
  let value = body;
  for (const secret of [process.env.INVENTORY_SERVICE_PASSWORD, ...[...tokenCache.values()].map(({ token }) => token)]) {
    if (secret) value = value.split(secret).join('[Redacted]');
  }
  value = value.replace(/Bearer\s+\S+/gi, 'Bearer [Redacted]');
  try {
    const parsed = JSON.parse(value);
    const redact = (item) => {
      if (Array.isArray(item)) return item.map(redact);
      if (!item || typeof item !== 'object') return item;
      return Object.fromEntries(Object.entries(item).map(([key, entry]) => (
        /^(authorization|password|token|api[_-]?key)$/i.test(key)
          ? [key, '[Redacted]']
          : [key, redact(entry)]
      )));
    };
    return JSON.stringify(redact(parsed));
  } catch {
    return value.replace(
      /("(?:authorization|password|token|api[_-]?key)"\s*:\s*")[^"]*"/gi,
      '$1[Redacted]"',
    );
  }
}

function getTokenExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (Number.isFinite(payload.exp)) return payload.exp * 1000;
  } catch {
    // Opaque tokens use the configured fallback lifetime.
  }
  return Date.now() + TOKEN_TTL_MS;
}

function loginFailure(error, url) {
  const details = getUpstreamErrorDetails(wrapUpstreamError(error, url), url);
  logger.error({
    route: 'GET /api/crm/inventory-assets',
    url: url.toString(),
    method: 'POST',
    errorCode: error?.code || null,
    upstreamStatus: error?.response?.status || null,
    errorMessage: safeMessage(error),
    authHeaderAttached: false,
    apiKeyAttached: false,
    failureType: 'inventory_login_failure',
    targetHost: details.targetHost || null,
    targetPort: details.targetPort || null,
  }, 'Inventory service login failed');

  const authError = new Error('Inventory service authentication failed', { cause: error });
  authError.stage = 'login';
  authError.reason = 'inventory_auth_failed';
  authError.code = error?.code;
  authError.response = error?.response;
  throw authError;
}

function cacheKey(url) {
  return createHash('sha256')
    .update(`${url}\n${process.env.INVENTORY_SERVICE_EMAIL || ''}\n${process.env.INVENTORY_SERVICE_PASSWORD || ''}`)
    .digest('hex');
}

async function login(url, key) {
  try {
    const email = process.env.INVENTORY_SERVICE_EMAIL;
    const password = process.env.INVENTORY_SERVICE_PASSWORD;
    if (!email || !password) {
      const error = new Error('Inventory service credentials are not configured');
      error.reason = 'inventory_auth_failed';
      throw error;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const error = new Error(`Inventory login failed with status ${response.status}`);
      error.code = `HTTP_${response.status}`;
      error.response = { status: response.status };
      throw error;
    }

    const data = await response.json();
    if (!data?.token || typeof data.token !== 'string') {
      const error = new Error('Inventory login response did not contain a token');
      error.response = { status: response.status };
      throw error;
    }

    const token = data.token;
    tokenCache.set(key, { token, expiresAt: getTokenExpiry(token) });
    return token;
  } catch (error) {
    loginFailure(error, url);
  }
}

async function getToken() {
  const url = inventoryUrl('INVENTORY_LOGIN_PATH', '/api/inventory/auth/login');
  const key = cacheKey(url.toString());
  const cached = tokenCache.get(key);
  if (cached?.expiresAt > Date.now()) return cached.token;
  tokenCache.delete(key);
  if (!loginPromises.has(key)) {
    loginPromises.set(key, login(url, key).finally(() => {
      loginPromises.delete(key);
    }));
  }
  return loginPromises.get(key);
}

async function requestAssets(url, token) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 401) return response;
  if (!response.ok) {
    throw await responseFailure(response, 'Inventory request');
  }
  return response;
}

async function responseFailure(response, operation) {
  let responseBody = null;
  try {
    if (typeof response.text === 'function') responseBody = await response.text();
  } catch (error) {
    responseBody = `[Could not read upstream response body: ${safeMessage(error)}]`;
  }
  const error = new Error(`${operation} failed with status ${response.status}`);
  error.code = `HTTP_${response.status}`;
  error.reason = 'bad_response';
  error.isUpstreamHttpError = true;
  error.response = { status: response.status, data: safeResponseBody(responseBody) };
  return error;
}

async function getAssets(url) {
  let token;
  try {
    token = await getToken();
    let response = await requestAssets(url, token);
    if (response.status === 401) {
      const loginUrl = inventoryUrl('INVENTORY_LOGIN_PATH', '/api/inventory/auth/login');
      const key = cacheKey(loginUrl.toString());
      if (tokenCache.get(key)?.token === token) tokenCache.delete(key);
      token = await getToken();
      response = await requestAssets(url, token);
      if (response.status === 401) {
        throw await responseFailure(response, 'Inventory request');
      }
    }
    return await response.json();
  } catch (error) {
    if (error?.stage !== 'login') {
      logAssetsFailure(error, url);
      error.inventoryLogged = true;
    }
    throw error;
  }
}

function logAssetsFailure(error, url) {
  const details = getUpstreamErrorDetails(wrapUpstreamError(error, url), url);
  logger.error({
    route: 'GET /api/crm/inventory-assets',
    url: url.toString(),
    method: 'GET',
    errorCode: error?.code || null,
    causeCode: details.causeCode,
    upstreamStatus: error?.response?.status || null,
    upstreamResponseBody: error?.response?.data ?? null,
    errorMessage: safeMessage(error),
    authHeaderAttached: true,
    apiKeyAttached: false,
    failureType: error?.isUpstreamHttpError ? 'upstream_http_error' : 'network_error',
    targetHost: details.targetHost || null,
    targetPort: details.targetPort || null,
    reason: error?.reason || details.reason,
  }, 'Inventory service assets request failed');
}

module.exports = { getAssets, inventoryUrl };
