const logger = require('../utils/logger');
// Run this once to backfill ticket company links: node src/scripts/backfillTicketCompanyIds.js
require('dotenv').config();
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const Company = require('../models/Company');

async function backfill() {
  await mongoose.connect(process.env.MONGO_URI);
  logger.info('Connected to MongoDB');

  const tickets = await Ticket.find({
    $or: [
      { 'companyInfo.companyId': { $exists: false } },
      { 'companyInfo.companyId': null },
    ],
  });
  let updated = 0;
  let skipped = 0;
  const skipReasons = {};

  for (const ticket of tickets) {
    const companyName = ticket.companyInfo?.companyName;
    if (!companyName) {
      skipped += 1;
      skipReasons['missing companyName'] = (skipReasons['missing companyName'] || 0) + 1;
      logger.warn(`Warning: ticket ${ticket._id} has no companyName; skipping`);
      continue;
    }

    const company = await Company.findOne({ companyName });
    if (!company) {
      skipped += 1;
      skipReasons[`company not found: ${companyName}`] =
        (skipReasons[`company not found: ${companyName}`] || 0) + 1;
      logger.warn(`Warning: company not found for ticket ${ticket._id}: ${companyName}; skipping`);
      continue;
    }

    ticket.companyInfo.companyId = company._id;
    await ticket.save();
    updated += 1;
  }

  logger.info(`Updated ${updated} ticket(s).`);
  logger.info(`Skipped ${skipped} ticket(s).`);
  if (skipped > 0) logger.info('Skip reasons:', skipReasons);

  await mongoose.disconnect();
  logger.info('Done.');
}

backfill().catch((err) => {
  logger.error(err);
  process.exit(1);
});
