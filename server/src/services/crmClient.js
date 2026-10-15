const logger = require('../utils/logger');
const { getUpstreamErrorDetails, wrapUpstreamError } = require('../utils/upstreamError');

let cachedToken;
let loginPromise;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function login() {
  const loginUrl = process.env.CRM_LOGIN_URL;
  try {
    const response = await fetch(requiredEnv('CRM_LOGIN_URL'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: requiredEnv('CRM_USERNAME'),
        password: requiredEnv('CRM_PASSWORD'),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`CRM login failed with status ${response.status}`);
    }

    const data = await response.json();
    if (!data.token || typeof data.token !== 'string') {
      throw new Error('CRM login response did not contain a token');
    }

    cachedToken = data.token;
    return cachedToken;
  } catch (error) {
    const upstreamError = wrapUpstreamError(error, loginUrl);
    logger.error(
      getUpstreamErrorDetails(upstreamError, loginUrl),
      'CRM login request failed',
    );
    throw upstreamError;
  }
}

async function getToken() {
  if (cachedToken) return cachedToken;
  if (!loginPromise) {
    loginPromise = login().finally(() => {
      loginPromise = undefined;
    });
  }
  return loginPromise;
}

async function fetchCustomers(token, params) {
  const customersUrl = new URL(requiredEnv('CRM_CUSTOMERS_URL'));
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === 'string' || typeof value === 'number') {
      customersUrl.searchParams.set(key, String(value));
    }
  });

  return fetch(customersUrl, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
}

async function getCustomers(params = {}) {
  let token = await getToken();
  try {
    let response = await fetchCustomers(token, params);

    if (response.status === 401) {
      if (cachedToken === token) cachedToken = undefined;
      token = await getToken();
      response = await fetchCustomers(token, params);
    }

    if (!response.ok) {
      throw new Error(`CRM customer request failed with status ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error?.targetHost) throw error;

    const customersUrl = process.env.CRM_CUSTOMERS_URL;
    const upstreamError = wrapUpstreamError(error, customersUrl);
    logger.error(
      getUpstreamErrorDetails(upstreamError, customersUrl),
      'CRM customer request failed',
    );
    throw upstreamError;
  }
}

module.exports = { getCustomers };
