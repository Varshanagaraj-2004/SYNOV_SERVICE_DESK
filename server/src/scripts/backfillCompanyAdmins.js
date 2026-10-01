const logger = require('../utils/logger');
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function backfillCompanyAdmins() {
  await mongoose.connect(process.env.MONGO_URI);
  const clients = await User.find({
    role: 'client',
    companyId: { $ne: null },
    active: { $ne: false },
  })
    .sort({ companyId: 1, createdAt: 1, _id: 1 })
    .select('_id companyId isCompanyAdmin')
    .lean();

  await User.updateMany(
    { role: 'client', isCompanyAdmin: { $exists: false } },
    { $set: { isCompanyAdmin: false } }
  );

  const companiesWithAdmins = new Set(
    clients.filter((client) => client.isCompanyAdmin).map((client) => String(client.companyId))
  );
  const operations = [];
  for (const client of clients) {
    const companyId = String(client.companyId);
    if (companiesWithAdmins.has(companyId)) continue;
    companiesWithAdmins.add(companyId);
    operations.push({
      updateOne: {
        filter: { _id: client._id },
        update: { $set: { isCompanyAdmin: true } },
      },
    });
  }

  if (operations.length) await User.bulkWrite(operations);
  logger.info(`Assigned company-admin access for ${operations.length} company/companies.`);
  await mongoose.disconnect();
}

backfillCompanyAdmins().catch(async (error) => {
  logger.error('Company-admin migration failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});