const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Company = require('../models/Company');
const Ticket = require('../models/Ticket');
const User = require('../models/User');

const requiredVariables = [
  'MONGO_URI_TEST',
  'E2E_ADMIN_EMAIL',
  'E2E_ADMIN_PASSWORD',
  'E2E_STAFF_EMAIL',
  'E2E_STAFF_PASSWORD',
  'E2E_CLIENT_EMAIL',
  'E2E_CLIENT_PASSWORD',
];

async function seed() {
  const missing = requiredVariables.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing E2E environment variables: ${missing.join(', ')}`);

  const databaseName = decodeURIComponent(new URL(process.env.MONGO_URI_TEST).pathname.slice(1));
  if (!/(^|[_-])test($|[_-])/i.test(databaseName)) {
    throw new Error('MONGO_URI_TEST database name must clearly identify a test database');
  }

  await mongoose.connect(process.env.MONGO_URI_TEST);
  try {
    await mongoose.connection.dropDatabase();
    const company = await Company.create({
      companyName: 'Anker Cloud',
      contactEmail: process.env.E2E_CLIENT_EMAIL,
      status: 'Active',
    });
    const [admin, staff, client] = await Promise.all([
      User.create({
        name: 'E2E Admin',
        email: process.env.E2E_ADMIN_EMAIL.toLowerCase(),
        passwordHash: await bcrypt.hash(process.env.E2E_ADMIN_PASSWORD, 10),
        role: 'admin',
      }),
      User.create({
        name: 'E2E Technician',
        email: process.env.E2E_STAFF_EMAIL.toLowerCase(),
        passwordHash: await bcrypt.hash(process.env.E2E_STAFF_PASSWORD, 10),
        role: 'it_staff',
        designation: 'Support Engineer',
      }),
      User.create({
        name: 'E2E Client',
        email: process.env.E2E_CLIENT_EMAIL.toLowerCase(),
        passwordHash: await bcrypt.hash(process.env.E2E_CLIENT_PASSWORD, 10),
        role: 'client',
        companyId: company._id,
      }),
    ]);

    await Ticket.create({
      ticketNumber: 'E2E0001',
      ticketInfo: {
        priority: 'Medium',
        status: 'Re-Assigned',
        issueReported: 'E2E chat fixture',
      },
      requester: client._id,
      company: company._id,
      companyInfo: {
        companyId: company._id,
        companyName: company.companyName,
        contactEmail: client.email,
      },
      userInfo: { userName: client.name, userEmail: client.email },
      assignment: {
        assignedBy: admin.name,
        assignedTo: staff.name,
        assignedToId: staff._id,
        assignStatus: 'Re-Assigned',
      },
    });
  } finally {
    await mongoose.disconnect();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});