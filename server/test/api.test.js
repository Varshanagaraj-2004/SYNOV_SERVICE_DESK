const { after, before, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const { PassThrough } = require('node:stream');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { createHash } = require('node:crypto');
const Imap = require('imap-simple');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const cloudinary = require('../src/config/cloudinary');

process.env.JWT_SECRET = process.env.JWT_SECRET || '0123456789abcdef'.repeat(6);
process.env.REOPEN_WINDOW_DAYS = '7';
process.env.ANTHROPIC_API_KEY = '';
process.env.EMAIL_TRANSPORT = 'stub';
process.env.IMAP_REQUIRE_AUTH_RESULTS = 'false';
process.env.IMAP_HOST = 'imap.test';
process.env.IMAP_USER = 'test-user';
process.env.IMAP_PASS = 'test-password';

const app = require('../src/app');
const Company = require('../src/models/Company');
const CompanyContact = require('../src/models/CompanyContact');
const Counter = require('../src/models/Counter');
const Asset = require('../src/models/Assets');
const Message = require('../src/models/Message');
const Ticket = require('../src/models/Ticket');
const TicketActivity = require('../src/models/TicketActivity');
const User = require('../src/models/User');
const {
  createTicketFromEmail,
  looksLikeAutoReply,
  looksLikeGenuineIssue,
  pollInbox,
} = require('../src/services/emailIngestionService');

const password = 'test-password-123';
let mongoServer;
let fixtures;

function auth(user) {
  return `Bearer ${jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' })}`;
}

async function createTicket({ company, requester, status = 'New', assignedTo = '' }) {
  return Ticket.create({
    ticketInfo: { priority: 'Medium', status, issueReported: `Issue for ${company.companyName}` },
    requester: requester._id,
    companyInfo: {
      companyId: company._id,
      companyName: company.companyName,
      contactEmail: requester.email,
    },
    userInfo: { userName: requester.name, userEmail: requester.email },
    assignment: {
      assignedTo,
      assignedToId: assignedTo ? fixtures.staff._id : null,
      assignStatus: assignedTo ? 'Assigned' : 'Pending',
    },
  });
}

describe('API integration', () => {
  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  beforeEach(async () => {
    await Promise.all([
      Company.deleteMany({}),
      CompanyContact.deleteMany({}),
      Counter.deleteMany({}),
      Asset.deleteMany({}),
      Message.deleteMany({}),
      Ticket.deleteMany({}),
      TicketActivity.deleteMany({}),
      User.deleteMany({}),
    ]);

    const [company, otherCompany] = await Company.create([
      { companyName: 'Northwind', contactEmail: 'client@northwind.test' },
      { companyName: 'Contoso', contactEmail: 'client@contoso.test' },
    ]);
    const passwordHash = await bcrypt.hash(password, 4);
    const [client, otherClient, staff, admin] = await User.create([
      { name: 'Northwind Client', email: 'client@northwind.test', passwordHash, role: 'client', companyId: company._id },
      { name: 'Contoso Client', email: 'client@contoso.test', passwordHash, role: 'client', companyId: otherCompany._id },
      { name: 'Test Technician', email: 'staff@service.test', passwordHash, role: 'it_staff' },
      { name: 'Test Admin', email: 'admin@service.test', passwordHash, role: 'admin' },
    ]);
    fixtures = { company, otherCompany, client, otherClient, staff, admin };
    fixtures.ownTicket = await createTicket({ company, requester: client, assignedTo: staff.name });
    fixtures.otherTicket = await createTicket({ company: otherCompany, requester: otherClient });
  });

  after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('logs in successfully and rejects invalid credentials', async () => {
    const success = await request(app).post('/api/auth/login').send({ email: fixtures.client.email, password });
    assert.equal(success.status, 200);
    assert.ok(success.body.token);

    const failure = await request(app).post('/api/auth/login').send({ email: fixtures.client.email, password: 'incorrect' });
    assert.equal(failure.status, 401);
  });

  it('returns a fresh login-equivalent token after changing a password', async () => {
    const response = await request(app).patch('/api/auth/change-password')
      .set('Authorization', auth(fixtures.client))
      .send({ currentPassword: password, newPassword: 'new-password-123' });

    assert.equal(response.status, 200);
    assert.equal(response.body.mustChangePassword, false);
    const claims = jwt.decode(response.body.token);
    assert.equal(claims.id, String(fixtures.client._id));
    assert.equal(claims.role, fixtures.client.role);
    assert.equal(claims.companyId, String(fixtures.client.companyId));
    assert.equal(claims.name, fixtures.client.name);
    assert.equal(claims.designation, null);
    assert.equal(claims.exp - claims.iat, 7 * 24 * 60 * 60);
  });

  it('does not authenticate unverified users or distinguish them from invalid credentials', async () => {
    fixtures.client.unverified = true;
    await fixtures.client.save();

    const unverified = await request(app).post('/api/auth/login')
      .send({ email: fixtures.client.email, password });
    const invalid = await request(app).post('/api/auth/login')
      .send({ email: fixtures.client.email, password: 'incorrect' });

    assert.equal(unverified.status, 401);
    assert.deepEqual(unverified.body, invalid.body);
  });

  it('skips reset emails for unverified and inactive users', async () => {
    fixtures.client.unverified = true;
    fixtures.otherClient.active = false;
    await Promise.all([fixtures.client.save(), fixtures.otherClient.save()]);

    const responses = await Promise.all([fixtures.client, fixtures.otherClient].map((user) => (
      request(app).post('/api/auth/forgot-password').send({ email: user.email })
    )));
    assert.deepEqual(responses.map((response) => response.status), [200, 200]);
    assert.deepEqual(responses[0].body, responses[1].body);

    const users = await User.find({ _id: { $in: [fixtures.client._id, fixtures.otherClient._id] } })
      .select('+passwordResetTokenHash +passwordResetExpiresAt');
    assert.ok(users.every((user) => !user.passwordResetTokenHash && !user.passwordResetExpiresAt));
  });

  it('rejects reset links belonging to unverified users generically', async () => {
    const resetToken = 'a'.repeat(64);
    fixtures.client.unverified = true;
    fixtures.client.passwordResetTokenHash = createHash('sha256').update(resetToken).digest('hex');
    fixtures.client.passwordResetExpiresAt = new Date(Date.now() + 60_000);
    await fixtures.client.save();

    const response = await request(app).post('/api/auth/reset-password')
      .send({ token: resetToken, newPassword: 'new-password-123' });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'This password reset link is invalid or has expired.');
    const user = await User.findById(fixtures.client._id);
    assert.equal(await bcrypt.compare(password, user.passwordHash), true);
  });

  it('allows admins to verify active unverified users and create reset tokens', async () => {
    fixtures.client.unverified = true;
    await fixtures.client.save();

    const forbidden = await request(app).patch(`/api/users/${fixtures.client._id}/verify`)
      .set('Authorization', auth(fixtures.staff));
    assert.equal(forbidden.status, 403);

    const verified = await request(app).patch(`/api/users/${fixtures.client._id}/verify`)
      .set('Authorization', auth(fixtures.admin));
    assert.equal(verified.status, 200);

    const user = await User.findById(fixtures.client._id)
      .select('+passwordResetTokenHash +passwordResetExpiresAt');
    assert.equal(user.unverified, false);
    assert.equal(user.passwordResetTokenHash.length, 64);
    assert.ok(user.passwordResetExpiresAt > new Date());
  });

  it('rate limits repeated login attempts', async () => {
    const attempts = await Promise.all(Array.from({ length: 11 }, () => request(app)
      .post('/api/auth/login')
      .send({ email: 'rate-limit@service.test', password: 'incorrect' })));
    assert.deepEqual(attempts.slice(0, 10).map((response) => response.status), Array(10).fill(401));
    assert.equal(attempts[10].status, 429);
  });

  it('rejects a valid token after its user has been deleted', async () => {
    const token = auth(fixtures.client);
    await User.deleteOne({ _id: fixtures.client._id });

    const response = await request(app).get('/api/companies').set('Authorization', token);
    assert.equal(response.status, 401);
  });

  it('requires authentication for GET /api/companies', async () => {
    const response = await request(app).get('/api/companies');
    assert.equal(response.status, 401);
  });

  it('isolates company tickets in list and detail endpoints', async () => {
    const list = await request(app).get('/api/tickets').set('Authorization', auth(fixtures.client));
    assert.equal(list.status, 200);
    assert.equal(list.body.total, 1);
    assert.equal(String(list.body.items[0]._id), String(fixtures.ownTicket._id));

    const detail = await request(app).get(`/api/tickets/${fixtures.otherTicket._id}`)
      .set('Authorization', auth(fixtures.client));
    assert.equal(detail.status, 403);
  });

  it('ignores privileged fields when a client creates a ticket', async () => {
    const response = await request(app).post('/api/tickets')
      .set('Authorization', auth(fixtures.client))
      .send({
        ticketInfo: { priority: 'High', issueReported: 'Client-submitted issue', status: 'Closed' },
        companyInfo: { companyId: String(fixtures.otherCompany._id), companyName: 'Forged company' },
        assignment: { assignedTo: fixtures.staff.name },
        feedback: null,
        source: 'email',
        requester: String(fixtures.otherClient._id),
      });

    assert.equal(response.status, 201);
    assert.equal(String(response.body.companyInfo.companyId), String(fixtures.company._id));
    assert.equal(response.body.companyInfo.companyName, fixtures.company.companyName);
    assert.equal(response.body.ticketInfo.status, 'Un-Assigned');
    assert.equal(response.body.source, 'web');
    assert.equal(response.body.assignment.assignedTo, '');
    assert.equal(response.body.feedback, undefined);
    assert.equal(String(response.body.requester), String(fixtures.client._id));
  });

  it('enforces valid ticket status transitions', async () => {
    const token = auth(fixtures.admin);
    const invalid = await request(app).patch(`/api/tickets/${fixtures.ownTicket._id}/status`)
      .set('Authorization', token)
      .send({ status: 'Closed', actionTaken: 'Resolved' });
    assert.equal(invalid.status, 400);

    const assigned = await request(app).patch(`/api/tickets/${fixtures.ownTicket._id}/status`)
      .set('Authorization', token)
      .send({ status: 'Assigned', assignedTo: fixtures.staff.name });
    assert.equal(assigned.status, 200);
    assert.equal(assigned.body.ticketInfo.status, 'Assigned');

    const closed = await request(app).patch(`/api/tickets/${fixtures.ownTicket._id}/status`)
      .set('Authorization', token)
      .send({ status: 'Closed', actionTaken: 'Resolved' });
    assert.equal(closed.status, 200);
    assert.equal(closed.body.ticketInfo.status, 'Closed');
  });

  it('allows an admin to assign themselves, use chat, and close the ticket with remarks', async () => {
    const token = auth(fixtures.admin);
    const standardTechnicians = await request(app).get('/api/technicians').set('Authorization', token);
    assert.equal(standardTechnicians.status, 200);
    assert.equal(standardTechnicians.body.some((user) => String(user._id) === String(fixtures.admin._id)), false);

    const assignableUsers = await request(app).get('/api/technicians?assignable=true').set('Authorization', token);
    assert.equal(assignableUsers.status, 200);
    const adminOption = assignableUsers.body.find((user) => String(user._id) === String(fixtures.admin._id));
    assert.ok(assignableUsers.body.some((user) => String(user._id) === String(fixtures.staff._id)));
    assert.ok(adminOption);
    assert.equal(adminOption.role, 'admin');
    assert.equal(adminOption.email, fixtures.admin.email);

    const clientAssignableUsers = await request(app).get('/api/technicians?assignable=true')
      .set('Authorization', auth(fixtures.client));
    assert.equal(clientAssignableUsers.status, 200);
    assert.equal(clientAssignableUsers.body.some((user) => String(user._id) === String(fixtures.admin._id)), false);

    const ticket = await createTicket({ company: fixtures.company, requester: fixtures.client });
    const assigned = await request(app).patch(`/api/tickets/${ticket._id}/status`)
      .set('Authorization', token)
      .send({ assignedTo: fixtures.admin.name });
    assert.equal(assigned.status, 200);
    assert.equal(assigned.body.ticketInfo.status, 'Assigned');
    assert.equal(String(assigned.body.assignment.assignedToId), String(fixtures.admin._id));

    const chatMessage = await request(app).post(`/api/tickets/${ticket._id}/messages`)
      .set('Authorization', token)
      .send({ text: 'I am reviewing this ticket.' });
    assert.equal(chatMessage.status, 201);

    const closed = await request(app).patch(`/api/tickets/${ticket._id}/status`)
      .set('Authorization', token)
      .send({ status: 'Closed', actionTaken: 'Resolved by the team lead.' });
    assert.equal(closed.status, 200);
    assert.equal(closed.body.ticketInfo.status, 'Closed');
    assert.equal(closed.body.assignment.actionTaken, 'Resolved by the team lead.');
  });

  it('allows an admin to reopen a closed ticket and preserves its history and assignment', async () => {
    const previousClosedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    fixtures.ownTicket.ticketInfo.status = 'Closed';
    fixtures.ownTicket.ticketInfo.supportType = 'Remote';
    fixtures.ownTicket.assignment.actionTaken = 'Previous resolution';
    fixtures.ownTicket.resolvedAt = previousClosedAt;
    await fixtures.ownTicket.save();

    const response = await request(app).post(`/api/tickets/${fixtures.ownTicket._id}/reopen`)
      .set('Authorization', auth(fixtures.admin))
      .send({ reason: 'The issue has returned' });

    assert.equal(response.status, 200);
    assert.equal(response.body.ticketInfo.status, 'Assigned');
    assert.equal(response.body.assignment.assignedTo, fixtures.staff.name);
    assert.equal(response.body.assignment.actionTaken, '');
    assert.equal(response.body.ticketInfo.supportType, 'Remote');
    assert.equal(response.body.reopenCount, 1);
    assert.equal(response.body.reopenReason, 'The issue has returned');
    assert.equal(String(response.body.reopenedBy), String(fixtures.admin._id));
    assert.equal(response.body.reopenHistory[0].previousActionTaken, 'Previous resolution');
    assert.equal(response.body.reopenHistory[0].previousSupportType, 'Remote');
    assert.equal(new Date(response.body.reopenHistory[0].previousClosedAt).getTime(), previousClosedAt.getTime());
    assert.equal(response.body.slaDueAt, fixtures.ownTicket.slaDueAt?.toISOString());

    const detail = await request(app).get(`/api/tickets/${fixtures.ownTicket._id}`)
      .set('Authorization', auth(fixtures.admin));
    assert.equal(detail.body.canReopen, false);
    assert.equal(detail.body.reopenHistory[0].reopenedBy.name, fixtures.admin.name);
  });

  it('reopens a closed ticket without a technician as Un-Assigned', async () => {
    fixtures.otherTicket.ticketInfo.status = 'Closed';
    fixtures.otherTicket.assignment.actionTaken = 'Previous resolution';
    fixtures.otherTicket.resolvedAt = new Date();
    await fixtures.otherTicket.save();

    const response = await request(app).post(`/api/tickets/${fixtures.otherTicket._id}/reopen`)
      .set('Authorization', auth(fixtures.admin))
      .send({ reason: 'No technician is assigned' });

    assert.equal(response.status, 200);
    assert.equal(response.body.ticketInfo.status, 'Un-Assigned');
    assert.equal(response.body.assignment.assignedTo, '');
    assert.equal(response.body.assignment.actionTaken, '');
  });

  it('filters active reopened tickets before pagination and reports their count', async () => {
    fixtures.ownTicket.ticketInfo.status = 'Assigned';
    fixtures.ownTicket.reopenCount = 2;
    fixtures.ownTicket.reopenedAt = new Date();
    fixtures.ownTicket.reopenedBy = fixtures.admin._id;
    await fixtures.ownTicket.save();
    fixtures.otherTicket.ticketInfo.status = 'Closed';
    fixtures.otherTicket.reopenCount = 1;
    await fixtures.otherTicket.save();

    const list = await request(app).get('/api/tickets?reopened=true&page=1&limit=1')
      .set('Authorization', auth(fixtures.admin));
    const stats = await request(app).get('/api/tickets/stats')
      .set('Authorization', auth(fixtures.admin));

    assert.equal(list.status, 200);
    assert.equal(list.body.total, 1);
    assert.equal(list.body.items.length, 1);
    assert.equal(list.body.items[0].reopenCount, 2);
    assert.ok(list.body.items[0].reopenedAt);
    assert.equal(list.body.items[0].reopenedBy.name, fixtures.admin.name);
    assert.equal(stats.body.reopened, 1);
  });

  it('allows a client to reopen a closed ticket within the configured window', async () => {
    fixtures.ownTicket.ticketInfo.status = 'Closed';
    fixtures.ownTicket.resolvedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await fixtures.ownTicket.save();

    const response = await request(app).post(`/api/tickets/${fixtures.ownTicket._id}/reopen`)
      .set('Authorization', auth(fixtures.client))
      .send({ reason: 'The same issue returned' });

    assert.equal(response.status, 200);
    assert.equal(response.body.ticketInfo.status, 'Assigned');
  });

  it('rejects client reopen requests after the configured window', async () => {
    fixtures.ownTicket.ticketInfo.status = 'Closed';
    fixtures.ownTicket.resolvedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await fixtures.ownTicket.save();

    const response = await request(app).post(`/api/tickets/${fixtures.ownTicket._id}/reopen`)
      .set('Authorization', auth(fixtures.client))
      .send({ reason: 'The same issue returned' });

    assert.equal(response.status, 403);
  });

  it('does not allow technicians to reopen tickets', async () => {
    fixtures.ownTicket.ticketInfo.status = 'Closed';
    fixtures.ownTicket.resolvedAt = new Date();
    await fixtures.ownTicket.save();

    const response = await request(app).post(`/api/tickets/${fixtures.ownTicket._id}/reopen`)
      .set('Authorization', auth(fixtures.staff))
      .send({ reason: 'The same issue returned' });

    assert.equal(response.status, 403);
  });

  it('rejects reopening tickets that are not closed', async () => {
    const response = await request(app).post(`/api/tickets/${fixtures.ownTicket._id}/reopen`)
      .set('Authorization', auth(fixtures.admin))
      .send({ reason: 'The same issue returned' });

    assert.equal(response.status, 400);
  });

  it('does not allow cancelled tickets to be reopened', async () => {
    fixtures.ownTicket.ticketInfo.status = 'Cancelled';
    await fixtures.ownTicket.save();

    const response = await request(app).post(`/api/tickets/${fixtures.ownTicket._id}/reopen`)
      .set('Authorization', auth(fixtures.admin))
      .send({ reason: 'The ticket was cancelled' });

    assert.equal(response.status, 400);
  });

  it('does not allow generic status updates to bypass the reopen endpoint', async () => {
    fixtures.ownTicket.ticketInfo.status = 'Closed';
    fixtures.ownTicket.resolvedAt = new Date();
    await fixtures.ownTicket.save();

    const response = await request(app).patch(`/api/tickets/${fixtures.ownTicket._id}/status`)
      .set('Authorization', auth(fixtures.admin))
      .send({ status: 'Assigned', assignedTo: fixtures.staff.name });

    assert.equal(response.status, 400);
  });

  it('requires a reopen reason', async () => {
    fixtures.ownTicket.ticketInfo.status = 'Closed';
    fixtures.ownTicket.resolvedAt = new Date();
    await fixtures.ownTicket.save();

    const response = await request(app).post(`/api/tickets/${fixtures.ownTicket._id}/reopen`)
      .set('Authorization', auth(fixtures.admin))
      .send({});

    assert.equal(response.status, 400);
  });

  it('accepts feedback only once and only after closure', async () => {
    const token = auth(fixtures.client);
    const url = `/api/tickets/${fixtures.ownTicket._id}/feedback`;
    const body = { rating: 5, comment: 'Resolved well' };

    const tooEarly = await request(app).patch(url).set('Authorization', token).send(body);
    assert.equal(tooEarly.status, 400);

    await Ticket.updateOne({ _id: fixtures.ownTicket._id }, { $set: { 'ticketInfo.status': 'Closed' } });
    const accepted = await request(app).patch(url).set('Authorization', token).send(body);
    assert.equal(accepted.status, 200);
    const duplicate = await request(app).patch(url).set('Authorization', token).send(body);
    assert.equal(duplicate.status, 400);
  });

  it('limits message visibility to accessible tickets and hides internal notes from clients', async () => {
    await Message.create([
      { ticketId: fixtures.ownTicket._id, senderId: fixtures.staff._id, senderName: fixtures.staff.name, senderRole: 'it_staff', text: 'Visible reply' },
      { ticketId: fixtures.ownTicket._id, senderId: fixtures.staff._id, senderName: fixtures.staff.name, senderRole: 'it_staff', text: 'Internal note', isInternal: true },
    ]);
    const ownMessages = await request(app).get(`/api/tickets/${fixtures.ownTicket._id}/messages`)
      .set('Authorization', auth(fixtures.client));
    assert.equal(ownMessages.status, 200);
    assert.deepEqual(ownMessages.body.map((message) => message.text), ['Visible reply']);

    const foreignMessages = await request(app).get(`/api/tickets/${fixtures.otherTicket._id}/messages`)
      .set('Authorization', auth(fixtures.client));
    assert.equal(foreignMessages.status, 403);

    const internalPost = await request(app).post(`/api/tickets/${fixtures.ownTicket._id}/messages`)
      .set('Authorization', auth(fixtures.client))
      .send({ text: 'Client internal note', isInternal: true });
    assert.equal(internalPost.status, 403);
  });

  it('groups unread recent messages by ticket without returning message text', async () => {
    fixtures.ownTicket.ticketNumber = 'SY0005';
    await fixtures.ownTicket.save();
    await Message.create([
      { ticketId: fixtures.ownTicket._id, senderId: fixtures.staff._id, senderName: fixtures.staff.name, senderRole: 'it_staff', text: 'First unread message' },
      { ticketId: fixtures.ownTicket._id, senderId: fixtures.staff._id, senderName: fixtures.staff.name, senderRole: 'it_staff', text: 'Second unread message' },
      { ticketId: fixtures.ownTicket._id, senderId: fixtures.staff._id, senderName: fixtures.staff.name, senderRole: 'it_staff', text: 'Already read message', readBy: [fixtures.client._id] },
    ]);

    const response = await request(app).get('/api/tickets/messages/recent')
      .set('Authorization', auth(fixtures.client));

    assert.equal(response.status, 200);
    assert.equal(response.body.length, 1);
    assert.equal(String(response.body[0].ticketId), String(fixtures.ownTicket._id));
    assert.equal(response.body[0].ticketNumber, 'SY0005');
    assert.equal(response.body[0].companyName, fixtures.company.companyName);
    assert.equal(response.body[0].unreadCount, 2);
    assert.ok(response.body[0].createdAt);
    assert.equal(response.body[0].text, undefined);
  });

  it('allows clients to read messages on closed tickets', async () => {
    await Ticket.updateOne({ _id: fixtures.ownTicket._id }, { $set: { 'ticketInfo.status': 'Closed' } });
    await Message.create({
      ticketId: fixtures.ownTicket._id,
      senderId: fixtures.staff._id,
      senderName: fixtures.staff.name,
      senderRole: 'it_staff',
      text: 'Resolution details',
    });

    const response = await request(app).get(`/api/tickets/${fixtures.ownTicket._id}/messages`)
      .set('Authorization', auth(fixtures.client));

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.map((message) => message.text), ['Resolution details']);
  });

  it('creates two assets without CRM IDs', async () => {
    const token = auth(fixtures.admin);
    const first = await request(app).post('/api/assets')
      .set('Authorization', token)
      .send({
        crmId: '',
        assetName: 'Laptop One',
        serialNumber: 'SERIAL-001',
        companyId: String(fixtures.company._id),
      });
    const second = await request(app).post('/api/assets')
      .set('Authorization', token)
      .send({
        crmId: '',
        assetName: 'Laptop Two',
        serialNumber: 'SERIAL-002',
        companyId: String(fixtures.company._id),
      });

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(first.body.crmId, undefined);
    assert.equal(second.body.crmId, undefined);
  });

  it('skips auto-replies and classifies email issues by keywords', async () => {
    const autoReply = {
      from: { value: [{ address: fixtures.client.email, name: fixtures.client.name }] },
      subject: 'Automatic reply: received',
      text: 'I am out of office.',
    };
    assert.equal(looksLikeAutoReply(autoReply), true);
    assert.equal(await createTicketFromEmail(autoReply), null);

    assert.equal(looksLikeGenuineIssue('VPN error', 'The service is not working.'), true);
    assert.equal(looksLikeGenuineIssue('Weekly newsletter', 'Click here for a limited time offer'), false);
    assert.equal(looksLikeGenuineIssue('Hello', 'Just checking in'), false);

    const ticket = await createTicketFromEmail({
      from: { value: [{ address: fixtures.client.email, name: fixtures.client.name }] },
      subject: 'VPN outage',
      text: 'The service is down.',
      messageId: '<email-1@service.test>',
    });
    assert.ok(ticket);
    assert.equal(ticket.source, 'email');
    assert.equal(ticket.sourceMessageId, '<email-1@service.test>');
    assert.equal(ticket.ticketInfo.status, 'Un-Assigned');
    assert.equal(ticket.ticketInfo.priority, 'Critical');
    assert.equal(ticket.ticketInfo.callType, 'Network');
    assert.equal(await createTicketFromEmail({
      from: { value: [{ address: fixtures.client.email, name: fixtures.client.name }] },
      subject: 'VPN outage',
      text: 'The service is down.',
      messageId: '<email-1@service.test>',
    }), null);
    assert.equal(await Ticket.countDocuments({ sourceMessageId: '<email-1@service.test>' }), 1);
  });

  it('stores an ingested email body only in the ticket description', async () => {
    const emailBody = 'The service is down.';
    const ticket = await createTicketFromEmail({
      from: { value: [{ address: fixtures.client.email, name: fixtures.client.name }] },
      subject: 'VPN outage',
      text: emailBody,
      messageId: '<email-description@service.test>',
    });

    assert.ok(ticket);
    assert.equal(ticket.description, emailBody);
    assert.equal(ticket.productInfo.productDescription, '');
  });

  it('exports status, closed-ticket resolution, and technician analytics for the date range', async () => {
    const startDate = new Date().toISOString().slice(0, 10);
    const utcDayStart = new Date(`${startDate}T00:00:00.000Z`).getTime();
    await Ticket.create([
      {
        ticketInfo: { priority: 'Critical', status: 'Closed', issueReported: 'First issue' },
        assignment: { assignedTo: fixtures.staff.name },
        feedback: { rating: 4 },
        createdAt: new Date(utcDayStart + 60 * 60 * 1000),
        resolvedAt: new Date(utcDayStart + 2 * 60 * 60 * 1000),
      },
      {
        ticketInfo: { priority: 'Critical', status: 'Closed', issueReported: 'Second issue' },
        assignment: { assignedTo: fixtures.staff.name },
        feedback: { rating: 5 },
        createdAt: new Date(utcDayStart + 3 * 60 * 60 * 1000),
        resolvedAt: new Date(utcDayStart + 5 * 60 * 60 * 1000),
      },
    ]);

    const response = await request(app)
      .get(`/api/reports/tickets/export?startDate=${startDate}&endDate=${startDate}`)
      .set('Authorization', auth(fixtures.admin))
      .buffer(true)
      .parse((stream, callback) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    assert.equal(response.status, 200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body);
    const analyticsRows = workbook.getWorksheet('Analytics').getSheetValues();
    assert.ok(analyticsRows.some((row) => row?.[1] === 'Ticket Count by Status'));
    assert.ok(analyticsRows.some((row) => row?.[1] === 'Closed' && row?.[2] === 2));
    assert.ok(analyticsRows.some((row) => row?.[1] === 'Critical' && row?.[2] === 2 && row?.[3] === 1.5));
    assert.ok(analyticsRows.some((row) => row?.[1] === fixtures.staff.name && row?.[2] === 2 && row?.[3] === 4.5));
  });

  it('uses keyword classification when the Claude API returns a failure', async () => {
    const originalFetch = global.fetch;
    const originalApiKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'integration-test-api-key';
    global.fetch = async () => ({ ok: false, status: 503, text: async () => 'temporarily unavailable' });

    try {
      const ignored = await createTicketFromEmail({
        from: { value: [{ address: fixtures.client.email, name: fixtures.client.name }] },
        subject: 'Team lunch menu',
        text: 'Here are the options for Friday.',
        messageId: '<claude-failure-nonissue@service.test>',
      });
      assert.equal(ignored, null);

      const ticket = await createTicketFromEmail({
        from: { value: [{ address: fixtures.client.email, name: fixtures.client.name }] },
        subject: 'VPN outage',
        text: 'The network is not working and the service is down.',
        messageId: '<claude-failure-issue@service.test>',
      });
      assert.ok(ticket);
      assert.equal(ticket.ticketInfo.callType, 'Network');
      assert.equal(ticket.ticketInfo.priority, 'Critical');
    } finally {
      global.fetch = originalFetch;
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    }
  });

  it('routes public and unknown domains to one inactive company without creating users', async () => {
    const existingUserCount = await User.countDocuments();
    const senders = ['public.sender@gmail.com', 'external@unmapped.example'];

    for (const [index, email] of senders.entries()) {
      const ticket = await createTicketFromEmail({
        from: { value: [{ address: email, name: `Sender ${index}` }] },
        subject: 'VPN issue',
        text: 'The VPN connection has an error.',
        messageId: `<unverified-${index}@service.test>`,
      });
      assert.ok(ticket);
      assert.equal(ticket.companyInfo.companyName, 'Unverified Senders');
      assert.equal(ticket.requester, null);
      assert.equal(ticket.userInfo.userEmail, email);
    }

    const unverifiedCompany = await Company.findOne({ companyName: 'Unverified Senders' });
    assert.equal(unverifiedCompany.status, 'Inactive');
    assert.equal(await Company.countDocuments({ companyName: 'Unverified Senders' }), 1);
    assert.equal(await User.countDocuments(), existingUserCount);
  });

  it('matches corporate sender domains and does not use a company contact to select another client', async () => {
    const company = await Company.create({
      companyName: 'Mapped Corporation',
      emailDomains: ['Mapped.Example'],
    });
    const unrelatedClient = await User.create({
      name: 'Existing Employee',
      email: 'existing@mapped.example',
      passwordHash: 'test-password-hash',
      role: 'client',
      companyId: company._id,
    });
    await CompanyContact.create({
      companyId: company._id,
      name: 'Email Contact',
      email: 'new.sender@mapped.example',
    });

    const ticket = await createTicketFromEmail({
      from: { value: [{ address: 'new.sender@mapped.example', name: 'New Sender' }] },
      subject: 'Laptop error',
      text: 'The laptop has a problem.',
      messageId: '<mapped-domain@service.test>',
    });

    assert.ok(ticket);
    assert.equal(String(ticket.companyInfo.companyId), String(company._id));
    const requester = await User.findById(ticket.requester);
    assert.equal(requester.email, 'new.sender@mapped.example');
    assert.notEqual(String(ticket.requester), String(unrelatedClient._id));
  });

  it('uploads only allowed email attachments and stores Cloudinary URLs', async () => {
    const originalUploadStream = cloudinary.uploader.upload_stream;
    const uploadOptions = [];
    cloudinary.uploader.upload_stream = (options, callback) => {
      uploadOptions.push(options);
      const stream = new PassThrough();
      stream.resume();
      stream.on('end', () => callback(null, { secure_url: `https://cloudinary.test/${options.filename_override}` }));
      return stream;
    };

    try {
      const ticket = await createTicketFromEmail({
        from: { value: [{ address: fixtures.client.email, name: fixtures.client.name }] },
        subject: 'VPN issue with attachment',
        text: 'The connection has an error.',
        attachments: [
          { filename: 'details.pdf', contentType: 'application/pdf', content: Buffer.from('pdf'), size: 3 },
          { filename: 'archive.zip', contentType: 'application/zip', content: Buffer.from('zip'), size: 3 },
          { filename: 'large.txt', contentType: 'text/plain', content: Buffer.from('x'), size: 10 * 1024 * 1024 + 1 },
        ],
      });

      assert.equal(ticket.attachments.length, 1);
      assert.equal(ticket.attachments[0].filename, 'details.pdf');
      assert.equal(ticket.attachments[0].url, 'https://cloudinary.test/details.pdf');
      assert.ok(ticket.attachments[0].uploadedAt instanceof Date);
      assert.deepEqual(uploadOptions, [{
        folder: 'synov-tickets',
        resource_type: 'auto',
        filename_override: 'details.pdf',
      }]);
    } finally {
      cloudinary.uploader.upload_stream = originalUploadStream;
    }
  });

  it('threads email replies to the matching ticket using the resolved client sender', async () => {
    fixtures.ownTicket.ticketNumber = 'SY123';
    await fixtures.ownTicket.save();

    const reply = {
      from: { value: [{ address: fixtures.client.email, name: fixtures.client.name }] },
      subject: 'Re: SY123 VPN update',
      text: 'The issue is still failing.',
      messageId: '<reply-1@service.test>',
    };
    assert.equal(await createTicketFromEmail(reply), null);

    const message = await Message.findOne({ sourceMessageId: reply.messageId });
    assert.ok(message);
    assert.equal(String(message.ticketId), String(fixtures.ownTicket._id));
    assert.equal(String(message.senderId), String(fixtures.client._id));
    assert.equal(message.senderRole, 'client');
    assert.equal(message.text, reply.text);
    assert.equal(await createTicketFromEmail(reply), null);
    assert.equal(await Message.countDocuments({ sourceMessageId: reply.messageId }), 1);
  });

  it('skips overlapping inbox polls', async () => {
    const originalConnect = Imap.connect;
    let resolveConnection;
    let connectionCount = 0;
    Imap.connect = () => {
      connectionCount += 1;
      return new Promise((resolve) => { resolveConnection = resolve; });
    };
    const connection = {
      openBox: async () => {},
      search: async () => [],
      closeBox: async () => {},
      end: () => {},
    };

    try {
      const runningPoll = pollInbox();
      assert.equal(connectionCount, 1);
      await pollInbox();
      assert.equal(connectionCount, 1);
      resolveConnection(connection);
      await runningPoll;
    } finally {
      Imap.connect = originalConnect;
    }
  });

  it('caps processing retries at three and keeps retrying only the Seen flag afterward', async () => {
    const originalConnect = Imap.connect;
    const originalTicketCreate = Ticket.create;
    const seenUids = [];
    let flagAttempts = 0;
    let ticketCreateAttempts = 0;
    const uid = 918273;
    const rawEmail = [
      `From: ${fixtures.client.email}`,
      'To: support@example.test',
      'Subject: VPN outage',
      'Message-ID: <poll-retry@service.test>',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'The VPN is down.',
    ].join('\r\n');
    const connection = {
      openBox: async () => {},
      search: async () => [{
        attributes: { uid },
        parts: [{ which: '', body: Buffer.from(rawEmail) }],
      }],
      addFlags: async (flaggedUid, flags) => {
        flagAttempts += 1;
        if (flagAttempts === 1) throw new Error('simulated IMAP flag failure');
        seenUids.push({ uid: flaggedUid, flags });
      },
      closeBox: async () => {},
      end: () => {},
    };
    Imap.connect = async () => connection;
    Ticket.create = async () => {
      ticketCreateAttempts += 1;
      throw new Error('simulated database failure');
    };

    try {
      await pollInbox();
      assert.equal(seenUids.length, 0);
      await pollInbox();
      assert.equal(seenUids.length, 0);
      await pollInbox();
      assert.equal(seenUids.length, 0);
      assert.equal(ticketCreateAttempts, 3);
      await pollInbox();
      assert.deepEqual(seenUids, [{ uid, flags: ['\\Seen'] }]);
      assert.equal(ticketCreateAttempts, 3);
    } finally {
      Imap.connect = originalConnect;
      Ticket.create = originalTicketCreate;
    }
  });
});