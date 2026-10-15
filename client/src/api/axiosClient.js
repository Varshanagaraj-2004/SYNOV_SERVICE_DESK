import axios from "axios";
import queryClient from "./queryClient";

const axiosClient = axios.create({
  baseURL: "/api",
});

// Attaches the JWT (if we have one) to every outgoing request.
axiosClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("synov_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url || "";
    const isLoginRequest = /(?:^|\/)auth\/login\/?$/.test(requestUrl);
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem("synov_token");
      localStorage.removeItem("synov_auth");
      queryClient.clear();
      if (window.location.pathname !== "/login") window.location.assign("/login");
    }
    return Promise.reject(error);
  },
);

export default axiosClient;
