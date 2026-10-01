const mongoose = require('mongoose');

const ticketActivitySchema = new mongoose.Schema({
  ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true, index: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorName: { type: String, required: true },
  actorRole: { type: String, required: true },
  type: {
    type: String,
    enum: ['created', 'status_changed', 'assigned', 'priority_changed', 'attachment_added', 'feedback', 'reopened'],
    required: true,
  },
  from: mongoose.Schema.Types.Mixed,
  to: mongoose.Schema.Types.Mixed,
  note: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('TicketActivity', ticketActivitySchema);