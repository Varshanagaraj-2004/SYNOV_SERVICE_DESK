const logger = require('../utils/logger');
// Run once to backfill ticketNumber for existing tickets: node src/scripts/backfillTicketNumbers.js
require('dotenv').config();
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');

async function backfillTicketNumbers() {
  await mongoose.connect(process.env.MONGO_URI);
  logger.info('Connected to MongoDB');

  const missingTickets = await Ticket.find({ ticketNumber: { $exists: false } }).sort({ createdAt: 1 });
  const currentCount = await Ticket.countDocuments({ ticketNumber: { $exists: true } });
  let counter = currentCount + 1;

  for (const ticket of missingTickets) {
    const ticketNumber = `SY${String(counter).padStart(2, '0')}`;
    ticket.ticketNumber = ticketNumber;
    await ticket.save();
    logger.info(`Ticket ${ticket._id} -> ${ticketNumber}`);
    counter += 1;
  }

  logger.info(`Backfilled ${missingTickets.length} tickets.`);
  await mongoose.disconnect();
}

backfillTicketNumbers().catch((error) => {
  logger.error('Backfill failed:', error);
  process.exit(1);
});
