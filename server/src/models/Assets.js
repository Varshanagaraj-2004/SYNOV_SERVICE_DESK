const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema({
  crmId: { type: String, unique: true, sparse: true }, // links this record to its CRM source
  assetName: { type: String, required: true },
  type: String,
  configuration: String,
  model: String,
  serialNumber: { type: String, required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  company: String, // denormalized copy for fast list rendering, matches dummyAssets.js
  assignedTo: String,
  location: String,
  purchaseDate: Date,
  warrantyExpiry: Date,
  status: {
    type: String,
    enum: ['In Use', 'In Storage', 'Under Repair', 'Retired'],
    default: 'In Use',
  },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

assetSchema.index({ companyId: 1, serialNumber: 1 }, { unique: true });
assetSchema.virtual('warrantyStatus').get(function getWarrantyStatus() {
  if (!this.warrantyExpiry) return 'Unknown';
  return this.warrantyExpiry >= new Date() ? 'Active' : 'Expired';
});

module.exports = mongoose.model('Asset', assetSchema);