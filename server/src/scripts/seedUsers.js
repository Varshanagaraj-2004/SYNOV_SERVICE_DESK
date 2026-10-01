const logger = require('../utils/logger');
// Run this once to create test accounts: node src/scripts/seedUsers.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Company = require('../models/Company');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  logger.info('Connected to MongoDB');

  const technicians = [
    { name: 'Ajay Kumar', email: 'ajay.kumar@synov.in', password: 'staff123', role: 'it_staff', designation: 'Network Engineer' },
    { name: 'Vikram Singh', email: 'vikram.singh@synov.in', password: 'staff123', role: 'it_staff', designation: 'Hardware Support Engineer' },
    { name: 'Neha Joshi', email: 'neha.joshi@synov.in', password: 'staff123', role: 'it_staff', designation: 'Software Support Engineer' },
    { name: 'Suresh (Team Lead)', email: 'suresh@synov.in', password: 'staff123', role: 'it_staff', designation: 'Team Lead' },
  ];

  const clients = [
    { name: 'Ranjith Gowda', email: 'ranjithgowda0320@gmail.com', password: 'client123', role: 'client', companyName: 'HyperVerge Technologies' },
    { name: 'Ranjith Markuli', email: 'ranjithmarkuli03@gmail.com', password: 'client123', role: 'client', companyName: 'AnkerCloud Pvt Ltd' },
    { name: 'Manjula Nagaraj', email: 'manjulanagaraj2018@gmail.com', password: 'client123', role: 'client', companyName: 'JLL Technology Solutions' },
    { name: 'Ramesh Iyer', email: 'ramesh.iyer@hyperverge.com', password: 'client123', role: 'client', companyName: 'HyperVerge Technologies' },
    { name: 'Priya Nair', email: 'priya.nair@ankercloud.com', password: 'client123', role: 'client', companyName: 'AnkerCloud Pvt Ltd' },
    { name: 'Kavya Reddy', email: 'kavya.reddy@jll.com', password: 'client123', role: 'client', companyName: 'JLL Technology Solutions' },
    { name: 'Arjun Mehta', email: 'arjun.mehta@capgemini.com', password: 'client123', role: 'client', companyName: 'Capgemini India' },
    { name: 'Divya Shah', email: 'divya.shah@stripe.com', password: 'client123', role: 'client', companyName: 'Stripe' },
    { name: 'Sanjana Rao', email: 'sanjana.rao@eightfold.ai', password: 'client123', role: 'client', companyName: 'Eightfold AI' },
  ];

  const users = [
    { name: 'Admin User', email: 'admin@synov.com', password: 'admin123', role: 'admin' },
    ...technicians,
    ...clients,
  ];

  for (const u of users) {
    const company = u.companyName
      ? await Company.findOne({ companyName: u.companyName })
      : null;
    if (u.companyName && !company) {
      throw new Error(`Company not found for ${u.email}: ${u.companyName}. Run seedCompanies.js first.`);
    }

    const existing = await User.findOne({ email: u.email });
    if (existing) {
      if (company && String(existing.companyId) !== String(company._id)) {
        existing.companyId = company._id;
        await existing.save();
        logger.info(`Updated ${u.email} with company: ${company.companyName}`);
      } else {
        logger.info(`Skipping ${u.email} — already exists`);
      }
      continue;
    }
    const passwordHash = await bcrypt.hash(u.password, 10);
    await User.create({
      name: u.name,
      email: u.email,
      passwordHash,
      role: u.role,
      companyId: company?._id,
      designation: u.designation || undefined,
    });
    logger.info(`Created ${u.role} user: ${u.email}`);
  }

  await mongoose.disconnect();
  logger.info('Done.');
}

seed().catch((err) => {
  logger.error(err);
  process.exit(1);
});
