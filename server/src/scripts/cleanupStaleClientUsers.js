require('dotenv').config();

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Company = require('../models/Company');
const CompanyContact = require('../models/CompanyContact');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');
const { generatePassword } = require('../utils/generatePassword');

const shouldApply = process.argv.includes('--yes');
const shouldCreateMissing = process.argv.includes('--create-missing');

function normalizedEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function isManuallyAddedByAdmin(user, adminIdentifiers) {
  const source = typeof user.source === 'string' ? user.source.trim().toLowerCase() : '';
  if (
    source === 'admin'
    || source === 'manual'
    || /^(admin[-_](manual|created)|manual[-_]admin)([-_].*)?$/.test(source)
  ) {
    return true;
  }

  const createdBy = user.createdBy;
  if (!createdBy) return false;
  if (typeof createdBy === 'string' && /^(admin|manual|admin[-_](manual|created))$/i.test(createdBy.trim())) {
    return true;
  }
  if (typeof createdBy === 'object') {
    if (String(createdBy.role || '').toLowerCase() === 'admin') return true;
    const identifiers = [createdBy._id, createdBy.id, createdBy.email, createdBy.name, createdBy]
      .filter(Boolean)
      .map((identifier) => String(identifier).trim().toLowerCase());
    return identifiers.some((identifier) => adminIdentifiers.has(identifier));
  }

  return adminIdentifiers.has(String(createdBy).trim().toLowerCase())
    || String(createdBy).trim().toLowerCase() === 'admin';
}

function contactDisplayName(contact, company, email) {
  return contact?.name?.trim()
    || company.contactPerson?.trim()
    || email.slice(0, email.indexOf('@'));
}

async function loadCompanyContacts() {
  const [companies, contacts] = await Promise.all([
    Company.find().select('_id companyName contactPerson contactEmail address').lean(),
    CompanyContact.find().select('companyId name email').lean(),
  ]);
  const companiesById = new Map(companies.map((company) => [String(company._id), company]));
  const contactsByCompany = new Map();

  function addContact(companyId, email, contact) {
    const normalized = normalizedEmail(email);
    if (!normalized || !companiesById.has(String(companyId))) return;
    const companyContacts = contactsByCompany.get(String(companyId)) || new Map();
    if (!companyContacts.has(normalized)) {
      companyContacts.set(normalized, {
        email: normalized,
        name: contact?.name || null,
      });
    }
    contactsByCompany.set(String(companyId), companyContacts);
  }

  for (const contact of contacts) addContact(contact.companyId, contact.email, contact);
  for (const company of companies) addContact(company._id, company.contactEmail, company);

  return { companiesById, contactsByCompany };
}

async function loadTicketCounts(users) {
  if (!users.length) return new Map();
  const counts = await Ticket.aggregate([
    { $match: { requester: { $in: users.map((user) => user._id) } } },
    { $group: { _id: '$requester', count: { $sum: 1 } } },
  ]);
  return new Map(counts.map((entry) => [String(entry._id), entry.count]));
}

async function main() {
  try {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Refusing to run stale client user cleanup in production.');
    }
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not configured.');

    await mongoose.connect(process.env.MONGO_URI);
    logger.info('Connected to MongoDB for stale client user cleanup');

    const { companiesById, contactsByCompany } = await loadCompanyContacts();
    const companyIds = [...contactsByCompany.keys()];
    const clientUsers = companyIds.length
      ? await User.find({ role: 'client', companyId: { $in: companyIds } })
        .select('_id name email companyId role source createdBy crmId active isActive createdAt lastLoginAt')
        .lean()
      : [];
    const admins = await User.find({ role: 'admin' }).select('_id email name').lean();
    const adminIdentifiers = new Set();
    for (const admin of admins) {
      for (const identifier of [admin._id, admin.email, admin.name]) {
        if (identifier) adminIdentifiers.add(String(identifier).trim().toLowerCase());
      }
    }

    const candidates = clientUsers.filter((user) => {
      const companyContacts = contactsByCompany.get(String(user.companyId));
      const email = normalizedEmail(user.email);
      return companyContacts
        && !companyContacts.has(email)
        && !isManuallyAddedByAdmin(user, adminIdentifiers);
    });
    const ticketCounts = await loadTicketCounts(candidates);

    logger.info('Stale client user candidates:');
    for (const user of candidates) {
      const company = companiesById.get(String(user.companyId));
      logger.info({
        name: user.name,
        email: user.email,
        company: company?.companyName || '(unknown)',
        createdAt: user.createdAt || null,
        lastLoginAt: user.lastLoginAt || null,
        ticketsRaised: ticketCounts.get(String(user._id)) || 0,
      }, 'Stale client user');
    }
    logger.info({ total: candidates.length }, 'Stale client user candidate total');

    const existingEmails = new Set(
      (await User.find().select('email').lean())
        .map((user) => normalizedEmail(user.email))
        .filter(Boolean),
    );
    const missingContacts = [];
    for (const [companyId, companyContacts] of contactsByCompany) {
      const company = companiesById.get(companyId);
      for (const contact of companyContacts.values()) {
        if (!existingEmails.has(contact.email)) {
          missingContacts.push({
            ...contact,
            name: contactDisplayName(contact, company, contact.email),
            companyId: company._id,
            companyName: company.companyName,
            address: company.address,
          });
        }
      }
    }

    logger.info('Current contact emails without a User account:');
    for (const contact of missingContacts) {
      logger.info({
        name: contact.name,
        email: contact.email,
        company: contact.companyName,
      }, 'Missing client user account');
    }
    logger.info({ total: missingContacts.length }, 'Missing client user account total');

    if (!shouldApply) {
      logger.info('Dry run complete; no database changes were made. Use --yes to apply cleanup.');
      return;
    }

    const hasActiveFlag = Boolean(User.schema.path('active') || User.schema.path('isActive'));
    const activeField = User.schema.path('active') ? 'active' : 'isActive';
    for (const user of candidates) {
      const ticketsRaised = ticketCounts.get(String(user._id)) || 0;
      if (hasActiveFlag) {
        await User.updateOne({ _id: user._id }, { $set: { [activeField]: false } });
        logger.info({
          userId: String(user._id),
          email: user.email,
          ticketsRaised,
        }, 'Deactivated stale client user');
      } else if (ticketsRaised > 0) {
        logger.warn({
          userId: String(user._id),
          email: user.email,
          ticketsRaised,
        }, 'Skipped stale client user because they raised tickets and no active flag exists');
      } else {
        await User.deleteOne({ _id: user._id });
        logger.info({ userId: String(user._id), email: user.email }, 'Deleted stale client user');
      }
    }

    if (shouldCreateMissing) {
      for (const contact of missingContacts) {
        const plainPassword = generatePassword(12);
        const user = await User.create({
          name: contact.name,
          email: contact.email,
          companyId: contact.companyId,
          address: contact.address,
          role: 'client',
          passwordHash: await bcrypt.hash(plainPassword, 10),
          mustChangePassword: true,
        });
        await emailService.clientUserProvisionedEmail(user, plainPassword);
        logger.info({
          userId: String(user._id),
          email: user.email,
          company: contact.companyName,
        }, 'Created missing client user and sent credentials email');
      }
    }
  } catch (error) {
    logger.error(error, 'Stale client user cleanup failed');
    process.exitCode = 1;
  } finally {
    try {
      await mongoose.disconnect();
      logger.info('Disconnected from MongoDB');
    } catch (error) {
      logger.error(error, 'Failed to disconnect from MongoDB');
      process.exitCode = 1;
    }
  }
}

main();
