const mongoose = require('mongoose');

const companyContactSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  name: { type: String, required: true },
  department: String,
  email: String,
  phone: String,
  address: String,
}, { timestamps: true });

module.exports = mongoose.model('CompanyContact', companyContactSchema);