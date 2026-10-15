require('dotenv').config();

const SENSITIVE = /email|phone|mobile|password|token|secret|address/i;

function mask(value, key = '') {
  if (Array.isArray(value)) return value.map((item) => mask(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mask(v, k)]));
  }
  if (SENSITIVE.test(key) && value) return 'xxx';
  return value;
}

async function main() {
  const base = process.env.INVENTORY_API_URL.replace(/\/+$/, '');
  const response = await fetch(`${base}/assets?status=rented`, { signal: AbortSignal.timeout(10_000) });
  const assets = await response.json();
  console.log('status:', response.status, '| rented count:', assets.length);
  console.log('=== customerName values (first 10) ===');
  console.log(assets.slice(0, 10).map((a) => a.customerName));
  console.log('=== ONE RENTED ASSET ===');
  console.log(JSON.stringify(mask(assets[0]), null, 2));
}

main().catch((error) => console.log('failed:', error.message));