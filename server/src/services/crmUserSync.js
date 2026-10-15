const bcrypt = require('bcryptjs');
const Company = require('../models/Company');
const User = require('../models/User');
const emailService = require('./emailService');
const logger = require('../utils/logger');
const { generatePassword } = require('../utils/generatePassword');

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function crmCustomerId(customer) {
  return nonEmptyString(customer?._id) || nonEmptyString(customer?.customerId);
}

function contactAddress(address) {
  if (typeof address === 'string') return nonEmptyString(address);
  if (!address || typeof address !== 'object') return undefined;

  return nonEmptyString([
    address.addressLine1,
    address.area,
    address.city,
    address.state,
    address.pincode,
    address.country,
  ].filter(nonEmptyString).join(', '));
}

function getContact(customer) {
  const contacts = Array.isArray(customer.contacts) ? customer.contacts : [];
  const contactWithEmail = contacts.find((contact) => nonEmptyString(contact?.email));
  return contactWithEmail || contacts[0] || {};
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function contactCrmId(contact) {
  return nonEmptyString(contact.crmId)
    || nonEmptyString(contact.contactId)
    || nonEmptyString(contact._id)
    || nonEmptyString(contact.id);
}

async function findUserByEmail(email) {
  const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return User.findOne({ email: new RegExp(`^${escapedEmail}$`, 'i') });
}

function sendProvisionedEmail(user, plainPassword) {
  void Promise.resolve()
    .then(() => emailService.clientUserProvisionedEmail(user, plainPassword))
    .catch((error) => {
      logger.error({ userId: String(user._id), errorName: error?.name || 'Error' }, 'CRM user provisioning email failed');
    });
}

async function createContactUser(customer, company, contact) {
  const email = nonEmptyString(contact.email) || nonEmptyString(customer.email);
  if (!email || !validEmail(email)) return { user: null, created: false };

  const name = nonEmptyString(contact.name) || nonEmptyString(customer.customerName);
  if (!name) {
    logger.warn(
      { crmId: crmCustomerId(customer) },
      'CRM contact has an email but no name; skipping user creation',
    );
    return { user: null, created: false };
  }

  const normalizedEmail = email.toLowerCase();
  const existingUser = await findUserByEmail(normalizedEmail);
  if (existingUser) return { user: existingUser, created: false };

  const plainPassword = generatePassword(12);
  const payload = {
    name,
    email: normalizedEmail,
    companyId: company._id,
    department: nonEmptyString(contact.designation),
    phone: nonEmptyString(contact.phone) || nonEmptyString(customer.phone),
    address: company.address,
    role: 'client',
    passwordHash: await bcrypt.hash(plainPassword, 10),
    mustChangePassword: true,
  };
  const crmId = contactCrmId(contact);
  if (crmId && !(await User.exists({ crmId }))) payload.crmId = crmId;

  let user;
  try {
    user = await User.create(payload);
  } catch (error) {
    if (error?.code !== 11000) throw error;

    const matchingUser = await findUserByEmail(normalizedEmail);
    if (matchingUser) return { user: matchingUser, created: false };

    if (!payload.crmId) throw error;
    delete payload.crmId;
    user = await User.create(payload);
  }

  sendProvisionedEmail(user, plainPassword);
  return { user, created: true };
}

async function syncCrmCustomer(customer) {
  const crmId = crmCustomerId(customer);
  const companyName = nonEmptyString(customer.companyName) || nonEmptyString(customer.customerName);
  if (!crmId) throw new Error('CRM customer is missing its _id');
  if (!companyName) throw new Error(`CRM customer ${crmId} is missing companyName`);

  const contact = getContact(customer);
  const companyFields = {
    companyName,
    contactPerson: nonEmptyString(contact.name) || nonEmptyString(customer.customerName),
    contactEmail: nonEmptyString(contact.email) || nonEmptyString(customer.email),
    contactNumber: nonEmptyString(contact.phone) || nonEmptyString(customer.phone),
    department: nonEmptyString(contact.designation),
    location: nonEmptyString(customer.state) || nonEmptyString(customer.billToAddress?.state),
    address: contactAddress(customer.billToAddress),
  };
  Object.keys(companyFields).forEach((key) => {
    if (companyFields[key] === undefined) delete companyFields[key];
  });

  const company = await Company.findOneAndUpdate(
    { crmId },
    { $set: companyFields, $setOnInsert: { crmId } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
  );

  try {
    const result = await createContactUser(customer, company, contact);
    return { company, ...result };
  } catch (error) {
    error.localCompanyId = String(company._id);
    throw error;
  }
}

module.exports = { crmCustomerId, syncCrmCustomer };
