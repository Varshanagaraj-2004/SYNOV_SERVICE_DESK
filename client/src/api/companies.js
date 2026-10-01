import axiosClient from "./axiosClient";

export async function fetchCompanies(params = {}) {
  const { data } = await axiosClient.get("/companies", { params });
  return data;
}

export async function fetchAllCompanies() {
  const limit = 100;
  const firstPage = await fetchCompanies({ page: 1, limit });
  const companies = [...firstPage.items];
  for (let page = 2; page <= firstPage.pages; page += 1) {
    const result = await fetchCompanies({ page, limit });
    companies.push(...result.items);
  }
  return companies;
}

export async function fetchCompanyById(companyId) {
  const { data } = await axiosClient.get(`/companies/${companyId}`);
  return data;
}

export async function fetchCompanyTickets(companyId, params = {}) {
  const { data } = await axiosClient.get(`/companies/${companyId}/tickets`, { params });
  return data;
}