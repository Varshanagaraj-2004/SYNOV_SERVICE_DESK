const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  ticketInfo: {
    callLoggedDate: { type: Date, default: Date.now },
    callLoggedTime: String,
    priority: { type: String, enum: ['Critical', 'High', 'Medium', 'Low'], required: true },
    status: {
      type: String,
      enum: ['New', 'Un-Assigned', 'Assigned', 'Closed', 'Cancelled', 'Re-Assigned'],
      default: 'New',
    },
    callType: String,
    supportType: String,
    sbuType: String,
    issueReported: { type: String, required: true },
  },
  description: { type: String, default: '' },
  project: { type: String, default: '' },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  source: { type: String, default: 'web' },
  sourceMessageId: { type: String, unique: true, sparse: true },
  companyInfo: {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
    companyName: String,
    department: String,
    address: String,
    location: String,
    contactPerson: String,
    contactNumber: String,
    contactEmail: String,
  },
  userInfo: {
    userName: String,
    userNumber: String,
    userEmail: String,
    userAddress: String,
  },
  productInfo: {
    productName: String,
    productDescription: String,
    productModel: String,
    productSerialNumber: String,
    warrantyStatus: String,
  },
  assignment: {
    assignedBy: String,
    assignedTo: String,
    assignedToId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedOn: Date,
    assignStatus: String,
    actionTaken: String,
    accompaniedBy: String,
  },
  attachments: [{ filename: String, url: String, uploadedAt: Date }],
  ticketNumber: { type: String, unique: true, sparse: true },
  slaDueAt: { type: Date },
  slaWarningSent: { type: Boolean, default: false },
  slaBreachedSent: { type: Boolean, default: false },
  reopenCount: { type: Number, default: 0 },
  reopenedAt: Date,
  reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reopenReason: String,
  reopenHistory: [{
    reopenedAt: { type: Date, required: true },
    reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true },
    previousActionTaken: String,
    previousSupportType: String,
    previousClosedAt: Date,
  }],
  feedback: {
    rating: { type: Number, min: 1, max: 5 },
    comment: String,
    submittedAt: Date,
  },
  resolvedAt: { type: Date, default: null },
}, { timestamps: true });

ticketSchema.index({ 'companyInfo.companyId': 1, createdAt: -1 });
ticketSchema.index({ 'assignment.assignedTo': 1, createdAt: -1 });
ticketSchema.index({ 'ticketInfo.status': 1 });
ticketSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Ticket', ticketSchema);