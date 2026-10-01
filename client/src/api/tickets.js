import axiosClient from "./axiosClient";

export async function fetchTickets(params = {}) {
  const { data } = await axiosClient.get("/tickets", { params });
  return data;
}

export async function fetchAllTickets(params = {}) {
  const limit = 100;
  const firstPage = await fetchTickets({ ...params, page: 1, limit });
  const tickets = [...firstPage.items];
  for (let page = 2; page <= firstPage.pages; page += 1) {
    const result = await fetchTickets({ ...params, page, limit });
    tickets.push(...result.items);
  }
  return tickets;
}

export async function fetchTicketStats(params = {}) {
  const { data } = await axiosClient.get("/tickets/stats", { params });
  return data;
}

export async function fetchTicketById(id) {
  const { data } = await axiosClient.get(`/tickets/${id}`);
  return data;
}

export async function fetchTicketActivity(ticketId) {
  const { data } = await axiosClient.get(`/tickets/${ticketId}/activity`);
  return data;
}

export async function exportTicketExcel(ticketId) {
  const response = await axiosClient.get(`/tickets/${ticketId}/export`, {
    responseType: "blob",
  });

  const blob = new Blob([response.data], {
    type: response.headers["content-type"] || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ticket-${ticketId}.xlsx`;

  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);

  return `ticket-${ticketId}.xlsx`;
}

export async function exportCompanyTickets(companyId) {
  const response = await axiosClient.get(`/companies/${companyId}/tickets/export`, {
    responseType: "blob",
  });

  const blob = new Blob([response.data], {
    type: response.headers["content-type"] || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const disposition = response.headers["content-disposition"] || "";
  const match = disposition.match(/filename\s*=\s*"?([^";]+)"?/i) || disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const defaultName = match ? decodeURIComponent(match[1]) : `company-${companyId}-tickets-report.xlsx`;

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = defaultName;

  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);

  return defaultName;
}

export async function updateTicketStatus(id, updates) {
  const { data } = await axiosClient.patch(`/tickets/${id}/status`, updates);
  return data;
}

export async function reopenTicket(id, reason) {
  const { data } = await axiosClient.post(`/tickets/${id}/reopen`, { reason });
  return data;
}

export async function createTicket(ticketData) {
  if (ticketData instanceof FormData) {
    const { data } = await axiosClient.post("/tickets", ticketData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  }

  const { data } = await axiosClient.post("/tickets", ticketData);
  return data;
}

export async function addTicketAttachment(ticketId, files) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));

  const { data } = await axiosClient.post(`/tickets/${ticketId}/attachments`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return data;
}

export async function submitFeedback(id, feedback) {
  const { data } = await axiosClient.patch(`/tickets/${id}/feedback`, feedback);
  return data;
}

export async function fetchMessages(ticketId) {
  const { data } = await axiosClient.get(`/tickets/${ticketId}/messages`);
  return data;
}

export async function markMessagesRead(ticketId) {
  const { data } = await axiosClient.post(`/tickets/${ticketId}/messages/read`);
  return data;
}

export async function fetchRecentMessages() {
  const { data } = await axiosClient.get("/tickets/messages/recent");
  return data;
}

export async function sendMessage(ticketId, text, isInternal = false) {
  const { data } = await axiosClient.post(`/tickets/${ticketId}/messages`, { text, isInternal });
  return data;
}