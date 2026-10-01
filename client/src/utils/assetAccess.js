// Central place for "which assets can this logged-in user see" —
// same pattern as ticketAccess.js, kept separate since the scoping
// field is different (company, not assignedTo/companyName on a ticket).

export function getVisibleAssets(allAssets, { role, companyId }) {
  if (role === "admin" || role === "it_staff") {
    return allAssets; // IT staff need to look up any client's asset
  }
  if (role === "client") {
    return allAssets.filter((a) => String(a.companyId) === String(companyId));
  }
  return []; // not logged in yet
}