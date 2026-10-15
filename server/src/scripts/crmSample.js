require('dotenv').config();
const { getCustomers } = require('../services/crmClient');

const SENSITIVE = /email|phone|mobile|password|token|secret|address/i;

function mask(value, key = '') {
  if (Array.isArray(value)) return value.slice(0, 1).map((item) => mask(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mask(v, k)]));
  }
  if (SENSITIVE.test(key) && value) return 'xxx';
  return value;
}

function firstItem(data) {
  if (Array.isArray(data)) return data[0];
  for (const key of ['data', 'items', 'customers', 'assets', 'results']) {
    if (Array.isArray(data?.[key])) return data[key][0];
  }
  return data;
}

async function main() {
  try {
    const customers = await getCustomers({ page: 1, limit: 1 });
    console.log('\n=== CUSTOMER response top-level keys ===');
    console.log(Array.isArray(customers) ? '(array)' : Object.keys(customers));
    console.log('=== ONE CUSTOMER ===');
    console.log(JSON.stringify(mask(firstItem(customers)), null, 2));
  } catch (error) {
    console.log('CUSTOMER request failed:', error.message);
  }

  try {
    const base = process.env.INVENTORY_API_URL.replace(/\/+$/, '');
    const response = await fetch(`${base}/assets`, { signal: AbortSignal.timeout(10_000) });
    console.log('\n=== INVENTORY status:', response.status, '===');
    const assets = await response.json();
    console.log('=== INVENTORY response top-level keys ===');
    console.log(Array.isArray(assets) ? '(array)' : Object.keys(assets));
    console.log('=== ONE ASSET ===');
    console.log(JSON.stringify(mask(firstItem(assets)), null, 2));
  } catch (error) {
    console.log('INVENTORY request failed:', error.message);
  }
}

main();