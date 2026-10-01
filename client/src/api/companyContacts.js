import axiosClient from "./axiosClient";

export async function fetchCompanyContacts(companyId) {
  const { data } = await axiosClient.get("/company-contacts", {
    params: companyId ? { companyId } : {},
  });
  return data;
}

export async function createCompanyContact(data) {
  const { data: createdContact } = await axiosClient.post("/company-contacts", data);
  return createdContact;
}