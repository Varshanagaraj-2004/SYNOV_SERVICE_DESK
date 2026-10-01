import axiosClient from "./axiosClient";

export async function createClientUser(payload) {
  const { data } = await axiosClient.post("/users", payload);
  return data;
}

export async function updateClientUser(id, payload) {
  const { data } = await axiosClient.patch(`/users/${id}`, payload);
  return data;
}

export async function verifyClientUser(id) {
  const { data } = await axiosClient.patch(`/users/${id}/verify`);
  return data;
}

export async function deleteClientUser(id) {
  const { data } = await axiosClient.delete(`/users/${id}`);
  return data;
}
