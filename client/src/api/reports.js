import axiosClient from "./axiosClient";

export async function downloadTicketsReport({ startDate, endDate, technician }) {
  const params = { startDate, endDate };
  if (technician) params.technician = technician;

  const response = await axiosClient.get("/reports/tickets/export", {
    params,
    responseType: "blob",
  });

  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;

  const disposition = response.headers["content-disposition"] || "";
  const match = disposition.match(/filename="(.+)"/);
  link.download = match ? match[1] : "tickets-report.xlsx";

  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function fetchTopCompanies({ month, year }) {
  const params = {};
  if (month) params.month = month;
  if (year) params.year = year;

  const { data } = await axiosClient.get("/reports/top-companies", { params });
  return data;
}
