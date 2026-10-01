const logger = require('../utils/logger');
// Run this once to remove stale technician accounts: node src/scripts/cleanupDuplicateTechnicians.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function cleanup() {
  await mongoose.connect(process.env.MONGO_URI);
  logger.info('Connected to MongoDB');

  const staleTechnicians = await User.find({
    role: 'it_staff',
    email: { $regex: /@synov\.com$/i },
  }).select('name email');

  for (const technician of staleTechnicians) {
    logger.info(`Deleting stale technician: ${technician.name} <${technician.email}>`);
  }

  const result = await User.deleteMany({
    role: 'it_staff',
    email: { $regex: /@synov\.com$/i },
  });

  logger.info(`Deleted ${result.deletedCount} duplicate technician account(s).`);
  await mongoose.disconnect();
  logger.info('Done.');
}

cleanup().catch((err) => {
  logger.error(err);
  process.exit(1);
});
