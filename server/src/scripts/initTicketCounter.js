const logger = require('../utils/logger');
// Run once before using the atomic ticket counter: node src/scripts/initTicketCounter.js
require('dotenv').config();
const mongoose = require('mongoose');
const Counter = require('../models/Counter');
const Ticket = require('../models/Ticket');

async function initTicketCounter() {
  await mongoose.connect(process.env.MONGO_URI);
  logger.info('Connected to MongoDB');

  const tickets = await Ticket.find({ ticketNumber: /^SY\d+$/ }).select('ticketNumber').lean();
  const highestSequence = tickets.reduce((highest, ticket) => {
    const match = /^SY(\d+)$/.exec(ticket.ticketNumber || '');
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);

  await Counter.findOneAndUpdate(
    { _id: 'ticket' },
    { $set: { seq: highestSequence } },
    { new: true, upsert: true }
  );

  logger.info(`Ticket counter initialized to ${highestSequence}`);
  await mongoose.disconnect();
}

initTicketCounter().catch(async (error) => {
  logger.error('Ticket counter initialization failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});