const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getCustomers } = require('../services/crmClient');
const Company = require('../models/Company');
const { getClientVisibleInventory } = require('../services/inventoryAccess');
const { crmCustomerId, syncCrmCustomer } = require('../services/crmUserSync');
const logger = require('../utils/logger');
const { getUpstreamErrorDetails, wrapUpstreamError } = require('../utils/upstreamError');

const router = express.Router();

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

router.get('/inventory-assets', requireAuth, async (req, res) => {
  let inventoryApiUrl;
  try {
    let clientCompany;
    if (req.user.role === 'client') {
      if (!req.user.companyId) return res.json([]);
      clientCompany = await Company.findById(req.user.companyId)
        .select('_id crmId companyName')
        .lean();
      if (!clientCompany) return res.json([]);
    }

    inventoryApiUrl = process.env.INVENTORY_API_URL;
    if (!inventoryApiUrl) throw new Error('INVENTORY_API_URL is not configured');

    const inventoryUrl = new URL(`${inventoryApiUrl.replace(/\/+$/, '')}/assets`);

    if (typeof req.query.status === 'string') {
      inventoryUrl.searchParams.set('status', req.query.status);
    }

    const response = await fetch(inventoryUrl, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Inventory request failed with status ${response.status}`);
    }

    const inventory = await response.json();
    if (req.user.role !== 'client') return res.json(inventory);

    const rows = Array.isArray(inventory)
      ? inventory
      : ['data', 'items', 'assets', 'results']
        .map((key) => inventory?.[key])
        .find(Array.isArray) || [];
    return res.json(getClientVisibleInventory(clientCompany, rows));
  } catch (error) {
    const upstreamError = wrapUpstreamError(error, inventoryApiUrl);
    const details = getUpstreamErrorDetails(upstreamError, inventoryApiUrl);
    logger.error(details, 'Could not reach the Inventory service');
    return res.status(502).json({
      error: 'Could not reach the Inventory service',
      reason: details.reason,
    });
  }
});

module.exports = router;
