require('dotenv').config();

const mongoose = require('mongoose');
const logger = require('../utils/logger');
const Ticket = require('../models/Ticket');

const dryRun = process.argv.includes('--dry-run');
const matchingTickets = {
  source: 'email',
  $expr: { $eq: ['$productInfo.productDescription', '$description'] },
};

async function fixEmailProductDescription() {
  try {
    if (process.env.NODE_ENV === 'production') {
      logger.error('Refusing to repair email product descriptions in production.');
      process.exitCode = 1;
      return;
    }

    if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not configured');
    await mongoose.connect(process.env.MONGO_URI);

    if (dryRun) {
      const count = await Ticket.countDocuments(matchingTickets);
      logger.info({ count }, `Dry run: ${count} email ticket(s) would be updated.`);
      return;
    }

    const result = await Ticket.updateMany(matchingTickets, {
      $unset: { 'productInfo.productDescription': 1 },
    });
    logger.info({ count: result.modifiedCount }, `Updated ${result.modifiedCount} email ticket(s).`);
  } catch (error) {
    logger.error({ err: error }, 'Failed to repair email product descriptions.');
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
      } catch (error) {
        logger.error({ err: error }, 'Failed to disconnect from MongoDB.');
        process.exitCode = 1;
      }
    }
  }
}

fixEmailProductDescription();
