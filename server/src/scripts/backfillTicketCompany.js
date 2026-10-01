const logger = require('../utils/logger');
// Run this once to populate a direct company reference on each ticket.
// Usage: node src/scripts/backfillTicketCompany.js

require('dotenv').config();
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const User = require('../models/User');

async function backfillTicketCompany() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is not set in the environment.');
  }

  await mongoose.connect(mongoUri);
  logger.info('Connected to MongoDB');

  const tickets = await Ticket.find({
    $or: [
      { company: { $exists: false } },
      { company: null },
    ],
  }).populate('requester', 'companyId');

  let updated = 0;
  let skipped = 0;

  for (const ticket of tickets) {
    let companyId = ticket.company;

    if (!companyId && ticket.requester && ticket.requester.companyId) {
      companyId = ticket.requester.companyId;
    }

    if (!companyId && ticket.companyInfo && ticket.companyInfo.companyId) {
      companyId = ticket.companyInfo.companyId;
    }

    if (!companyId) {
      skipped += 1;
      logger.warn(`Skipping ticket ${ticket._id}: it has no requester company and no companyInfo.companyId.`);
      continue;
    }

    if (!mongoose.Types.ObjectId.isValid(String(companyId))) {
      skipped += 1;
      logger.warn(`Skipping ticket ${ticket._id}: invalid company id ${companyId}`);
      continue;
    }

    ticket.company = companyId;
    await ticket.save();
    updated += 1;
  }

  logger.info(`Updated ${updated} ticket(s).`);
  logger.info(`Skipped ${skipped} ticket(s).`);

  await mongoose.disconnect();
  logger.info('Migration complete.');
}

backfillTicketCompany().catch((err) => {
  logger.error('Backfill failed:', err);
  process.exit(1);
});
