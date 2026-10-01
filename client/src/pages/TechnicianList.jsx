import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, UserX, Pencil, X } from "lucide-react";
import { fetchAllTickets } from "../api/tickets";
import { createStaff, deactivateStaff, fetchStaff, fetchTechnicians, updateStaff } from "../api/technicians";
import { useAuth } from "../context/useAuth";

function Avatar({ name }) {
  const initials = name.split(" ").map((n) => n[0]).slice(0, 2).join("");
  return (
    <div className="w-12 h-12 rounded-full bg-brand-purple text-white flex items-center justify-center text-base font-semibold">
      {initials}
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2 border border-surface-border rounded-lg text-sm focus:outline-none";
const emptyForm = { name: "", email: "", designation: "", role: "it_staff" };

export default function TechnicianList() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const queryClient = useQueryClient();

  const { data: tickets = [], isLoading: ticketsLoading, isError: ticketsError } = useQuery({
    queryKey: ["tickets"],
    queryFn: fetchAllTickets,
  });
  const staffQuery = useQuery({
    queryKey: isAdmin ? ["staff"] : ["technicians"],
    queryFn: isAdmin ? fetchStaff : fetchTechnicians,
  });

  const technicians = staffQuery.data || [];
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingStaffId, setEditingStaffId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [staffToDeactivate, setStaffToDeactivate] = useState(null);
  const [error, setError] = useState("");

  async function refreshStaff() {
    await queryClient.invalidateQueries({ queryKey: ["staff"] });
    await queryClient.invalidateQueries({ queryKey: ["technicians"] });
  }

  const createMutation = useMutation({
    mutationFn: createStaff,
    onSuccess: async () => {
      await refreshStaff();
      setForm(emptyForm);
      setShowAddForm(false);
      setError("");
    },
    onError: (requestError) => setError(requestError.response?.data?.error || "Couldn't add this staff member."),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateStaff(id, payload),
    onSuccess: async () => {
      await refreshStaff();
      setEditingStaffId(null);
      setError("");
    },
    onError: (requestError) => setError(requestError.response?.data?.error || "Couldn't update this staff member."),
  });
  const deactivateMutation = useMutation({
    mutationFn: deactivateStaff,
    onSuccess: async () => {
      await refreshStaff();
      setStaffToDeactivate(null);
      setError("");
    },
    onError: (requestError) => setError(requestError.response?.data?.error || "Couldn't deactivate this staff member."),
  });

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handleEditChange(e) {
    setEditForm({ ...editForm, [e.target.name]: e.target.value });
  }

  function handleAdd(event) {
    event.preventDefault();
    setError("");
    createMutation.mutate({
      name: form.name.trim(),
      email: form.email.trim(),
      designation: form.designation.trim(),
      role: form.role,
    });
  }

  function handleEdit(tech) {
    setShowAddForm(false);
    setEditingStaffId(tech._id);
    setEditForm({
      name: tech.name,
      email: tech.email,
      designation: tech.designation || "",
      role: tech.role || "it_staff",
    });
    setError("");
  }

  function handleEditSubmit(event) {
    event.preventDefault();
    setError("");
    updateMutation.mutate({
      id: editingStaffId,
      payload: {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        designation: editForm.designation.trim(),
        role: editForm.role,
      },
    });
  }

  function cancelEdit() {
    setEditingStaffId(null);
    setEditForm(emptyForm);
    setError("");
  }

  function handleDeactivate(e, staffMember) {
    e.preventDefault(); // stop the card's <Link> navigation
    e.stopPropagation();

    const assignedCount = tickets.filter((ticket) => ticket.assignment.assignedTo === staffMember.name).length;
    setError("");
    setStaffToDeactivate({ ...staffMember, assignedCount });
  }

  function confirmDeactivate() {
    if (!staffToDeactivate) return;
    deactivateMutation.mutate(staffToDeactivate._id);
  }

  if (ticketsLoading || staffQuery.isLoading) return <p className="text-text-secondary">Loading technicians...</p>;
  if (ticketsError || staffQuery.isError) return <p className="text-status-critical">Couldn't load technician data. Check the backend is running.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-text-primary">{isAdmin ? "Staff & Administrators" : "Technicians"}</h2>
        {isAdmin && (
          <button
            onClick={() => {
              setShowAddForm(!showAddForm);
              setEditingStaffId(null);
              setError("");
            }}
            className="flex items-center gap-2 bg-brand-purple text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <UserPlus size={16} />
            {showAddForm ? "Cancel" : "Add Technician"}
          </button>
        )}
      </div>

      {isAdmin && showAddForm && (
        <form
          onSubmit={handleAdd}
          className="bg-surface-card border border-surface-border rounded-xl p-5 mb-6"
        >
          {error && <p className="text-sm text-status-critical mb-3">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-text-secondary">Name *</label>
              <input name="name" value={form.name} onChange={handleChange} required className={`${inputClass} mt-1`} />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary">Email *</label>
              <input type="email" name="email" value={form.email} onChange={handleChange} required className={`${inputClass} mt-1`} />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary">Designation</label>
              <input name="designation" value={form.designation} onChange={handleChange} className={`${inputClass} mt-1`} placeholder="e.g. Network Engineer" />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary">Role</label>
              <select name="role" value={form.role} onChange={handleChange} className={`${inputClass} mt-1`}>
                <option value="it_staff">Technician</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="mt-4 bg-brand-purple text-white px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {createMutation.isPending ? "Adding..." : "Add"}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {technicians.map((tech) => {
          const assignedCount = tickets.filter(
            (t) => t.assignment.assignedTo === tech.name
          ).length;
          const isEditing = editingStaffId === tech._id;
          const isTechnician = tech.role !== "admin";
          const cardContent = (
            <>
              <Avatar name={tech.name} />
              <h3 className="text-base font-semibold text-text-primary mt-4">{tech.name}</h3>
              <p className="text-sm text-text-secondary">{tech.designation || (isTechnician ? "Support Engineer" : "Administrator")}</p>
              {isAdmin && <p className="mt-2 text-xs font-medium text-text-secondary">{isTechnician ? "Technician" : "Administrator"}</p>}
              {isTechnician && <p className="text-sm text-text-secondary mt-3">{assignedCount} ticket{assignedCount === 1 ? "" : "s"} assigned</p>}
            </>
          );

          return (
            <div
              key={tech._id || tech.name}
              className="relative bg-surface-card border border-surface-border rounded-xl p-5 hover:shadow-sm transition-shadow"
            >
              {isEditing ? (
                <form onSubmit={handleEditSubmit}>
                  {error && <p className="text-sm text-status-critical mb-3">{error}</p>}
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-text-secondary">Name *</label>
                      <input name="name" value={editForm.name} onChange={handleEditChange} className={`${inputClass} mt-1`} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-secondary">Email</label>
                      <input type="email" name="email" value={editForm.email} onChange={handleEditChange} className={`${inputClass} mt-1`} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-secondary">Designation</label>
                      <input name="designation" value={editForm.designation} onChange={handleEditChange} className={`${inputClass} mt-1`} placeholder="e.g. Network Engineer" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-secondary">Role</label>
                      <select name="role" value={editForm.role} onChange={handleEditChange} className={`${inputClass} mt-1`}>
                        <option value="it_staff">Technician</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button type="submit" disabled={updateMutation.isPending} className="bg-brand-purple text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                      {updateMutation.isPending ? "Saving..." : "Save"}
                    </button>
                    <button type="button" onClick={cancelEdit} className="border border-surface-border text-text-secondary px-4 py-2 rounded-lg text-sm font-medium hover:bg-surface-page transition-colors">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  {isTechnician ? (
                    <Link to={`/technicians/${encodeURIComponent(tech.name)}`} className="block">{cardContent}</Link>
                  ) : (
                    <div>{cardContent}</div>
                  )}
                  {isAdmin && (
                    <div className="absolute top-3 right-3 flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(tech)}
                        className="text-text-secondary hover:text-brand-purple transition-colors"
                        title="Edit technician"
                        aria-label={`Edit ${tech.name}`}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={(e) => handleDeactivate(e, tech)}
                        className="text-text-secondary hover:text-status-critical transition-colors"
                        title="Deactivate staff member"
                        aria-label={`Deactivate ${tech.name}`}
                      >
                        <UserX size={16} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {technicians.length === 0 && (
          <p className="text-sm text-text-secondary col-span-full text-center py-8">
            No technicians yet.
          </p>
        )}
      </div>

      {isAdmin && staffToDeactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-technician-title"
            className="w-full max-w-md bg-surface-card border border-surface-border rounded-xl shadow-xl p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                  <h3 id="delete-technician-title" className="text-lg font-semibold text-text-primary">
                    Deactivate staff member?
                </h3>
                <p className="text-sm text-text-secondary mt-2">
                  Are you sure you want to deactivate <span className="font-medium text-text-primary">{staffToDeactivate.name}</span>?
                  {staffToDeactivate.assignedCount > 0 && (
                    <> They have {staffToDeactivate.assignedCount} assigned ticket{staffToDeactivate.assignedCount === 1 ? "" : "s"}; existing tickets will keep showing their name until reassigned.</>
                  )}
                </p>
                {error && <p role="alert" className="mt-3 text-sm text-status-critical">{error}</p>}
              </div>
              <button
                type="button"
                onClick={() => setStaffToDeactivate(null)}
                className="text-text-secondary hover:text-text-primary transition-colors"
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setStaffToDeactivate(null)}
                className="border border-surface-border text-text-secondary px-4 py-2 rounded-lg text-sm font-medium hover:bg-surface-page transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeactivate}
                disabled={deactivateMutation.isPending}
                className="bg-status-critical text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {deactivateMutation.isPending ? "Deactivating..." : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}