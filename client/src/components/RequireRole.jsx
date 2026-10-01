import { Navigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";

export default function RequireRole({ allowed, children }) {
  const { role } = useAuth();

  // Not logged in at all → send to login
  if (!role) return <Navigate to="/login" replace />;

  // Logged in, but wrong role for this page → send to their home
  if (!allowed.includes(role)) return <Navigate to="/" replace />;

  return children;
}