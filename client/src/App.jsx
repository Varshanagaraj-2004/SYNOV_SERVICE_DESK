import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowLeft, KeyRound, LogOut } from "lucide-react";
import Sidebar from "./components/Sidebar";
import RequireRole from "./components/RequireRole";
import { useAuth } from "./context/useAuth";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import TicketList from "./pages/TicketList";
import TicketDetail from "./pages/TicketDetail";
import RaiseTicket from "./pages/RaiseTicket";
import TechnicianList from "./pages/TechnicianList";
import TechnicianProfile from "./pages/TechnicianProfile";
import Assets from "./pages/Assets";
import CustomerList from "./pages/CustomerList";
import UserList from "./pages/UserList";
import AddUser from "./pages/AddUser";
import AddClientUser from "./pages/AddClientUser";
import CompanyTicketsPage from "./pages/CompanyTicketsPage";
import { changePassword } from "./api/auth";
import useEvents from "./hooks/useEvents";

const Reports = lazy(() => import("./pages/Reports"));

function getDisplayName({ userName, technicianName }) {
  return technicianName || userName || "User";
}

function getInitials(name) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function getRoleLabel(role) {
  return role === "it_staff" ? "IT Staff" : role === "admin" ? "Admin" : "Client";
}

function shouldShowBack(pathname) {
  return pathname === "/raise-ticket"
    || pathname === "/users/add"
    || /^\/tickets\/[^/]+$/.test(pathname)
    || /^\/technicians\/[^/]+$/.test(pathname);
}

