import axiosClient from "./axiosClient";

export async function fetchTechnicians({ assignable = false } = {}) {
  const { data } = await axiosClient.get("/technicians", {
    params: assignable ? { assignable: true } : undefined,
  });
  return data;
}

export async function fetchStaff() {
  const { data } = await axiosClient.get("/staff");
  return data;
}

export async function createStaff(payload) {
  const { data } = await axiosClient.post("/staff", payload);
  return data;
}

export async function updateStaff(id, payload) {
  const { data } = await axiosClient.patch(`/staff/${id}`, payload);
  return data;
}

export async function deactivateStaff(id) {
  const { data } = await axiosClient.delete(`/staff/${id}`);
  return data;
}