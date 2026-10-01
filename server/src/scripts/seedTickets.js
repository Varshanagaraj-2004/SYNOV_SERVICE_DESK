const logger = require('../utils/logger');
// Run once: node src/scripts/seedTickets.js
require('dotenv').config();
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');

const tickets = [
  {
    ticketInfo: {
      callLoggedDate: new Date('2026-08-20'),
      callLoggedTime: '10:15 AM',
      priority: 'Critical',
      status: 'Un-Assigned',
      callType: 'AMC',
      supportType: 'On Site',
      issueReported: 'Core switch down, entire floor offline',
    },
    companyInfo: {
      companyName: 'HyperVerge Technologies',
      department: 'IT Infrastructure',
      address: 'Bannerghatta Road, Bengaluru',
      location: 'Bengaluru',
      contactPerson: 'Ramesh Iyer',
      contactNumber: '9845012345',
      contactEmail: 'ramesh.iyer@hyperverge.com',
    },
    userInfo: {
      userName: 'Ramesh Iyer',
      userNumber: '9845012345',
      userEmail: 'ramesh.iyer@hyperverge.com',
      userAddress: 'Bannerghatta Road, Bengaluru',
    },
    productInfo: {
      productName: 'Cisco Catalyst 9300',
      productDescription: '48-port core switch',
      productModel: 'C9300-48P',
      productSerialNumber: 'FCW2145L0K3',
      warrantyStatus: 'Active',
    },
    assignment: { assignedBy: '', assignedTo: '', assignedOn: null, assignStatus: 'Pending', actionTaken: '', accompaniedBy: '' },
  },
  {
    ticketInfo: {
      callLoggedDate: new Date('2026-08-21'),
      callLoggedTime: '2:30 PM',
      priority: 'High',
      status: 'Assigned',
      callType: 'Others',
      supportType: 'Remote',
      issueReported: 'Firewall rule blocking VPN access for remote staff',
    },
    companyInfo: {
      companyName: 'AnkerCloud Pvt Ltd',
      department: 'Security Ops',
      address: 'Whitefield, Bengaluru',
      location: 'Bengaluru',
      contactPerson: 'Priya Nair',
      contactNumber: '9900123456',
      contactEmail: 'priya.nair@ankercloud.com',
    },
    userInfo: {
      userName: 'Priya Nair',
      userNumber: '9900123456',
      userEmail: 'priya.nair@ankercloud.com',
      userAddress: 'Whitefield, Bengaluru',
    },
    productInfo: {
      productName: 'Fortinet FortiGate',
      productDescription: 'Firewall appliance',
      productModel: 'FG-100F',
      productSerialNumber: 'FG100F4Q17000123',
      warrantyStatus: 'Active',
    },
    assignment: { assignedBy: 'Suresh (Team Lead)', assignedTo: 'Ajay Kumar', assignedOn: new Date('2026-08-21'), assignStatus: 'In Progress', actionTaken: 'Reviewing firewall rule set', accompaniedBy: '' },
  },
  {
    ticketInfo: {
      callLoggedDate: new Date('2026-08-19'),
      callLoggedTime: '9:00 AM',
      priority: 'Medium',
      status: 'Closed',
      callType: 'AMC',
      supportType: 'On Site',
      issueReported: 'Printer not connecting to network',
    },
    companyInfo: {
      companyName: 'JLL Technology Solutions',
      department: 'Admin',
      address: 'MG Road, Bengaluru',
      location: 'Bengaluru',
      contactPerson: 'Kavya Reddy',
      contactNumber: '9765432109',
      contactEmail: 'kavya.reddy@jll.com',
    },
    userInfo: {
      userName: 'Kavya Reddy',
      userNumber: '9765432109',
      userEmail: 'kavya.reddy@jll.com',
      userAddress: 'MG Road, Bengaluru',
    },
    productInfo: {
      productName: 'HP LaserJet Pro',
      productDescription: 'Network printer',
      productModel: 'M404dn',
      productSerialNumber: 'HP404DN220091',
      warrantyStatus: 'Expired',
    },
    assignment: { assignedBy: 'Suresh (Team Lead)', assignedTo: 'Vikram Singh', assignedOn: new Date('2026-08-19'), assignStatus: 'Resolved', actionTaken: 'Reconfigured static IP and reconnected to switch port', accompaniedBy: '' },
    feedback: { rating: 5, comment: 'Quick fix, very professional', submittedAt: new Date('2026-08-19') },
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  logger.info('Connected to MongoDB');

  await Ticket.deleteMany({});
  logger.info('Cleared existing tickets');

  await Ticket.insertMany(tickets);
  logger.info(`Seeded ${tickets.length} tickets`);

  await mongoose.disconnect();
  logger.info('Done.');
}

seed().catch((err) => {
  logger.error(err);
  process.exit(1);
});
