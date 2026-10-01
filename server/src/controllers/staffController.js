const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { generatePassword } = require('../utils/generatePassword');
const { clientUserProvisionedEmail } = require('../services/emailService');

async function getStaff(req, res) {
  const staff = await User.find({
    role: { $in: ['it_staff', 'admin'] },
    active: { $ne: false },
  })
    .select('_id name email designation role')
    .sort({ role: 1, name: 1 });
  res.json(staff);
}

async function createStaff(req, res) {
  const { name, email, designation, role } = req.body;
  const normalizedEmail = email.toLowerCase();
  if (await User.findOne({ email: normalizedEmail })) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }

  const plainPassword = generatePassword(12);
  const user = await User.create({
    name,
    email: normalizedEmail,
    designation,
    role,
    passwordHash: await bcrypt.hash(plainPassword, 10),
    mustChangePassword: true,
    active: true,
  });
  void clientUserProvisionedEmail(user, plainPassword);

  const created = user.toObject();
  delete created.passwordHash;
  res.status(201).json(created);
}

async function updateStaff(req, res) {
  const user = await User.findById(req.params.id);
  if (!user || user.active === false || !['it_staff', 'admin'].includes(user.role)) {
    return res.status(404).json({ error: 'Staff user not found' });
  }

  const { name, email, designation, role } = req.body;
  const nextRole = role || user.role;
  if (user.role === 'admin' && nextRole !== 'admin') {
    const activeAdminCount = await User.countDocuments({ role: 'admin', active: { $ne: false } });
    if (activeAdminCount <= 1) {
      return res.status(400).json({ error: 'The last active administrator cannot be demoted' });
    }
  }

  if (email !== undefined) {
    const normalizedEmail = email.toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
    if (existing) return res.status(409).json({ error: 'A user with this email already exists' });
    user.email = normalizedEmail;
  }
  if (name !== undefined) user.name = name;
  if (designation !== undefined) user.designation = designation;
  user.role = nextRole;
  await user.save();

  const updated = user.toObject();
  delete updated.passwordHash;
  res.json(updated);
}

async function deactivateStaff(req, res) {
  const user = await User.findById(req.params.id);
  if (!user || user.active === false || !['it_staff', 'admin'].includes(user.role)) {
    return res.status(404).json({ error: 'Staff user not found' });
  }

  if (user.role === 'admin') {
    const activeAdminCount = await User.countDocuments({ role: 'admin', active: { $ne: false } });
    if (activeAdminCount <= 1) {
      return res.status(400).json({ error: 'The last active administrator cannot be deactivated' });
    }
  }

  user.active = false;
  await user.save();
  res.json({ success: true });
}

module.exports = { getStaff, createStaff, updateStaff, deactivateStaff };