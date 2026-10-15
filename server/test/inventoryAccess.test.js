const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getClientVisibleInventory, normalizeCompanyName } = require('../src/services/inventoryAccess');

describe('client inventory access', () => {
  const company = {
    _id: 'local-company-1',
    crmId: 'crm-company-1',
    companyName: 'Happiest Minds Technologies',
  };

  it('matches normalized company names when inventory names include a location suffix', () => {
    assert.equal(
      normalizeCompanyName('  Happiest   Minds Technologies - Karnataka  '),
      normalizeCompanyName(company.companyName),
    );
    assert.deepEqual(
      getClientVisibleInventory(company, [{
        assetId: 'asset-1',
        customerName: 'Happiest Minds Technologies - Karnataka',
        status: 'rented',
      }]).map((asset) => asset.assetId),
      ['asset-1'],
    );
  });

  it('prefers stable customer ids and excludes other customers and non-rented statuses', () => {
    const visible = getClientVisibleInventory(company, [
      { assetId: 'own-id', customerId: 'crm-company-1', customerName: 'Other Name', status: 'sold' },
      { assetId: 'wrong-id', customerId: 'crm-other', customerName: company.companyName, status: 'rented' },
      { assetId: 'warehouse', status: 'available' },
      { assetId: 'other', customerName: 'Contoso', status: 'rented' },
    ]);

    assert.deepEqual(visible.map((asset) => asset.assetId), ['own-id']);
  });

  it('fails closed without a company record or a matching customer', () => {
    assert.deepEqual(getClientVisibleInventory(null, [{ status: 'rented' }]), []);
    assert.deepEqual(getClientVisibleInventory(company, [{ customerName: 'Contoso', status: 'rented' }]), []);
  });

  it('returns only client-safe asset fields and the customer location', () => {
    const [asset] = getClientVisibleInventory(company, [{
      assetId: 'asset-1',
      productName: 'Laptop',
      productDescription: 'Company laptop',
      serialNumber: 'serial-1',
      model: 'Model X',
      type: 'Notebook',
      customerId: 'crm-company-1',
      customerLocation: 'Bengaluru',
      location: 'Main Warehouse',
      purchaseCost: 5000,
      vendor: 'Internal Supplier',
      internalNotes: 'Private note',
      status: 'rented',
      rentStartDate: '2026-01-01',
      rentEndDate: '2026-12-31',
    }]);

    assert.deepEqual(asset, {
      id: 'asset-1',
      assetId: 'asset-1',
      productName: 'Laptop',
      productDescription: 'Company laptop',
      serialNumber: 'serial-1',
      productModel: 'Model X',
      type: 'Notebook',
      status: 'rented',
      rentStartDate: '2026-01-01',
      rentEndDate: '2026-12-31',
      location: 'Bengaluru',
      customerName: company.companyName,
    });
  });
});
