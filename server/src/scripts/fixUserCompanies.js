require('dotenv').config();

const mongoose = require('mongoose');
const logger = require('../utils/logger');
const Company = require('../models/Company');
const User = require('../models/User');

const USER_COMPANY_MAPPINGS = [
  { email: 'ranjithgowda0320@gmail.com', companyName: 'HyperVerge Technologies' },
  { email: 'ranjithmarkuli03@gmail.com', companyName: 'AnkerCloud Pvt Ltd' },
  { email: 'manjulanagaraj2018@gmail.com', companyName: 'JLL Technology Solutions' },
];

const dryRun = process.argv.includes('--dry-run');

async function fixUserCompanies() {
  try {
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not configured');
    await mongoose.connect(process.env.MONGO_URI);
    logger.info({ dryRun }, 'Connected for user-company link repair');

    for (const mapping of USER_COMPANY_MAPPINGS) {
      const email = mapping.email.toLowerCase();
      const company = await Company.findOne({ companyName: mapping.companyName });
      if (!company) {
        logger.warn({ email, companyName: mapping.companyName }, 'Company not found; skipping user-company link');
        continue;
      }

      const user = await User.findOne({ email });
      if (!user) {
        logger.info({ email }, 'USER NOT FOUND');
        continue;
      }

      const currentCompany = user.companyId
        ? await Company.findById(user.companyId).select('companyName').lean()
        : null;
      const currentCompanyName = currentCompany?.companyName || '(none)';
      logger.info({ email, currentCompanyName, newCompanyName: company.companyName }, 'User company mapping');

      if (String(user.companyId || '') === String(company._id)) {
        logger.info({ email, companyName: company.companyName }, 'User company is already correct');
        continue;
      }

      if (dryRun) {
        logger.info({ email, currentCompanyName, newCompanyName: company.companyName }, 'Would update user company');
        continue;
      }

      user.companyId = company._id;
      await user.save();
      logger.info({ email, companyName: company.companyName }, 'Updated user company');
    }
  } catch {
    logger.error('Failed to repair user-company links.');
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
      } catch {
        logger.error('Failed to disconnect from MongoDB.');
        process.exitCode = 1;
      }
    }
  }
}

fixUserCompanies();