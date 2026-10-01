import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAllCompanies } from "../api/companies";
import { createClientUser } from "../api/users";

const inputClass =
  "w-full px-3 py-2 border border-surface-border rounded-lg text-sm focus:outline-none";

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

const emptyForm = {
  companyId: "",
  name: "",
  department: "",
  email: "",
  phone: "",
  address: "",
};

export default function AddClientUser() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState(() => ({
    ...emptyForm,
    companyId: searchParams.get("companyId") || "",
  }));
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { data: companies = [], isLoading, isError } = useQuery({
    queryKey: ["companies", "all-options"],
    queryFn: fetchAllCompanies,
  });

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handleReset() {
    setForm(emptyForm);
    setError("");
    setSuccess("");
  }

  const createMutation = useMutation({
    mutationFn: createClientUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companyContacts"] });
      setSuccess("User created — login credentials have been emailed to them.");
      setForm(emptyForm);
      setTimeout(() => navigate("/customers"), 900);
    },
    onError: (err) => {
      const message = err.response?.data?.error === "A user with this email already exists"
        ? "A user with this email already exists"
        : "Couldn't create the user — check the backend is running and try again.";
      setError(message);
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.companyId) {
      setError("Company is required.");
      return;
    }
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (!form.phone.trim()) {
      setError("Phone number is required");
      return;
    }

    setError("");
    setSuccess("");

    createMutation.mutate({
      companyId: form.companyId,
      name: form.name.trim(),
      department: form.department.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
    });
  }

  if (isLoading) return <p className="text-text-secondary">Loading companies...</p>;
  if (isError) return <p className="text-status-critical">Couldn't load companies. Check the backend is running.</p>;

  return (
    <div className="max-w-4xl">
      <Link to="/customers" className="text-sm text-text-secondary hover:text-brand-purple mb-4 inline-block">
        ← Back to customers
      </Link>

      <div className="bg-surface-card border border-surface-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-brand-purple mb-6">Add Client User</h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <p className="text-sm text-status-critical">{error}</p>}
          {success && <p className="text-sm text-status-closed">{success}</p>}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Company" required>
              <select
                name="companyId"
                value={form.companyId}
                onChange={handleChange}
                className={inputClass}
              >
                <option value="">Select company</option>
                {companies.map((company) => (
                  <option key={company._id} value={company._id}>
                    {company.companyName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Name" required>
              <input name="name" value={form.name} onChange={handleChange} className={inputClass} placeholder="Full name" />
            </Field>
            <Field label="Department">
              <input name="department" value={form.department} onChange={handleChange} className={inputClass} placeholder="Department" />
            </Field>
            <Field label="Email" required>
              <input type="email" name="email" value={form.email} onChange={handleChange} className={inputClass} placeholder="Email" />
            </Field>
            <Field label="Phone" required>
              <input name="phone" value={form.phone} onChange={handleChange} className={inputClass} placeholder="Phone" />
            </Field>
            <Field label="Address">
              <input name="address" value={form.address} onChange={handleChange} className={inputClass} placeholder="Address" />
            </Field>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="bg-brand-purple text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createMutation.isPending ? "Creating..." : "Create User"}
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
