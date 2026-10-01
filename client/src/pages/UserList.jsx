import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, Pencil, Trash2, UserPlus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAllCompanies } from "../api/companies";
import { fetchCompanyContacts } from "../api/companyContacts";
import { deleteClientUser, updateClientUser, verifyClientUser } from "../api/users";
import { useAuth } from "../context/useAuth";
import useKeyedState from "../hooks/useKeyedState";

const ROWS_PER_PAGE = 10;
const emptyEditForm = { name: "", email: "", department: "", phone: "", address: "", isCompanyAdmin: false };

export default function UserList() {
  const queryClient = useQueryClient();
  const { role, isCompanyAdmin, companyName: authCompanyName, companyId: authCompanyId, userId } = useAuth();
  const canManageUsers = role === "admin" || (role === "client" && isCompanyAdmin);
  const { companyId: routeCompanyId } = useParams();
  const targetCompanyId = role === "client" ? authCompanyId : routeCompanyId;

  const { data: companies = [] } = useQuery({
    queryKey: ["companies", "all-options"],
    queryFn: fetchAllCompanies,
  });

  const { data: companyUsers = [], isLoading, isError } = useQuery({
    queryKey: ["companyContacts", targetCompanyId],
    queryFn: () => fetchCompanyContacts(targetCompanyId),
    enabled: Boolean(targetCompanyId),
  });

  const currentCompany = companies.find((company) => String(company._id) === String(targetCompanyId));
  const companyName = role === "admin"
    ? currentCompany?.companyName || "Selected company"
    : (authCompanyName || "your company");

  const [page, setPage] = useKeyedState(targetCompanyId, () => 1);
  const [userListError, setUserListError] = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [editError, setEditError] = useState("");

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateClientUser(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["companyContacts"] });
      setEditingUser(null);
      setEditError("");
    },
    onError: (err) => {
      setEditError(err.response?.data?.error || "Couldn't update this user.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteClientUser,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["companyContacts"] });
      setUserListError("");
    },
    onError: (err) => {
      setUserListError(err.response?.data?.error || "Couldn't delete this user.");
    },
  });

  const verifyMutation = useMutation({
    mutationFn: verifyClientUser,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["companyContacts"] });
      setUserListError("");
    },
    onError: (err) => {
      setUserListError(err.response?.data?.error || "Couldn't verify this user.");
    },
  });

  const totalPages = Math.max(1, Math.ceil(companyUsers.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const paginatedUsers = companyUsers.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  function handleEditInputChange(e) {
    const { name, value } = e.target;
    setEditForm((current) => ({ ...current, [name]: value }));
  }

  function startEditingUser(user) {
    setEditingUser(user);
    setEditForm({
      name: user.name || "",
      email: user.email || "",
      department: user.department || "",
      phone: user.phone || "",
      address: user.address || "",
      isCompanyAdmin: user.isCompanyAdmin === true,
    });
    setEditError("");
  }

  function handleEditSubmit(e) {
    e.preventDefault();
    if (!editForm.name.trim()) {
      setEditError("Name is required.");
      return;
    }
    if (!editForm.email.trim()) {
      setEditError("Email is required.");
      return;
    }

    updateMutation.mutate({
      id: editingUser._id,
      payload: {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        department: editForm.department.trim(),
        phone: editForm.phone.trim(),
        address: editForm.address.trim(),
        ...(role === "admin" ? { isCompanyAdmin: editForm.isCompanyAdmin } : {}),
      },
    });
  }

  if (isLoading) return <p className="text-text-secondary">Loading users...</p>;
  if (isError) return <p className="text-status-critical">Couldn't load users. Check the backend is running.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">User List</h2>
          <p className="text-sm text-text-secondary mt-1">
            {companyUsers.length} user{companyUsers.length === 1 ? "" : "s"} from {companyName}
          </p>
        </div>
        {canManageUsers && (
          <Link
            to={role === "admin" ? `/client-users/add?companyId=${encodeURIComponent(targetCompanyId || "")}` : "/users/add"}
            className="flex items-center gap-2 bg-brand-purple text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <UserPlus size={16} />
            Add User
          </Link>
        )}
      </div>

      <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="bg-surface-muted text-left text-text-secondary text-xs uppercase tracking-wide">
              <th className="w-[8%] px-5 py-3 font-medium">S.No</th>
              <th className="w-[22%] px-5 py-3 font-medium">Name</th>
              <th className="w-[18%] px-5 py-3 font-medium">Department</th>
              <th className="w-[22%] px-5 py-3 font-medium">Email</th>
              <th className="w-[15%] px-5 py-3 font-medium">Phone</th>
              <th className="w-[15%] px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedUsers.map((u, index) => (
              <tr key={u._id} className="border-t border-surface-border hover:bg-surface-muted/50 transition-colors">
                <td className="px-5 py-5 font-medium text-brand-purple">
                  {(currentPage - 1) * ROWS_PER_PAGE + index + 1}
                </td>
                <td className="px-5 py-5 text-text-primary">
                  <span className="block truncate font-medium">{u.name}</span>
                  {u.isCompanyAdmin && <span className="text-xs text-brand-purple">Company admin</span>}
                  {u.unverified && <span className="text-xs text-status-critical">Unverified</span>}
                </td>
                <td className="px-5 py-5 text-text-secondary">
                  <span className="inline-flex max-w-full items-center rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-text-secondary">
                    <span className="truncate">{u.department || "—"}</span>
                  </span>
                </td>
                <td className="px-5 py-5 text-text-secondary"><span className="block whitespace-normal">{u.email}</span></td>
                <td className="px-5 py-5 text-text-secondary"><span className="block whitespace-normal">{u.phone || "—"}</span></td>
                <td className="px-5 py-5 text-right">
                  {canManageUsers && <div className="flex justify-end gap-2">
                    {role === "admin" && u.unverified && (
                      <button
                        type="button"
                        onClick={() => verifyMutation.mutate(u._id)}
                        disabled={verifyMutation.isPending}
                        className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-status-closed/30 px-2 text-status-closed hover:bg-status-closed/5 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Check size={14} />
                        Verify
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => startEditingUser(u)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-surface-border text-text-secondary hover:bg-surface-page transition-colors"
                      aria-label={`Edit ${u.name}`}
                    >
                      <Pencil size={15} />
                    </button>
                    {String(u._id) !== String(userId) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete ${u.name}? This can't be undone.`)) {
                            deleteMutation.mutate(u._id);
                          }
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-status-critical/30 text-status-critical hover:bg-status-critical/5 transition-colors"
                        aria-label={`Delete ${u.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>}
                </td>
              </tr>
            ))}

            {companyUsers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-text-secondary">
                  No users added yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {userListError && <p className="mt-3 text-sm text-status-critical">{userListError}</p>}

      {companyUsers.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-text-secondary">
            Showing {(currentPage - 1) * ROWS_PER_PAGE + 1}–{Math.min(currentPage * ROWS_PER_PAGE, companyUsers.length)} of {companyUsers.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={currentPage === 1}
              className="border border-surface-border text-text-secondary px-4 py-2 rounded-lg text-sm font-medium hover:bg-surface-page transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-text-secondary">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={currentPage === totalPages}
              className="border border-surface-border text-text-secondary px-4 py-2 rounded-lg text-sm font-medium hover:bg-surface-page transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-user-title"
            className="w-full max-w-lg rounded-xl border border-surface-border bg-surface-card p-6 shadow-xl"
          >
            <h2 id="edit-user-title" className="text-lg font-semibold text-text-primary">
              Edit User
            </h2>
            <form onSubmit={handleEditSubmit} className="mt-5 space-y-4">
              {editError && <p className="text-sm text-status-critical">{editError}</p>}

              <label className="block text-xs font-medium text-text-secondary">
                Name
                <input
                  type="text"
                  name="name"
                  value={editForm.name}
                  onChange={handleEditInputChange}
                  className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm focus:outline-none"
                />
              </label>

              <label className="block text-xs font-medium text-text-secondary">
                Email
                <input
                  type="email"
                  name="email"
                  value={editForm.email}
                  onChange={handleEditInputChange}
                  className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm focus:outline-none"
                />
              </label>

              <label className="block text-xs font-medium text-text-secondary">
                Department
                <input
                  type="text"
                  name="department"
                  value={editForm.department}
                  onChange={handleEditInputChange}
                  className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm focus:outline-none"
                />
              </label>

              <label className="block text-xs font-medium text-text-secondary">
                Phone
                <input
                  type="text"
                  name="phone"
                  value={editForm.phone}
                  onChange={handleEditInputChange}
                  className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm focus:outline-none"
                />
              </label>

              <label className="block text-xs font-medium text-text-secondary">
                Address
                <input
                  type="text"
                  name="address"
                  value={editForm.address}
                  onChange={handleEditInputChange}
                  className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm focus:outline-none"
                />
              </label>

              {role === "admin" && (
                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={editForm.isCompanyAdmin}
                    onChange={(event) => setEditForm((current) => ({ ...current, isCompanyAdmin: event.target.checked }))}
                    className="h-4 w-4 accent-brand-purple"
                  />
                  Company administrator
                </label>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingUser(null);
                    setEditError("");
                  }}
                  className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-page transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="rounded-lg bg-brand-purple px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}