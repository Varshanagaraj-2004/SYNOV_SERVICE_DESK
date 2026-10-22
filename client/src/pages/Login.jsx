import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import synovLogo from "../assets/synov_it_services_pvt_ltd_logo.jpg";
import { useAuth } from "../context/useAuth";
import PasswordInput from "../components/PasswordInput";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const navigate = useNavigate();
  const { login } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoginError("");
    const success = await login({ email, password });
    if (!success) {
      setLoginError("Invalid email or password.");
      return;
    }
    navigate("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-page">
      <div className="bg-surface-card border border-surface-border rounded-2xl p-8 w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <img src={synovLogo} alt="Synov IT Services" className="h-20" />
        </div>

        <h2 className="text-lg font-semibold text-text-primary text-center mb-1">
          Service Desk
        </h2>
        <p className="text-sm text-text-secondary text-center mb-6">
          Sign in to continue
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {loginError && <p className="text-sm text-status-critical">{loginError}</p>}
          <div>
            <label className="text-xs text-text-secondary">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-surface-border rounded-lg text-sm focus:outline-none"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label className="text-xs text-text-secondary">Password</label>
            <PasswordInput
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-surface-border rounded-lg text-sm focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          <div className="text-right">
            <Link to="/forgot-password" className="text-sm font-medium text-brand-purple hover:underline">
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            className="w-full bg-brand-purple text-white py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}