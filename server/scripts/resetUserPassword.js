require('dotenv').config({ quiet: true });

process.env.LOG_LEVEL = 'silent';

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const emailService = require('../src/services/emailService');
const { generatePassword } = require('../src/utils/generatePassword');

async function resetUserPassword() {
  const emailArgument = process.argv[2];
  const email = typeof emailArgument === 'string' ? emailArgument.trim().toLowerCase() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Usage: npm run reset-password -- <email>');
  }
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not configured');

  await mongoose.connect(process.env.MONGO_URI);
  const user = await User.findOne({ email });
  if (!user) throw new Error('User not found');

  const frontendUrl = (process.env.FRONTEND_URL || '')
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');
  if (!frontendUrl) throw new Error('FRONTEND_URL is not configured');

  const temporaryPassword = generatePassword(12);
  user.passwordHash = await bcrypt.hash(temporaryPassword, 10);
  if (User.schema.path('mustChangePassword')) user.mustChangePassword = true;
  if (User.schema.path('passwordChangedAt')) user.passwordChangedAt = new Date();
  if (User.schema.path('passwordResetTokenHash')) user.passwordResetTokenHash = undefined;
  if (User.schema.path('passwordResetExpiresAt')) user.passwordResetExpiresAt = undefined;
  await user.save();

  const emailSent = await emailService.clientUserProvisionedEmail(
    user,
    temporaryPassword,
    `${frontendUrl}/login`,
    { quiet: true },
  );
  if (!emailSent) throw new Error('Could not send password reset email');
  return email;
}

async function main() {
  let output;
  let exitCode = 0;
  try {
    const email = await resetUserPassword();
    output = `Password reset and email sent to ${email}`;
  } catch (error) {
    const knownErrors = new Set([
      'Usage: npm run reset-password -- <email>',
      'MONGO_URI is not configured',
      'User not found',
      'FRONTEND_URL is not configured',
      'Could not send password reset email',
    ]);
    output = knownErrors.has(error.message)
      ? `Error: ${error.message}`
      : 'Error: password reset failed';
    exitCode = 1;
  } finally {
    try {
      await mongoose.disconnect();
    } catch {
      output = 'Error: could not disconnect from MongoDB';
      exitCode = 1;
    }
  }

  if (exitCode) console.error(output);
  else console.log(output);
  process.exitCode = exitCode;
}

main();
