import axiosClient from "./axiosClient";

export async function fetchCustomers(params = {}) {
  const { data } = await axiosClient.get("/crm/customers", { params });
  return data;
}