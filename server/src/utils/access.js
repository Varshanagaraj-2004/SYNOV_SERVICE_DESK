function canAccessTicket(user, ticket) {
  if (!user || !ticket) return false;
  if (user.role === 'admin') return true;

  if (user.role === 'client') {
    return Boolean(
      user.companyId
      && ticket.companyInfo?.companyId
      && String(ticket.companyInfo.companyId) === String(user.companyId)
    );
  }

  if (user.role === 'it_staff') {
    const assignedToId = ticket.assignment?.assignedToId;
    if (assignedToId) return Boolean(user.id && String(assignedToId) === String(user.id));
    return Boolean(user.name && ticket.assignment?.assignedTo === user.name);
  }

  return false;
}

function getAssignedTicketFilter(user) {
  return {
    $or: [
      { 'assignment.assignedToId': user.id },
      {
        'assignment.assignedToId': { $in: [null] },
        'assignment.assignedTo': user.name,
      },
    ],
  };
}

module.exports = { canAccessTicket, getAssignedTicketFilter };