const logger = require('../utils/logger');
// Run this once to create the Stripe company: node src/scripts/seedCompanies.js
require('dotenv').config();
const mongoose = require('mongoose');
const Company = require('../models/Company');
const User = require('../models/User');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  logger.info('Connected to MongoDB');

  let company = await Company.findOne({ companyName: 'Stripe' });
  if (company) {
    await Company.updateOne(
      { _id: company._id },
      {
        $set: {
          department: 'Finance and Payments',
          contactPerson: 'Stripe India Contact',
          contactEmail: 'client@stripe.com',
          contactNumber: '+91 80 4567 8900',
          address: 'Bengaluru, Karnataka, India',
          location: 'Bengaluru, India',
        },
      }
    );
    logger.info('Updated Stripe - existing company data refreshed');
  } else {
    company = await Company.create({
      companyName: 'Stripe',
      department: 'Finance and Payments',
      contactPerson: 'Stripe India Contact',
      contactEmail: 'client@stripe.com',
      contactNumber: '+91 80 4567 8900',
      address: 'Bengaluru, Karnataka, India',
      location: 'Bengaluru, India',
    });
    logger.info('Created company: Stripe');
  }

  const user = await User.findOneAndUpdate(
    { email: 'client@stripe.com' },
    { companyId: company._id },
    { new: true }
  );

  if (user) {
    logger.info(`Updated ${user.email} with company: ${company.companyName}`);
  } else {
    logger.info('User client@stripe.com was not found; company link was not updated');
  }

  const companies = [
    {
      companyName: 'HyperVerge Technologies',
      department: 'IT Infrastructure',
      contactPerson: 'Ramesh Iyer',
      contactEmail: 'ranjithgowda0320@gmail.com',
      contactNumber: '9845012345',
      address: 'Bannerghatta Road, Bengaluru',
      location: 'Bengaluru',
    },
    {
      companyName: 'AnkerCloud Pvt Ltd',
      department: 'Security Ops',
      contactPerson: 'Priya Nair',
      contactEmail: 'ranjithmarkuli03@gmail.com',
      contactNumber: '9900123456',
      address: 'Whitefield, Bengaluru',
      location: 'Bengaluru',
    },
    {
      companyName: 'JLL Technology Solutions',
      department: 'Admin',
      contactPerson: 'Kavya Reddy',
      contactEmail: 'manjulanagaraj2018@gmail.com',
      contactNumber: '9765432109',
      address: 'MG Road, Bengaluru',
      location: 'Bengaluru',
    },
    {
      companyName: 'Capgemini India',
      department: 'Employee Onboarding',
      contactPerson: 'Arjun Mehta',
      contactEmail: 'arjun.mehta@capgemini.com',
      contactNumber: '9123456789',
      address: 'Electronic City, Bengaluru',
      location: 'Bengaluru',
    },
    {
      companyName: 'Eightfold AI',
      department: 'HR',
      contactPerson: 'Sanjana Rao',
      contactEmail: 'sanjana.rao@eightfold.ai',
      contactNumber: '9012345678',
      address: 'Indiranagar, Bengaluru',
      location: 'Bengaluru',
    },
  ];

  for (const companyData of companies) {
    const existingCompany = await Company.findOne({ companyName: companyData.companyName });
    if (existingCompany) {
      await Company.updateOne(
        { _id: existingCompany._id },
        {
          $set: {
            department: companyData.department,
            contactPerson: companyData.contactPerson,
            contactEmail: companyData.contactEmail,
            contactNumber: companyData.contactNumber,
            address: companyData.address,
            location: companyData.location,
          },
        }
      );
      logger.info(`Updated ${companyData.companyName} - existing company data refreshed`);
      continue;
    }
    await Company.create(companyData);
    logger.info(`Created company: ${companyData.companyName}`);
  }

  await mongoose.disconnect();
  logger.info('Done.');
}

seed().catch((err) => {
  logger.error(err);
  process.exit(1);
});
