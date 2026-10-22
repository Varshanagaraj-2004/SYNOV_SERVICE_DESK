import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./context/AuthContext";
import queryClient from "./api/queryClient";
import App from "./App.jsx";
import "./index.css";

localStorage.removeItem("synov_token");
localStorage.removeItem("synov_auth");

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);