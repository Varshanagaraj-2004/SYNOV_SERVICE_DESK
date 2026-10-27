const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getCustomers } = require('../services/crmClient');
const Company = require('../models/Company');
const { getClientVisibleInventory } = require('../services/inventoryAccess');
const { getAssets, inventoryUrl } = require('../services/inventoryClient');
const { crmCustomerId, syncCrmCustomer } = require('../services/crmUserSync');
const logger = require('../utils/logger');
const { getUpstreamErrorDetails, wrapUpstreamError } = require('../utils/upstreamError');

const router = express.Router();
const HEALTH_TIMEOUT_MS = 3_000;

function upstreamFailureReason(error, details) {
  const code = details.causeCode || error?.code;
  if (code === 'ECONNREFUSED') return 'connection_refused';
  if (code === 'ETIMEDOUT' || details.reason === 'timeout' || error?.name === 'TimeoutError') {
    return 'timeout';
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'host_not_found';
  return 'bad_response';
}

async function checkDependency(urlValue, requireSuccessfulStatus = false) {
  if (!urlValue) return { reachable: false, reason: 'not_configured' };

  try {
    const response = await fetch(urlValue, {
      method: 'HEAD',
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (requireSuccessfulStatus && (response.status < 200 || response.status >= 300)) {
      return {
        reachable: false,
        status: response.status,
        reason: [401, 404, 405].includes(response.status) ? 'path_not_verified' : 'bad_response',
      };
    }
    return { reachable: true, status: response.status };
  } catch (error) {
    return {
      reachable: false,
      reason: upstreamFailureReason(error, getUpstreamErrorDetails(error, urlValue)),
    };
  }
}

function customerRows(response) {
  if (Array.isArray(response)) return response;
  for (const key of ['data', 'items', 'customers', 'results']) {
    if (Array.isArray(response?.[key])) return response[key];
  }
  return [];
}

function withLocalCompanyIds(response, localCompanyIds) {
  const addLocalCompanyId = (customer) => ({
    ...customer,
    localCompanyId: localCompanyIds.get(crmCustomerId(customer)) || null,
  });
  if (Array.isArray(response)) return response.map(addLocalCompanyId);

  for (const key of ['data', 'items', 'customers', 'results']) {
    if (Array.isArray(response?.[key])) {
      return { ...response, [key]: response[key].map(addLocalCompanyId) };
    }
  }
  return response;
}

async function syncCustomerPage(customers) {
  const localCompanyIds = new Map();
  await Promise.all(customers.map(async (customer) => {
    const crmId = crmCustomerId(customer);
    try {
      const result = await syncCrmCustomer(customer);
      localCompanyIds.set(crmId, String(result.company._id));
    } catch (error) {
      logger.error({
        crmId,
        localCompanyId: error?.localCompanyId,
        errorName: error?.name || 'Error',
        errorCode: error?.cause?.code || error?.code || null,
      }, 'CRM customer user sync failed');
      localCompanyIds.set(crmId, error?.localCompanyId || null);
    }
  }));
  return localCompanyIds;
}

async function findCrmCustomer(crmId) {
  const limit = 100;
  let page = 1;

  while (true) {
    const response = await getCustomers({ page, limit });
    const customer = customerRows(response).find((entry) => (
      String(entry?._id || '') === crmId || String(entry?.customerId || '') === crmId
    ));
    if (customer) return customer;

    const totalPages = Number(response?.pagination?.totalPages || response?.pages || 1);
    if (!Number.isFinite(totalPages) || page >= totalPages) return null;
    page += 1;
  }
}

router.get('/customers', requireAuth, requireRole('admin', 'it_staff'), async (req, res) => {
  try {
    const customers = await getCustomers(req.query);
    const localCompanyIds = await syncCustomerPage(customerRows(customers));
    return res.json(withLocalCompanyIds(customers, localCompanyIds));
  } catch (error) {
    const details = getUpstreamErrorDetails(error);
    logger.error(details, 'Could not reach the CRM');
    return res.status(502).json({ error: 'Could not reach the CRM', reason: details.reason });
  }
});

router.post('/customers/:crmId/sync', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const customer = await findCrmCustomer(req.params.crmId);
    if (!customer) return res.status(404).json({ error: 'CRM customer not found' });

    const result = await syncCrmCustomer(customer);
    return res.json({
      crmId: crmCustomerId(customer),
      localCompanyId: String(result.company._id),
      userCreated: result.created,
    });
  } catch (error) {
    logger.error({
      crmId: req.params.crmId,
      localCompanyId: error?.localCompanyId,
      errorName: error?.name || 'Error',
      errorCode: error?.cause?.code || error?.code || null,
    }, 'CRM customer sync failed');
    return res.status(500).json({ error: 'Could not sync the CRM customer' });
  }
});

router.get('/health', requireAuth, requireRole('admin'), async (req, res) => {
  const [inventory, crm] = await Promise.all([
    checkDependency(
      process.env.INVENTORY_API_URL
        ? inventoryUrl('INVENTORY_ASSETS_PATH', '/api/inventory/assets').toString()
        : undefined,
      true,
    ),
    checkDependency(process.env.CRM_LOGIN_URL),
  ]);
  return res.json({ inventory, crm });
});

router.get('/inventory-assets', requireAuth, async (req, res) => {
  let upstreamUrl;
  try {
    let clientCompany;
    if (req.user.role === 'client') {
      if (!req.user.companyId) return res.json([]);
      clientCompany = await Company.findById(req.user.companyId)
        .select('_id crmId companyName')
        .lean();
      if (!clientCompany) return res.json([]);
    }

    upstreamUrl = inventoryUrl('INVENTORY_ASSETS_PATH', '/api/inventory/assets');
    if (typeof req.query.status === 'string') {
      upstreamUrl.searchParams.set('status', req.query.status);
    }

    const inventory = await getAssets(upstreamUrl);
    if (req.user.role !== 'client') return res.json(inventory);

    const rows = Array.isArray(inventory)
      ? inventory
      : ['data', 'items', 'assets', 'results']
        .map((key) => inventory?.[key])
        .find(Array.isArray) || [];
    return res.json(getClientVisibleInventory(clientCompany, rows));
  } catch (error) {
    const reason = error?.reason || upstreamFailureReason(
      error,
      getUpstreamErrorDetails(error, upstreamUrl?.toString()),
    );
    if (!error?.inventoryLogged && error?.stage !== 'login') {
      const details = getUpstreamErrorDetails(
        wrapUpstreamError(error, upstreamUrl?.toString()),
        upstreamUrl?.toString(),
      );
      logger.error({
        route: 'GET /api/crm/inventory-assets',
        url: upstreamUrl?.toString() || null,
        method: 'GET',
        errorCode: error?.code || null,
        causeCode: details.causeCode,
        upstreamStatus: error?.response?.status || null,
        upstreamResponseBody: error?.response?.data ?? null,
        errorMessage: error?.message || null,
        authHeaderAttached: Boolean(upstreamUrl),
        apiKeyAttached: false,
        failureType: error?.isUpstreamHttpError ? 'upstream_http_error' : 'request_error',
        reason,
      }, 'Inventory service assets request failed');
    }
    return res.status(502).json({
      error: 'Could not reach the Inventory service',
      reason: error?.stage === 'login' ? 'inventory_auth_failed' : reason,
    });
  }
});

module.exports = router;
