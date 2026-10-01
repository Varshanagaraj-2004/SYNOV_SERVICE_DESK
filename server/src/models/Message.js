const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  ticketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
    required: true,
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  senderName: { type: String, required: true },
  senderRole: { type: String, required: true },
  text: { type: String, required: true, trim: true },
  sourceMessageId: { type: String, unique: true, sparse: true },
  isInternal: { type: Boolean, default: false },
  attachments: [{ filename: String, url: String, uploadedAt: Date }],
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

messageSchema.index({ ticketId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);