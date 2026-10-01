const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createHash, randomBytes } = require('node:crypto');
const Company = require('../models/Company');
const User = require('../models/User');
const { passwordResetEmail } = require('../services/emailService');

function signUserToken(user) {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      companyId: user.companyId || null,
      name: user.name,
      designation: user.designation || null,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await User.findOne({
    email: email.toLowerCase(),
    active: { $ne: false },
    unverified: { $ne: true },
  });
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signUserToken(user);

  const companyName = user.companyId ? (await Company.findById(user.companyId))?.companyName || null : null;

  res.json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isCompanyAdmin: user.isCompanyAdmin === true,
      mustChangePassword: Boolean(user.mustChangePassword),
      companyId: user.companyId || null,
      companyName,
      designation: user.designation || null,
    },
  });
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new passwords are required' });
  }
  if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    return res.status(400).json({ error: 'New password must be at least 8 characters and include a letter and a number' });
  }

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) return res.status(401).json({ error: 'Current password is incorrect' });
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    return res.status(400).json({ error: 'New password must be different from the current password' });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.passwordChangedAt = new Date();
  user.mustChangePassword = false;
  await user.save();
  const token = signUserToken(user);
  res.json({ token, message: 'Password changed successfully', mustChangePassword: false });
}

async function forgotPassword(req, res) {
  const user = await User.findOne({
    email: req.body.email.toLowerCase(),
    active: { $ne: false },
    unverified: { $ne: true },
  });
  if (user) {
    const token = randomBytes(32).toString('hex');
    user.passwordResetTokenHash = createHash('sha256').update(token).digest('hex');
    user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();

    const frontendUrl = (process.env.FRONTEND_URL || '')
      .split(',')[0]
      .trim()
      .replace(/\/+$/, '');
    const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    void passwordResetEmail(user, resetUrl);
  }

  return res.status(200).json({
    message: 'If an account with that email exists, a password reset link has been sent.',
  });
}

async function resetPassword(req, res) {
  const tokenHash = createHash('sha256').update(req.body.token).digest('hex');
  const passwordHash = await bcrypt.hash(req.body.newPassword, 10);
  const now = new Date();
  const user = await User.findOneAndUpdate({
    passwordResetTokenHash: tokenHash,
    passwordResetExpiresAt: { $gt: now },
    unverified: { $ne: true },
  }, {
    $set: {
      passwordHash,
      passwordChangedAt: now,
      mustChangePassword: false,
    },
    $unset: {
      passwordResetTokenHash: 1,
      passwordResetExpiresAt: 1,
    },
  }, { new: true, runValidators: true });

  if (!user) {
    return res.status(400).json({ error: 'This password reset link is invalid or has expired.' });
  }

  return res.json({ message: 'Password reset successfully.' });
}

function createSseToken(req, res) {
  const token = jwt.sign(
    { id: req.user.id, purpose: 'sse' },
    process.env.JWT_SECRET,
    { expiresIn: '60s' }
  );
  return res.json({ token, expiresIn: 60 });
}

module.exports = { login, changePassword, forgotPassword, resetPassword, createSseToken };