function AppLayout({ children }) {
  useEvents();
  const navigate = useNavigate();
  const location = useLocation();
  const { role, userName, technicianName, mustChangePassword, completePasswordChange, logout } = useAuth();
  const [showProfile, setShowProfile] = useState(false);
  const profileMenuRef = useRef(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" });
  const [passwordError, setPasswordError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const displayName = getDisplayName({ userName, technicianName });
  const roleLabel = getRoleLabel(role);

  useEffect(() => {
    if (!showProfile) return undefined;

    function handleOutsideClick(event) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setShowProfile(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [showProfile]);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  function openPasswordModal() {
    setShowProfile(false);
    setShowPasswordModal(true);
    setPasswordForm({ current: "", next: "", confirm: "" });
    setPasswordError("");
    setPasswordMessage("");
  }

  function closePasswordModal() {
    if (mustChangePassword) return;
    setShowPasswordModal(false);
    setPasswordError("");
    setPasswordMessage("");
  }

  function handlePasswordChange(e) {
    setPasswordForm({ ...passwordForm, [e.target.name]: e.target.value });
  }

  async function onChangePassword() {
    setIsChangingPassword(true);
    setPasswordError("");
    try {
      const response = await changePassword({
        currentPassword: passwordForm.current,
        newPassword: passwordForm.next,
      });
      completePasswordChange(response.token);
      setShowPasswordModal(true);
      setPasswordMessage("Password changed successfully.");
      setPasswordForm({ current: "", next: "", confirm: "" });
    } catch (error) {
      setPasswordError(error.response?.data?.error || "Couldn't change the password. Try again.");
    } finally {
      setIsChangingPassword(false);
    }
  }

  function handlePasswordSubmit(e) {
    e.preventDefault();
    if (!passwordForm.current) {
      setPasswordError("Enter your current password.");
      return;
    }
    if (passwordForm.next.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (!/[A-Za-z]/.test(passwordForm.next) || !/\d/.test(passwordForm.next)) {
      setPasswordError("New password must include at least one letter and one number.");
      return;
    }
    if (passwordForm.next === passwordForm.current) {
      setPasswordError("New password must be different from the current password.");
      return;
    }
    if (passwordForm.next !== passwordForm.confirm) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }
    setPasswordError("");
    onChangePassword();
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface-page">
      <Sidebar />
      <main className="min-w-0 flex-1 h-screen overflow-y-auto">
        <header className="sticky top-0 z-30 flex justify-end bg-surface-page/95 px-8 py-2 backdrop-blur-sm">
          <div ref={profileMenuRef} className="relative">
            <button
              onClick={() => setShowProfile(!showProfile)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-purple text-xs font-semibold text-white hover:opacity-90 transition-opacity"
              title="Open profile menu"
              aria-label="Open profile menu"
            >
              {getInitials(displayName)}
            </button>
            {showProfile && (
              <div className="absolute right-0 top-11 z-40 w-56 rounded-lg border border-surface-border bg-surface-card p-3 shadow-lg">
                <div className="border-b border-surface-border pb-3">
                  <p className="truncate text-sm font-semibold text-text-primary">{displayName}</p>
                  <p className="mt-0.5 text-xs text-text-secondary">{roleLabel}</p>
                </div>
                <button
                  onClick={openPasswordModal}
                  className="mt-3 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-text-primary hover:bg-surface-page transition-colors"
                >
                  <KeyRound size={16} />
                  Change Password
                </button>
                <button
                  onClick={handleLogout}
                  className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-text-primary hover:bg-surface-page transition-colors"
                >
                  <LogOut size={16} />
                  Log Out
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="px-8 pt-4 pb-8">
          {shouldShowBack(location.pathname) && (
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-brand-purple mb-4 transition-colors"
            >
              <ArrowLeft size={16} />
              Back
            </button>
          )}
          {children}
        </div>
      </main>

      {(showPasswordModal || mustChangePassword) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-password-title"
            className="w-full max-w-md rounded-xl border border-surface-border bg-surface-card p-6 shadow-xl"
          >
            <h2 id="change-password-title" className="text-lg font-semibold text-text-primary">
              Change Password
            </h2>
            <form onSubmit={handlePasswordSubmit} className="mt-5 space-y-4">
              {passwordError && <p className="text-sm text-status-critical">{passwordError}</p>}

              {!passwordMessage ? (
                <>
                  <label className="block text-xs font-medium text-text-secondary">
                    Current Password
                    <input type="password" name="current" value={passwordForm.current} onChange={handlePasswordChange} className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm focus:outline-none" />
                  </label>
                  <label className="block text-xs font-medium text-text-secondary">
                    New Password
                    <input type="password" name="next" value={passwordForm.next} onChange={handlePasswordChange} className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm focus:outline-none" />
                  </label>
                  <label className="block text-xs font-medium text-text-secondary">
                    Confirm New Password
                    <input type="password" name="confirm" value={passwordForm.confirm} onChange={handlePasswordChange} className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm focus:outline-none" />
                  </label>
                  <div className="flex justify-end gap-3 pt-2">
                    {!mustChangePassword && (
                      <button type="button" onClick={closePasswordModal} className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-page transition-colors">
                        Cancel
                      </button>
                    )}
                    <button type="submit" disabled={isChangingPassword} className="rounded-lg bg-brand-purple px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-60">
                      {isChangingPassword ? "Saving..." : "Save"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-text-secondary">{passwordMessage}</p>
                  <div className="flex justify-end">
                    <button type="button" onClick={closePasswordModal} className="rounded-lg bg-brand-purple px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity">
                      Close
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Small helper so routes below stay readable
function Protected({ allowed, page }) {
  const { mustChangePassword } = useAuth();
  if (mustChangePassword) return <AppLayout />;

  return (
    <RequireRole allowed={allowed}>
      <AppLayout>{page}</AppLayout>
    </RequireRole>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route path="/" element={
          <Protected allowed={["client", "it_staff", "admin"]} page={<Dashboard />} />
        } />

        <Route path="/tickets" element={
          <Protected allowed={["client", "it_staff", "admin"]} page={<TicketList />} />
        } />

        <Route path="/tickets/:id" element={
          <Protected allowed={["client", "it_staff", "admin"]} page={<TicketDetail />} />
        } />

        <Route path="/raise-ticket" element={
          <Protected allowed={["client", "admin"]} page={<RaiseTicket />} />
        } />

        <Route path="/technicians" element={
          <Protected allowed={["admin"]} page={<TechnicianList />} />
        } />

        <Route path="/technicians/:name" element={
          <Protected allowed={["admin"]} page={<TechnicianProfile />} />
        } />

        <Route path="/assets" element={
          <Protected allowed={["client", "it_staff", "admin"]} page={<Assets />} />
        } />

        <Route path="/customers" element={
          <Protected allowed={["it_staff", "admin"]} page={<CustomerList />} />
        } />

        <Route path="/customers/:companyId/users" element={
          <Protected allowed={["admin"]} page={<UserList />} />
        } />

        <Route path="/reports" element={
          <Protected
            allowed={["admin"]}
            page={<Suspense fallback={<p className="text-text-secondary">Loading reports...</p>}><Reports /></Suspense>}
          />
        } />

        <Route path="/admin/companies/:companyId/tickets" element={
          <Protected allowed={["admin"]} page={<CompanyTicketsPage />} />
        } />

        <Route path="/users" element={
          <Protected allowed={["client"]} page={<UserList />} />
        } />

        <Route path="/users/add" element={
          <Protected allowed={["client"]} page={<AddUser />} />
        } />

        <Route path="/client-users/add" element={
          <Protected allowed={["admin"]} page={<AddClientUser />} />
        } />

      </Routes>
    </BrowserRouter>
  );
}