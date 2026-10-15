// Usage: node src/scripts/clearAssets.js [--yes] [--manual-only] [--company="<name>"]
require('dotenv').config();
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const Asset = require('../models/Assets');

function parseArguments(args) {
  const options = {
    yes: false,
    manualOnly: false,
    company: undefined,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--yes') {
      options.yes = true;
    } else if (argument === '--manual-only') {
      options.manualOnly = true;
    } else if (argument.startsWith('--company=')) {
      options.company = argument.slice('--company='.length);
    } else if (argument === '--company') {
      index += 1;
      if (index >= args.length) {
        throw new Error('--company requires a company name.');
      }
      options.company = args[index];
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (options.company !== undefined && options.company.length === 0) {
    throw new Error('--company requires a non-empty company name.');
  }

  return options;
}

function buildFilter(options) {
  const conditions = [];

  if (options.manualOnly) {
    conditions.push({
      $or: [
        { crmId: { $exists: false } },
        { crmId: null },
        { crmId: '' },
      ],
    });
  }

  if (options.company !== undefined) {
    const escapedCompany = options.company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    conditions.push({
      company: { $regex: `^${escapedCompany}$`, $options: 'i' },
    });
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { $and: conditions };
}

function waitForConfirmation() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      process.removeListener('SIGINT', cancel);
      resolve();
    }, 5000);

    function cancel() {
      clearTimeout(timer);
      process.removeListener('SIGINT', cancel);
      reject(new Error('Cancelled by user.'));
    }

    process.once('SIGINT', cancel);
  });
}

async function clearAssets() {
  try {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Refusing to run in production');
    }

    const options = parseArguments(process.argv.slice(2));
    const filter = buildFilter(options);

    await mongoose.connect(process.env.MONGO_URI);
    logger.info('Connected to MongoDB');

    if (!options.yes) {
      const breakdown = await Asset.aggregate([
        { $match: filter },
        {
          $group: {
            _id: {
              $let: {
                vars: { company: { $ifNull: ['$company', ''] } },
                in: { $cond: [{ $eq: ['$$company', ''] }, 'No company', '$$company'] },
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);
      const total = breakdown.reduce((sum, item) => sum + item.count, 0);

      logger.info(`Assets that would be deleted: ${total}`);
      breakdown.forEach(({ _id: company, count }) => {
        logger.info(`${company}: ${count}`);
      });
      logger.info('Dry run only. Re-run with --yes to delete.');
      logger.info('Tickets keep their stored product details.');
      return;
    }

    const matchingCount = await Asset.countDocuments(filter);
    logger.info(`Asset deletion filter: ${JSON.stringify(filter)}`);
    logger.info(`Matching assets: ${matchingCount}`);
    logger.info('Waiting 5 seconds before deletion. Press Ctrl+C to cancel.');
    await waitForConfirmation();

    const result = await Asset.deleteMany(filter);
    logger.info(`Deleted ${result.deletedCount} assets`);
    logger.info('Tickets keep their stored product details.');
  } catch (err) {
    logger.error(err);
    process.exitCode = 1;
  } finally {
    try {
      await mongoose.disconnect();
    } catch (err) {
      logger.error('Failed to disconnect from MongoDB', err);
      process.exitCode = 1;
    }
  }
}

clearAssets();
