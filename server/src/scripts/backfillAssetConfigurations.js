const logger = require('../utils/logger');
// Run this once to backfill asset configurations: node src/scripts/backfillAssetConfigurations.js
require('dotenv').config();
const mongoose = require('mongoose');
const Asset = require('../models/Assets');

const configurations = [
  {
    serialNumber: 'FCW2145L0K3',
    configuration: '48-port Gigabit Ethernet, PoE+, 4x 10G SFP+ uplinks',
  },
  {
    serialNumber: 'FG100F4Q17000123',
    configuration: '16GB RAM, 10x GE RJ45 ports, 2x 10GE SFP+',
  },
  {
    serialNumber: 'HP404DN220091',
    configuration: 'Monochrome laser, 38ppm, duplex printing, network-ready',
  },
  {
    serialNumber: 'DL5440229981',
    configuration: 'Intel Core i5, 16GB RAM, 512GB SSD',
  },
  {
    serialNumber: 'JN4300881122',
    configuration: '48-port Gigabit Ethernet, 4x 10G uplinks, stackable',
  },
  {
    serialNumber: 'IP14229981XY',
    configuration: '128GB, Midnight',
  },
  {
    serialNumber: 'DLPE7402209X',
    configuration: '2x Intel Xeon Silver, 64GB RAM, 4TB RAID storage',
  },
  {
    serialNumber: 'LNVE14229912',
    configuration: 'AMD Ryzen 5, 8GB RAM, 256GB SSD',
  },
];

async function backfillConfigurations() {
  await mongoose.connect(process.env.MONGO_URI);
  logger.info('Connected to MongoDB');

  let updatedCount = 0;

  for (const assetData of configurations) {
    const asset = await Asset.findOneAndUpdate(
      { serialNumber: assetData.serialNumber },
      { $set: { configuration: assetData.configuration } },
      { new: true }
    );

    if (!asset) {
      logger.warn(`Warning: asset not found for ${assetData.serialNumber}`);
      continue;
    }

    updatedCount += 1;
    logger.info(`Updated asset configuration: ${assetData.serialNumber}`);
  }

  logger.info(`Updated ${updatedCount} of ${configurations.length} asset configurations`);

  await mongoose.disconnect();
  logger.info('Done.');
}

backfillConfigurations().catch((err) => {
  logger.error(err);
  process.exit(1);
});
