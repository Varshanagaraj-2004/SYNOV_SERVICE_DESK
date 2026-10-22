import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import synovLogo from "../assets/synov_it_services_pvt_ltd_logo.jpg";
import { resetPassword } from "../api/auth";
import PasswordInput from "../components/PasswordInput";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (newPassword !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await resetPassword({ token, newPassword });
      setMessage(result.message);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to reset your password. Request a new reset link.");
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
        <h1 className="mb-1 text-center text-lg font-semibold text-text-primary">Reset password</h1>
        <p className="mb-6 text-center text-sm text-text-secondary">
          Choose a password with at least 8 characters, including a letter and a number.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {message ? (
            <>
              <p role="status" className="text-sm text-status-closed">{message}</p>
              <p className="text-center text-sm">
                <Link to="/login" className="font-medium text-brand-purple hover:underline">Back to sign in</Link>
              </p>
            </>
          ) : (
            <>
              {error && <p role="alert" className="text-sm text-status-critical">{error}</p>}
              {!token && <p role="alert" className="text-sm text-status-critical">This reset link is missing its token.</p>}
              <div>
                <label htmlFor="new-password" className="text-xs text-text-secondary">New password</label>
                <PasswordInput
                  id="new-password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="text-xs text-text-secondary">Confirm password</label>
                <PasswordInput
                  id="confirm-password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={!token || isSubmitting}
                className="w-full rounded-lg bg-brand-purple py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isSubmitting ? "Resetting..." : "Reset password"}
              </button>
              <p className="text-center text-sm">
                <Link to="/login" className="font-medium text-brand-purple hover:underline">Back to sign in</Link>
              </p>
            </>
          )}
        </form>
      </div>
    </div>
  );
}