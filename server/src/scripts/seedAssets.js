const logger = require('../utils/logger');
// Run this once to create test assets: node src/scripts/seedAssets.js
require('dotenv').config();
const mongoose = require('mongoose');
const Asset = require('../models/Assets');
const Company = require('../models/Company');

const assets = [
  {
    id: 'AST-001',
    assetName: 'APPLE MACBOOK AIR MDHE4HN/A (12 MONTHS LOCK-IN PERIOD)',
    type: 'Laptop',
    configuration: '13-inch MacBook Air: Apple M5 chip with 10-core CPU and 8-core GPU, 16GB, 512GB SSD - Midnight with APPLE CARE +',
    model: 'MDHE4HN/A',
    serialNumber: 'MBA12M-0001',
    company: 'AnkerCloud Pvt Ltd',
    assignedTo: 'Security Ops',
    location: 'Bengaluru',
    purchaseDate: '2025-06-10',
    warrantyExpiry: '2027-06-10',
    status: 'In Use',
  },
  {
    id: 'AST-002',
    assetName: 'APPLE MACBOOK AIR MDHE4HN/A (24 MONTHS LOCK-IN PERIOD)',
    type: 'Laptop',
    configuration: '13-inch MacBook Air: Apple M5 chip with 10-core CPU and 8-core GPU, 16GB, 512GB SSD - Midnight with APPLE CARE +',
    model: 'MDHE4HN/A',
    serialNumber: 'MBA24M-0001',
    company: 'Capgemini India',
    assignedTo: 'Arjun Mehta',
    location: 'Bengaluru',
    purchaseDate: '2024-11-20',
    warrantyExpiry: '2027-11-20',
    status: 'In Use',
  },
  {
    id: 'AST-003',
    assetName: 'COOLER MASTER ASSEMBLED MACHINE',
    type: 'Desktop',
    configuration: 'I9-12900K/64GB/1TBSSD/4070 TI 16GB GPU/POWER SUPPLY/KEYBOARD/MOUSE',
    model: 'Custom Build',
    serialNumber: 'CM-ASM-0001',
    company: 'Stripe',
    assignedTo: 'IT Operations',
    location: 'Bengaluru',
    purchaseDate: '2025-02-14',
    warrantyExpiry: '2027-02-14',
    status: 'In Use',
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  logger.info('Connected to MongoDB');

  for (const assetData of assets) {
    const company = await Company.findOne({ companyName: assetData.company });
    if (!company) {
      logger.warn(`Warning: company not found for ${assetData.serialNumber}: ${assetData.company}; skipping asset`);
      continue;
    }

    const existing = await Asset.findOne({ serialNumber: assetData.serialNumber });
    if (existing) {
      logger.info(`Skipping ${assetData.serialNumber} — already exists`);
      continue;
    }

    await Asset.create({
      crmId: assetData.id,
      assetName: assetData.assetName,
      type: assetData.type,
      model: assetData.model,
      serialNumber: assetData.serialNumber,
      companyId: company._id,
      company: assetData.company,
      assignedTo: assetData.assignedTo,
      location: assetData.location,
      purchaseDate: assetData.purchaseDate,
      warrantyExpiry: assetData.warrantyExpiry,
      status: assetData.status,
    });
    logger.info(`Created asset: ${assetData.serialNumber}`);
  }

  await mongoose.disconnect();
  logger.info('Done.');
}

seed().catch((err) => {
  logger.error(err);
  process.exit(1);
});
