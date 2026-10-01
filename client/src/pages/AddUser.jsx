import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClientUser } from "../api/users";
import { useAuth } from "../context/useAuth";

const inputClass =
  "w-full px-3 py-2 border border-surface-border rounded-lg text-sm focus:outline-none";
const disabledClass =
  "w-full px-3 py-2 border border-surface-border rounded-lg text-sm bg-surface-page text-text-secondary cursor-not-allowed";

function Field({ label, required, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-text-secondary">
        {label} {required && <span className="text-status-critical">*</span>}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

const emptyForm = { department: "", name: "", phone: "", email: "", address: "" };

export default function AddUser() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { companyName } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handleReset() {
    setForm(emptyForm);
    setError("");
  }

  const createMutation = useMutation({
    mutationFn: createClientUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companyContacts"] });
      setSuccess("User created — login credentials have been emailed to them.");
      setForm(emptyForm);
      setTimeout(() => navigate("/users"), 900);
    },
    onError: (err) => {
      const errorMessage = err.response?.data?.error;
      if (errorMessage === "A user with this email already exists") {
        setError("A user with this email already exists");
        return;
      }
      if (errorMessage === "Phone number is required") {
        setError("Phone number is required");
        return;
      }
      setError("Couldn't add the user — check the backend is running and try again.");
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!form.email.trim()) {
      setError("Email is required.");
      return;
    }
    if (!form.phone.trim()) {
      setError("Phone number is required");
      return;
    }
    setError("");
    setSuccess("");

    createMutation.mutate({
      name: form.name.trim(),
      department: form.department.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
    });
  }

  return (
    <div className="max-w-3xl">
      <Link to="/users" className="text-sm text-text-secondary hover:text-brand-purple mb-4 inline-block">
        ← Back to user list
      </Link>

      <div className="bg-surface-card border border-surface-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-brand-purple mb-6">Add New User</h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <p className="text-sm text-status-critical">{error}</p>}
          {success && <p className="text-sm text-status-closed">{success}</p>}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Company" required>
              <input disabled value={companyName || "—"} className={disabledClass} />
            </Field>
            <Field label="Name" required>
              <input name="name" value={form.name} onChange={handleChange} className={inputClass} placeholder="Full name" />
            </Field>
            <Field label="Department">
              <input name="department" value={form.department} onChange={handleChange} className={inputClass} placeholder="Department" />
            </Field>
            <Field label="Phone" required>
              <input name="phone" value={form.phone} onChange={handleChange} className={inputClass} placeholder="Phone" />
            </Field>
            <Field label="Email" required>
              <input type="email" name="email" value={form.email} onChange={handleChange} className={inputClass} placeholder="Email" />
            </Field>
            <Field label="Address">
              <input name="address" value={form.address} onChange={handleChange} className={inputClass} placeholder="Address" />
            </Field>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="bg-brand-purple text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {createMutation.isPending ? "Submitting..." : "Submit"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="bg-text-primary text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Reset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}