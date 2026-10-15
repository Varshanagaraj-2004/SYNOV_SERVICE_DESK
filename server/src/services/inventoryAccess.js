function normalizeCompanyName(value) {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .replace(/\s+-\s+[^-]+$/, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function valueString(value) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim().toLowerCase()
    : '';
}

function getInventoryCustomerIds(row) {
  const ids = [];
  for (const key of [
    'customerId',
    'customer_id',
    'customerCrmId',
    'customerCRMId',
    'companyCrmId',
    'companyCRMId',
  ]) {
    const id = valueString(row[key]);
    if (id) ids.push(id);
  }

  for (const key of ['customer', 'company']) {
    const entity = row[key];
    if (!entity || typeof entity !== 'object') continue;
    for (const idKey of ['_id', 'id', 'customerId', 'crmId', 'customerCrmId', 'customerCRMId']) {
      const id = valueString(entity[idKey]);
      if (id) ids.push(id);
    }
  }
  return ids;
}

function getInventoryCompanyIds(row) {
  return [row.companyId, row.localCompanyId]
    .map(valueString)
    .filter(Boolean);
}

function getCustomerName(row) {
  if (typeof row.customerName === 'string') return row.customerName;
  if (typeof row.customer === 'string') return row.customer;
  if (typeof row.customer?.name === 'string') return row.customer.name;
  if (typeof row.companyName === 'string') return row.companyName;
  return '';
}

function customerLocation(row) {
  const value = row.customerLocation
    || (typeof row.customer === 'object' && row.customer?.location)
    || (typeof row.customer === 'object' && row.customer?.address);
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    return [value.city, value.state, value.country].filter((part) => typeof part === 'string' && part.trim()).join(', ');
  }
  return undefined;
}

function projectClientAsset(row, companyRecord) {
  const id = row.assetId || row.id || row._id;
  const productName = row.productName || row.name;
  const productModel = row.productModel || row.model || row.type;
  const productDescription = row.productDescription || row.description;
  const location = customerLocation(row);

  return {
    ...(id !== undefined ? { id, assetId: id } : {}),
    ...(productName !== undefined ? { productName } : {}),
    ...(productDescription !== undefined ? { productDescription } : {}),
    ...(row.serialNumber !== undefined ? { serialNumber: row.serialNumber } : {}),
    ...(productModel !== undefined ? { productModel } : {}),
    ...(row.type !== undefined ? { type: row.type } : {}),
    ...(row.status !== undefined ? { status: String(row.status).trim().toLowerCase() } : {}),
    ...(row.rentStartDate !== undefined ? { rentStartDate: row.rentStartDate } : {}),
    ...(row.rentEndDate !== undefined ? { rentEndDate: row.rentEndDate } : {}),
    ...(location ? { location } : {}),
    customerName: companyRecord.companyName,
  };
}

function getClientVisibleInventory(companyRecord, rows) {
  if (!companyRecord?._id || !Array.isArray(rows)) return [];

  const companyCrmId = valueString(companyRecord.crmId);
  const localCompanyId = valueString(companyRecord._id);
  const companyName = normalizeCompanyName(companyRecord.companyName);

  return rows
    .filter((row) => row && typeof row === 'object' && !Array.isArray(row))
    .filter((row) => {
      const status = valueString(row.status);
      if (status !== 'rented' && status !== 'sold') return false;

      const inventoryCustomerIds = getInventoryCustomerIds(row);
      const inventoryCompanyIds = getInventoryCompanyIds(row);
      const hasComparableStableId = Boolean(
        (companyCrmId && inventoryCustomerIds.length)
        || (localCompanyId && inventoryCompanyIds.length),
      );

      if (hasComparableStableId) {
        return (companyCrmId && inventoryCustomerIds.includes(companyCrmId))
          || (localCompanyId && inventoryCompanyIds.includes(localCompanyId));
      }

      const customerName = normalizeCompanyName(getCustomerName(row));
      return Boolean(companyName && customerName && customerName === companyName);
    })
    .map((row) => projectClientAsset(row, companyRecord));
}

module.exports = { getClientVisibleInventory, normalizeCompanyName };
