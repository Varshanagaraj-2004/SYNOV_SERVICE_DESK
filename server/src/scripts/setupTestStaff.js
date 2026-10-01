const logger = require('../utils/logger');
// Creates (or converts) IT staff test users. Safe to re-run.
// Usage: node src/scripts/setupTestStaff.js [--dry-run]
// Password: TEST_STAFF_PASSWORD from server/.env, otherwise the dev default "staff123".
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Company = require('../models/Company');

const STAFF = [
  {
    email: 'slrtrans.org@gmail.com',
    name: 'SLR Trans',
    designation: 'Support Engineer',
    // If this email was set as a company contact, put it back to the original seed value.
    restoreCompanyContact: {
      companyName: 'Capgemini India',
      contactEmail: 'manjulanagaraj2018@gmail.com',
    },
  },
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function setupTestStaff() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run in production');
  }
  const dryRun = process.argv.includes('--dry-run');
  const password = process.env.TEST_STAFF_PASSWORD || 'staff123';

  await mongoose.connect(process.env.MONGO_URI);
  logger.info('Connected to MongoDB');
  const passwordHash = await bcrypt.hash(password, 10);

  for (const entry of STAFF) {
    const email = entry.email.toLowerCase();
    const existing = await User.findOne({ email });

    if (existing?.role === 'admin') {
      logger.warn(`Skipping ${email}: it belongs to an admin account`);
      continue;
    }

    const action = existing ? `convert ${existing.role} -> it_staff` : 'create it_staff';
    if (dryRun) {
      logger.info(`[dry-run] ${email}: ${action}`);
      continue;
    }

    if (existing) {
      existing.role = 'it_staff';
      existing.name = entry.name;
      existing.designation = entry.designation;
      existing.companyId = undefined;
      existing.isCompanyAdmin = false;
      existing.unverified = false;
      existing.active = true;
      existing.passwordHash = passwordHash;
      existing.passwordChangedAt = new Date();
      existing.mustChangePassword = false;
      await existing.save();
    } else {
      await User.create({
        name: entry.name,
        email,
        role: 'it_staff',
        designation: entry.designation,
        passwordHash,
        mustChangePassword: false,
        active: true,
      });
    }
    logger.info(`${email}: ${action} done`);

    if (entry.restoreCompanyContact) {
      const { companyName, contactEmail } = entry.restoreCompanyContact;
      const result = await Company.updateOne(
        { companyName, contactEmail: new RegExp(`^${escapeRegex(email)}$`, 'i') },
        { $set: { contactEmail } }
      );
      if (result.modifiedCount) logger.info(`Restored ${companyName} contact email`);
    }
  }
}

setupTestStaff()
  .catch((err) => {
    logger.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());