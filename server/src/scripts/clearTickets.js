const logger = require('../utils/logger');
// Deletes ALL tickets, messages and ticket activity, and resets the ticket counter.
// Usage: node src/scripts/clearTickets.js --yes
require('dotenv').config();
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const Message = require('../models/Message');
const TicketActivity = require('../models/TicketActivity');
const Counter = require('../models/Counter');

async function clearTickets() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run in production');
  }
  if (!process.argv.includes('--yes')) {
    throw new Error('This deletes ALL tickets. Re-run with --yes to confirm.');
  }

  await mongoose.connect(process.env.MONGO_URI);
  logger.info('Connected to MongoDB');

  const messages = await Message.deleteMany({});
  logger.info(`Deleted ${messages.deletedCount} messages`);

  const activity = await TicketActivity.deleteMany({});
  logger.info(`Deleted ${activity.deletedCount} activity entries`);

  const tickets = await Ticket.deleteMany({});
  logger.info(`Deleted ${tickets.deletedCount} tickets`);

  await Counter.findOneAndUpdate(
    { _id: 'ticket' },
    { $set: { seq: 0 } },
    { upsert: true }
  );
  logger.info('Ticket counter reset to 0');
}

clearTickets()
  .catch((err) => {
    logger.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());