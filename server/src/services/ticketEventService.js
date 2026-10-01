const User = require('../models/User');
const Message = require('../models/Message');
const { publishToUsers } = require('./eventStream');

async function publishTicketEvent(ticket, type, data, { includeCompanyClients = true } = {}) {
  const recipientIds = [];
  const companyId = ticket.companyInfo?.companyId;

  if (includeCompanyClients && companyId) {
    const clients = await User.find({
      role: 'client',
      companyId,
      active: { $ne: false },
    }).select('_id').lean();
    recipientIds.push(...clients.map((user) => user._id));
  }

  const assignment = ticket.assignment || {};
  if (assignment.assignedToId) {
    recipientIds.push(assignment.assignedToId);
  } else if (assignment.assignedTo) {
    const technician = await User.findOne({
      name: assignment.assignedTo,
      role: { $in: ['it_staff', 'admin'] },
      active: { $ne: false },
    }).select('_id').lean();
    if (technician) recipientIds.push(technician._id);
  }

  const participatingAdmins = await Message.distinct('senderId', {
    ticketId: ticket._id,
    senderRole: 'admin',
  });
  recipientIds.push(...participatingAdmins);

  publishToUsers(recipientIds, type, {
    ...data,
    ticketId: String(ticket._id),
  });
}

module.exports = { publishTicketEvent };