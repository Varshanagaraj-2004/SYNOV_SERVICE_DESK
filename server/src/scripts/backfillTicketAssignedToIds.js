const logger = require('../utils/logger');
// Run once to link existing ticket assignments to technician IDs.
require('dotenv').config();
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const User = require('../models/User');

async function backfillTicketAssignedToIds() {
  await mongoose.connect(process.env.MONGO_URI);
  logger.info('Connected to MongoDB');

  const tickets = await Ticket.find({
    'assignment.assignedTo': { $nin: ['', null] },
    $or: [
      { 'assignment.assignedToId': { $exists: false } },
      { 'assignment.assignedToId': null },
    ],
  }).select('_id assignment.assignedTo');

  let updatedCount = 0;
  let unmatchedCount = 0;
  for (const ticket of tickets) {
    const technician = await User.findOne({
      name: ticket.assignment.assignedTo,
      role: 'it_staff',
    }).select('_id');

    if (!technician) {
      unmatchedCount += 1;
      logger.warn(`No IT staff match for ticket ${ticket._id} assigned to ${ticket.assignment.assignedTo}`);
      continue;
    }

    await Ticket.updateOne(
      { _id: ticket._id },
      { $set: { 'assignment.assignedToId': technician._id } }
    );
    updatedCount += 1;
  }

  logger.info(`Updated ${updatedCount} ticket assignments; ${unmatchedCount} unmatched.`);
  await mongoose.disconnect();
}

backfillTicketAssignedToIds().catch(async (error) => {
  logger.error('Ticket assignment migration failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});