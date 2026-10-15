require('dotenv').config();
const { getCustomers } = require('../services/crmClient');

const normalize = (s) => String(s || '')
  .toLowerCase()
  .replace(/\b(pvt|private|ltd|limited|llp|inc|india|the)\b/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

async function loadAllCustomers() {
  const all = [];
  for (let page = 1; page <= 50; page += 1) {
    const res = await getCustomers({ page, limit: 100 });
    const rows = res.data || [];
    all.push(...rows);
    const totalPages = res.pagination?.totalPages ?? res.pagination?.pages ?? 1;
    if (page >= totalPages || rows.length === 0) break;
  }
  return all;
}

async function main() {
  const customers = await loadAllCustomers();
  console.log('CRM customers loaded:', customers.length);

  const base = process.env.INVENTORY_API_URL.replace(/\/+$/, '');
  const rented = await (await fetch(`${base}/assets?status=rented`)).json();
  const names = [...new Set(rented.map((a) => a.customerName).filter(Boolean))];

  for (const name of names) {
    const n = normalize(name);
    const matches = customers.filter((c) => {
      const cn = normalize(c.companyName);
      return cn === n || cn.includes(n) || n.includes(cn);
    });
    console.log(`\nInventory customerName: "${name}"`);
    console.log(matches.length
      ? matches.map((c) => `  -> ${c.customerId} | ${c.companyName} | ${c.status}`).join('\n')
      : '  -> NO MATCH in CRM');
  }
}

main().catch((e) => console.log('failed:', e.message));