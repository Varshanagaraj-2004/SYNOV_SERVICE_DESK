const bcrypt = require('bcryptjs');
const { createHash, randomBytes } = require('node:crypto');
const User = require('../models/User');
const { generatePassword } = require('../utils/generatePassword');
const { clientUserProvisionedEmail, passwordResetEmail, getFrontendUrl } = require('../services/emailService');

function canManageClientUsers(req, res) {
  if (req.user.role === 'admin' || (req.user.role === 'client' && req.user.isCompanyAdmin === true)) {
    return true;
  }
  res.status(403).json({ error: 'Only company administrators can manage company users' });
  return false;
}

async function createClientUser(req, res) {
  if (!canManageClientUsers(req, res)) return;
  const { name, email, companyId, department, phone, address } = req.body;
  const effectiveCompanyId = req.user.role === 'admin' ? companyId : req.user.companyId;

  if (!name || !email) {
    return res.status(400).json({ error: 'name and email are required' });
  }

  if (req.user.role === 'client' && (!phone || !String(phone).trim())) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  if (req.user.role === 'admin' && !effectiveCompanyId) {
    return res.status(400).json({ error: 'companyId is required' });
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }

  const plainPassword = generatePassword(12);
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    companyId: effectiveCompanyId,
    department,
    phone,
    address,
    role: 'client',
    passwordHash,
    mustChangePassword: true,
  });

  void clientUserProvisionedEmail(user, plainPassword);

  const created = user.toObject();
  delete created.passwordHash;
  res.status(201).json(created);
}

async function updateClientUser(req, res) {
  if (!canManageClientUsers(req, res)) return;
  const target = await User.findById(req.params.id);
  if (!target || target.role !== 'client' || target.active === false) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (req.user.role === 'client' && String(target.companyId) !== String(req.user.companyId)) {
    return res.status(403).json({ error: 'You can only edit users in your own company' });
  }

  const { name, email, department, phone, address, isCompanyAdmin } = req.body;
  if (isCompanyAdmin !== undefined && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only system administrators can change company-admin status' });
  }
  if (name !== undefined) target.name = name;
  if (email !== undefined) {
    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!trimmedEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (trimmedEmail !== target.email.toLowerCase()) {
      const existing = await User.findOne({ email: trimmedEmail, _id: { $ne: target._id } });
      if (existing) {
        return res.status(409).json({ error: 'A user with this email already exists' });
      }
    }
    target.email = trimmedEmail;
  }
  if (department !== undefined) target.department = department;
  if (phone !== undefined) target.phone = phone;
  if (address !== undefined) target.address = address;
  if (isCompanyAdmin !== undefined) target.isCompanyAdmin = isCompanyAdmin;

  await target.save();

  const updated = target.toObject();
  delete updated.passwordHash;
  res.json(updated);
}

async function deleteClientUser(req, res) {
  if (!canManageClientUsers(req, res)) return;
  const target = await User.findById(req.params.id);
  if (!target || target.role !== 'client' || target.active === false) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (req.user.role === 'client' && String(target.companyId) !== String(req.user.companyId)) {
    return res.status(403).json({ error: 'You can only delete users in your own company' });
  }

  if (String(target._id) === String(req.user.id)) {
    return res.status(400).json({ error: "You can't delete your own account" });
  }

  target.active = false;
  await target.save();
  res.json({ success: true });
}

async function verifyClientUser(req, res) {
  const target = await User.findOne({
    _id: req.params.id,
    role: 'client',
    active: { $ne: false },
    unverified: true,
  });
  if (!target) return res.status(404).json({ error: 'User not found' });

  const token = randomBytes(32).toString('hex');
  target.unverified = false;
  target.passwordResetTokenHash = createHash('sha256').update(token).digest('hex');
  target.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await target.save();

  const frontendUrl = getFrontendUrl(req);
  const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
  void passwordResetEmail(target, resetUrl);

  return res.json({ message: 'User verified and password reset email sent.' });
}

module.exports = { createClientUser, updateClientUser, deleteClientUser, verifyClientUser };
