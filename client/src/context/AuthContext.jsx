import { useEffect, useState } from "react";
import axiosClient from "../api/axiosClient";
import queryClient from "../api/queryClient";
import AuthContext from "./authContextStore";

function getStoredAuth() {
  try {
    const raw = localStorage.getItem("synov_auth");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function isTokenExpired(token) {
  if (!token) return false;
  try {
    const encodedPayload = token.split(".")[1];
    if (!encodedPayload) return false;
    const base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
    return Number.isFinite(payload.exp) && payload.exp * 1000 <= Date.now();
  } catch {
    return false;
  }
}

export function AuthProvider({ children }) {
  const [initialSession] = useState(() => {
    const savedAuth = getStoredAuth();
    const storedToken = localStorage.getItem("synov_token") || savedAuth?.token || null;
    const expired = isTokenExpired(storedToken);
    return {
      savedAuth: expired ? null : savedAuth,
      token: expired ? null : storedToken,
      expired,
    };
  });
  const savedAuth = initialSession.savedAuth;

  const [role, setRole] = useState(savedAuth?.role || null);
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(savedAuth?.isCompanyAdmin === true);
  const [userName, setUserName] = useState(savedAuth?.userName || "");
  const [technicianName, setTechnicianName] = useState(savedAuth?.technicianName || "");
  const [companyName, setCompanyName] = useState(savedAuth?.companyName || "");
  const [companyId, setCompanyId] = useState(savedAuth?.companyId || null);
  const [userId, setUserId] = useState(savedAuth?.userId || null);
  const [mustChangePassword, setMustChangePassword] = useState(savedAuth?.mustChangePassword === true);
  const [token, setToken] = useState(initialSession.token);

  useEffect(() => {
    if (!initialSession.expired) return;
    localStorage.removeItem("synov_token");
    localStorage.removeItem("synov_auth");
    queryClient.clear();
  }, [initialSession.expired]);

  function persistAuth(nextToken, nextUser) {
    const payload = {
      token: nextToken,
      role: nextUser.role,
      isCompanyAdmin: nextUser.isCompanyAdmin === true,
      userName: nextUser.name,
      technicianName: nextUser.role === "it_staff" ? nextUser.name : "",
      companyName: nextUser.companyName || "",
      companyId: nextUser.companyId || null,
      userId: nextUser.id,
      mustChangePassword: nextUser.mustChangePassword === true,
    };

    localStorage.setItem("synov_token", nextToken);
    localStorage.setItem("synov_auth", JSON.stringify(payload));
    return payload;
  }

  async function login({ email, password }) {
    try {
      const { data } = await axiosClient.post("/auth/login", { email, password });
      const nextUser = data.user;
      const saved = persistAuth(data.token, nextUser);

      setToken(saved.token);
      setUserId(saved.userId);
      setRole(saved.role);
      setIsCompanyAdmin(saved.isCompanyAdmin);
      setUserName(saved.userName);
      setCompanyId(saved.companyId);
      setCompanyName(saved.companyName);
      setTechnicianName(saved.technicianName);
      setMustChangePassword(saved.mustChangePassword);
      queryClient.clear();
      return true;
    } catch (err) {
      console.error("Login failed:", err);
      setRole(null);
      setIsCompanyAdmin(false);
      setUserName("");
      setTechnicianName("");
      setCompanyName("");
      setToken(null);
      setUserId(null);
      setCompanyId(null);
      setMustChangePassword(false);
      localStorage.removeItem("synov_token");
      localStorage.removeItem("synov_auth");
      return false;
    }
  }

  function logout() {
    setUserName("");
    setRole(null);
    setIsCompanyAdmin(false);
    setTechnicianName("");
    setCompanyName("");
    setUserId(null);
    setCompanyId(null);
    setToken(null);
    setMustChangePassword(false);
    localStorage.removeItem("synov_token");
    localStorage.removeItem("synov_auth");
    queryClient.clear();
  }

  function completePasswordChange(nextToken) {
    const saved = getStoredAuth() || {};
    localStorage.setItem("synov_token", nextToken);
    localStorage.setItem("synov_auth", JSON.stringify({ ...saved, token: nextToken, mustChangePassword: false }));
    setToken(nextToken);
    setMustChangePassword(false);
  }

  return (
    <AuthContext.Provider value={{ role, isCompanyAdmin, userName, technicianName, companyName, companyId, userId, token, mustChangePassword, completePasswordChange, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
