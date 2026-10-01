import { useState } from "react";
import { Link } from "react-router-dom";
import synovLogo from "../assets/synov_it_services_pvt_ltd_logo.jpg";
import { forgotPassword } from "../api/auth";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    setIsSubmitting(true);
    try {
      const result = await forgotPassword(email);
      setMessage(result.message);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to request a password reset. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-page px-4">
      <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface-card p-8">
        <div className="mb-6 flex justify-center">
          <img src={synovLogo} alt="Synov IT Services" className="h-20" />
        </div>
        <h1 className="mb-1 text-center text-lg font-semibold text-text-primary">Forgot password</h1>
        <p className="mb-6 text-center text-sm text-text-secondary">
          Enter your account email to request a reset link.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {message && <p role="status" className="text-sm text-status-closed">{message}</p>}
          {error && <p role="alert" className="text-sm text-status-critical">{error}</p>}
          <div>
            <label htmlFor="reset-email" className="text-xs text-text-secondary">Email</label>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm focus:outline-none"
              placeholder="you@company.com"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-brand-purple py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? "Sending..." : "Send reset link"}
          </button>
          <p className="text-center text-sm">
            <Link to="/login" className="font-medium text-brand-purple hover:underline">Back to sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}