const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  passwordChangedAt: Date,
  passwordResetTokenHash: { type: String, select: false },
  passwordResetExpiresAt: { type: Date, select: false },
  active: { type: Boolean, default: true },
  isCompanyAdmin: { type: Boolean, default: false },
  mustChangePassword: { type: Boolean, default: false },
  crmId: { type: String, unique: true, sparse: true },
  role: { type: String, enum: ['client', 'it_staff', 'admin'], required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }, // only for role='client'
  designation: String, // only meaningful for role='it_staff' (e.g. "Network Engineer")
  department: String,
  phone: String,
  address: String,
  unverified: { type: Boolean, default: false },
}, { timestamps: true });

userSchema.index({ companyId: 1, role: 1 });

module.exports = mongoose.model('User', userSchema);