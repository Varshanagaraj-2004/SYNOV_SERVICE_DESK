const { after, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.EMAIL_TRANSPORT = 'stub';
process.env.IT_TEAM_EMAIL = 'it-team@example.com';
process.env.FRONTEND_URL = 'https://support.example.test';

const nodemailer = require('nodemailer');
const sentMessages = [];
const originalCreateTransport = nodemailer.createTransport;
nodemailer.createTransport = () => ({
  sendMail: async (message) => {
    sentMessages.push(message);
    return { messageId: 'stubbed-message' };
  },
});

const {
  ticketClosedClientEmail,
  ticketReopenedTechnicianEmail,
  ticketRaisedClientEmail,
} = require('../src/services/emailService');

const ticket = {
  _id: '0123456789abcdef01234567',
  ticketNumber: 'SY0012',
  ticketInfo: { issueReported: 'A test issue', status: 'New' },
  userInfo: { userEmail: 'RANJITHGOWDA0320@gmail.com' },
  companyInfo: { contactEmail: 'company@example.com' },
};

after(() => {
  nodemailer.createTransport = originalCreateTransport;
});

beforeEach(() => {
  sentMessages.length = 0;
});

describe('ticket client email recipients', () => {
  it('sends confirmation mail to the requester first and de-duplicates addresses', async () => {
    await ticketRaisedClientEmail(ticket, 'RanjithGowda0320@gmail.com');

    assert.deepEqual(sentMessages[0].to, [
      'ranjithgowda0320@gmail.com',
      'company@example.com',
    ]);
  });

  it('includes the requester in ticket-closed mail recipients', async () => {
    await ticketClosedClientEmail(ticket, 'RanjithGowda0320@gmail.com');

    assert.deepEqual(sentMessages[0].to, [
      'ranjithgowda0320@gmail.com',
      'company@example.com',
    ]);
  });

  it('sends reopen notifications to the technician and IT team with actor and reason', async () => {
    await ticketReopenedTechnicianEmail(
      ticket,
      { email: 'IT-TEAM@example.com' },
      'Admin User',
      'The issue has returned',
    );

    assert.deepEqual(sentMessages[0].to, ['it-team@example.com']);
    assert.equal(sentMessages[0].subject, 'Ticket #SY0012 has been reopened');
    assert.match(sentMessages[0].text, /reopened by Admin User/);
    assert.match(sentMessages[0].text, /Reason: The issue has returned/);
    assert.match(sentMessages[0].text, /\/tickets\/0123456789abcdef01234567/);
  });
});