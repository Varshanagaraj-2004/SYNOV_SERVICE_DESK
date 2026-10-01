const logger = require('../utils/logger');
// CSV columns: entity, crmId, companyName, department, contactPerson, contactEmail,
// contactNumber, address, location, companyStatus, assetName, type, configuration,
// model, serialNumber, companyCrmId, assignedTo, assetLocation, purchaseDate,
// warrantyExpiry, assetStatus. Entity is "company" or "asset".
// Usage: npm run sync:crm -- --file ./crm-export.csv [--dry-run]
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { parse } = require('csv-parse/sync');
const Company = require('../models/Company');
const Asset = require('../models/Assets');

function readArguments(args) {
  let file;
  let dryRun = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--dry-run') dryRun = true;
    else if (args[index] === '--file') file = args[++index];
    else if (args[index].startsWith('--file=')) file = args[index].slice('--file='.length);
  }
  if (!file) throw new Error('Provide a CSV path with --file <path>');
  return { file: path.resolve(file), dryRun };
}

function getCsvRows(file) {
  return parse(fs.readFileSync(file), {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

function optionalDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid CSV date: ${value}`);
  return date;
}

async function syncCrm({ file, dryRun }) {
  const rows = getCsvRows(file);
  const companyRows = rows.filter((row) => row.entity?.toLowerCase() === 'company');
  const assetRows = rows.filter((row) => row.entity?.toLowerCase() === 'asset');
  if (rows.some((row) => !['company', 'asset'].includes(row.entity?.toLowerCase()))) {
    throw new Error('Every CSV row must have entity set to "company" or "asset"');
  }

  await mongoose.connect(process.env.MONGO_URI);
  const companiesByCrmId = new Map();
  const crmIds = companyRows.map((row) => row.crmId).filter(Boolean);
  const existingCompanies = await Company.find({ crmId: { $in: crmIds } })
    .select('crmId companyName')
    .lean();
  existingCompanies.forEach((company) => companiesByCrmId.set(company.crmId, company));

  for (const row of companyRows) {
    if (!row.crmId || !row.companyName) throw new Error('Company rows require crmId and companyName');
    const values = {
      companyName: row.companyName,
      department: row.department || undefined,
      contactPerson: row.contactPerson || undefined,
      contactEmail: row.contactEmail || undefined,
      contactNumber: row.contactNumber || undefined,
      address: row.address || undefined,
      location: row.location || undefined,
      status: row.companyStatus || undefined,
    };
    if (dryRun) {
      logger.info(`[dry-run] Upsert company ${row.crmId}: ${row.companyName}`);
      continue;
    }
    const company = await Company.findOneAndUpdate(
      { crmId: row.crmId },
      { $set: values, $setOnInsert: { crmId: row.crmId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).select('_id crmId companyName').lean();
    companiesByCrmId.set(row.crmId, company);
  }

  for (const row of assetRows) {
    if (!row.crmId || !row.assetName || !row.serialNumber || !row.companyCrmId) {
      throw new Error('Asset rows require crmId, assetName, serialNumber, and companyCrmId');
    }
    let company = companiesByCrmId.get(row.companyCrmId);
    if (!company) {
      company = await Company.findOne({ crmId: row.companyCrmId }).select('_id crmId companyName').lean();
    }
    if (!company && !dryRun) throw new Error(`Company CRM ID not found for asset ${row.crmId}: ${row.companyCrmId}`);

    const values = {
      assetName: row.assetName,
      type: row.type || undefined,
      configuration: row.configuration || undefined,
      model: row.model || undefined,
      serialNumber: row.serialNumber,
      companyId: company?._id,
      company: company?.companyName,
      assignedTo: row.assignedTo || undefined,
      location: row.assetLocation || row.location || undefined,
      purchaseDate: optionalDate(row.purchaseDate),
      warrantyExpiry: optionalDate(row.warrantyExpiry),
      status: row.assetStatus || undefined,
    };
    if (dryRun) {
      logger.info(`[dry-run] Upsert asset ${row.crmId}: ${row.assetName} (${row.serialNumber})`);
      continue;
    }
    await Asset.updateOne(
      { crmId: row.crmId },
      { $set: values, $setOnInsert: { crmId: row.crmId } },
      { upsert: true, runValidators: true }
    );
    logger.info(`Upserted asset ${row.crmId}`);
  }

  logger.info(`${dryRun ? 'Dry run' : 'Sync'} complete: ${companyRows.length} companies, ${assetRows.length} assets.`);
}

syncCrm(readArguments(process.argv.slice(2)))
  .catch((error) => {
    logger.error('CRM sync failed:', error.stack || error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());