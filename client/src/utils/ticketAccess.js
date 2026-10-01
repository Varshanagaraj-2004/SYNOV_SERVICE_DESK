// Central place for "which tickets can this logged-in user see."
// Used by Dashboard (notifications + My Tickets) and TicketList,
// so the scoping rule is defined once instead of duplicated per page.

export function getVisibleTickets(allTickets, { role, technicianName, userId, companyName }) {
  if (role === "admin") {
    return allTickets;
  }
  if (role === "it_staff") {
    return allTickets.filter((ticket) => (
      ticket.assignment?.assignedToId && userId
        ? String(ticket.assignment.assignedToId) === String(userId)
        : ticket.assignment?.assignedTo === technicianName
    ));
  }
  if (role === "client") {
    return allTickets.filter((t) => t.companyInfo.companyName === companyName);
  }
  return []; // not logged in yet
}