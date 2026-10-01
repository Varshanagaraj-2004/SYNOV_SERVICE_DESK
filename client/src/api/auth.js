import axiosClient from "./axiosClient";

export async function createSseToken() {
  const { data } = await axiosClient.post("/auth/sse-token");
  return data;
}

export async function forgotPassword(email) {
  const { data } = await axiosClient.post("/auth/forgot-password", { email });
  return data;
}

export async function resetPassword({ token, newPassword }) {
  const { data } = await axiosClient.post("/auth/reset-password", { token, newPassword });
  return data;
}

export async function changePassword({ currentPassword, newPassword }) {
  const { data } = await axiosClient.patch("/auth/change-password", {
    currentPassword,
    newPassword,
  });
  return data;
}