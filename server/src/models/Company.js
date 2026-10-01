const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  crmId: { type: String, unique: true, sparse: true }, // links this record to its CRM source
  companyName: { type: String, required: true },
  emailDomains: [{ type: String, lowercase: true, trim: true }],
  department: String,
  contactPerson: String,
  contactEmail: String,
  contactNumber: String,
  address: String,
  location: String,
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
}, { timestamps: true });

companySchema.index({ emailDomains: 1 });

module.exports = mongoose.model('Company', companySchema);