import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Upload } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createTicket } from "../api/tickets";
import { fetchAllAssets } from "../api/assets";
import { fetchAllCompanies } from "../api/companies";
import { fetchTechnicians } from "../api/technicians";
import { useAuth } from "../context/useAuth";
import { getVisibleAssets } from "../utils/assetAccess";

const priorities = ["Critical", "High", "Medium", "Low"];
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const MAX_ATTACHMENT_COUNT = 5;
const companyInfoFields = new Set([
  "department",
  "address",
  "location",
  "contactPerson",
  "contactNumber",
  "contactEmail",
]);

function getAttachmentError(files) {
  if (files.length > MAX_ATTACHMENT_COUNT) return "You can attach up to 5 files.";
  const oversizedFile = files.find((file) => file.size > MAX_ATTACHMENT_SIZE);
  return oversizedFile ? `${oversizedFile.name} exceeds the 10 MB file size limit.` : "";
}

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

const inputClass =
  "w-full px-3 py-2 border border-surface-border rounded-lg text-sm focus:outline-none";
const disabledClass =
  "w-full px-3 py-2 border border-surface-border rounded-lg text-sm bg-surface-page text-text-secondary cursor-not-allowed";

function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / (1024 ** index);
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export default function RaiseTicket() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const {
    role,
    userId,
    companyName: loggedInCompanyName,
    companyId: loggedInCompanyId,
  } = useAuth();
  const followUpTicket = location.state?.followUpTicket;
  const followUpIssue = followUpTicket
    ? [`Follow-up to ticket #${followUpTicket.ticketNumber}`, followUpTicket.issueTitle].filter(Boolean).join("\n")
    : "";
  const [error, setError] = useState("");

  const { data: companies = [] } = useQuery({
    queryKey: ["companies", "all-options"],
    queryFn: fetchAllCompanies,
  });
  const { data: assets = [], isLoading: assetsLoading, isError: assetsError } = useQuery({
    queryKey: ["assets", "all-options"],
    queryFn: fetchAllAssets,
  });
  const { data: technicians = [], isLoading: techniciansLoading, isError: techniciansError } = useQuery({
    queryKey: ["technicians", role === "admin" ? "assignable" : "default"],
    queryFn: () => fetchTechnicians({ assignable: role === "admin" }),
  });

  const [selectedCompanyName, setSelectedCompanyName] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [files, setFiles] = useState([]);
  const [touchedCompanyFields, setTouchedCompanyFields] = useState(() => new Set());
  const activeCompanyId = role === "client" ? loggedInCompanyId : selectedCompanyId;

  const companyRecord = role === "client"
    ? companies.find((company) => company._id === loggedInCompanyId)
    : companies.find((company) => company.companyName === selectedCompanyName);
  const activeCompanyName = companyRecord?.companyName
    || (role === "client" ? loggedInCompanyName : selectedCompanyName);
  const companyDefaults = companyRecord
    ? {
        department: companyRecord.department,
        address: companyRecord.address,
        location: companyRecord.location,
        contactPerson: companyRecord.contactPerson,
        contactNumber: companyRecord.contactNumber,
        contactEmail: companyRecord.contactEmail,
      }
    : { department: "", address: "", location: "", contactPerson: "", contactNumber: "", contactEmail: "" };

  const emptyForm = {
    ...companyDefaults,
    productSerialNumber: followUpTicket?.productInfo?.productSerialNumber || "",
    productName: followUpTicket?.productInfo?.productName || "",
    productDescription: followUpTicket?.productInfo?.productDescription || "",
    productModel: followUpTicket?.productInfo?.productModel || "",
    userName: "",
    userNumber: "",
    userEmail: "",
    userAddress: "",
    project: "",
    priority: "Medium",
    callLoggedDate: new Date().toISOString().split("T")[0],
    callLoggedTime: new Date().toTimeString().slice(0, 5),
    issueReported: followUpIssue,
    assignedTo: "",
  };

  const [form, setForm] = useState(emptyForm);

  const formValues = { ...form };
  if (role === "client") {
    companyInfoFields.forEach((field) => {
      if (!touchedCompanyFields.has(field)) formValues[field] = companyDefaults[field] || "";
    });
  }

  const visibleAssets = getVisibleAssets(assets, { role, companyId: loggedInCompanyId });
  const companyAssets = activeCompanyId
    ? visibleAssets.filter((asset) => String(asset.companyId) === String(activeCompanyId))
    : [];

  const createMutation = useMutation({
    mutationFn: createTicket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      navigate("/tickets");
    },
    onError: (err) => {
      setError(err.response?.data?.error || "Couldn't submit the ticket — check the backend is running and try again.");
    },
  });

  function handleChange(e) {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
    if (companyInfoFields.has(name)) {
      setTouchedCompanyFields((current) => new Set(current).add(name));
    }
  }

  function handleCompanyTyped(e) {
    const name = e.target.value;
    setSelectedCompanyName(name);
    const record = companies.find((company) => company.companyName === name);
    setSelectedCompanyId(record?._id || "");
    setForm({
      ...form,
      department: record?.department || "",
      address: record?.address || "",
      location: record?.location || "",
      contactPerson: record?.contactPerson || "",
      contactNumber: record?.contactNumber || "",
      contactEmail: record?.contactEmail || "",
      productSerialNumber: "",
      productName: "",
      productModel: "",
      productDescription: "",
    });
  }

  function handleProductSelect(e) {
    const serial = e.target.value;
    const asset = companyAssets.find((a) => a.serialNumber === serial);
    if (asset) {
      setForm({
        ...form,
        productSerialNumber: asset.serialNumber,
        productName: asset.assetName,
        productModel: asset.model,
        productDescription: `${asset.type}${asset.configuration ? " — " + asset.configuration : ""}`,
      });
    } else {
      setForm({ ...form, productSerialNumber: "" });
    }
  }

  function handleReset() {
    setForm(emptyForm);
    setSelectedCompanyName("");
    setSelectedCompanyId("");
    setFiles([]);
    setTouchedCompanyFields(new Set());
    setError("");
  }

  function handleSubmit(e) {
    e.preventDefault();

    const attachmentError = getAttachmentError(files);
    if (attachmentError) {
      setError(attachmentError);
      return;
    }

    if (!activeCompanyName) {
      setError(
        role === "client"
          ? "No company detected for this login — please log in again."
          : "Please select a company before submitting."
      );
      return;
    }
    if (!form.issueReported.trim()) {
      setError("Please fill in all required fields marked with *.");
      return;
    }
    setError("");

    const newTicket = {
      ticketInfo: {
        callLoggedDate: form.callLoggedDate,
        callLoggedTime: form.callLoggedTime,
        priority: form.priority,
        status: role === "admin" && form.assignedTo ? "Assigned" : "Un-Assigned",
        issueReported: form.issueReported,
      },
      companyInfo: {
        companyId: activeCompanyId,
        companyName: activeCompanyName,
        department: formValues.department,
        address: formValues.address,
        location: formValues.location,
        contactPerson: formValues.contactPerson,
        contactNumber: formValues.contactNumber,
        contactEmail: formValues.contactEmail,
      },
      userInfo: {
        userName: form.userName,
        userNumber: form.userNumber,
        userEmail: form.userEmail,
        userAddress: form.userAddress,
      },
      productInfo: {
        productName: form.productName,
        productDescription: form.productDescription,
        productModel: form.productModel,
        productSerialNumber: form.productSerialNumber,
      },
      project: form.project,
      assignment: {
        assignedBy: "",
        assignedTo: role === "admin" ? form.assignedTo : "",
        assignedOn: null,
        assignStatus: "Pending",
        actionTaken: "",
        accompaniedBy: "",
      },
      feedback: null,
    };

    if (files.length > 0) {
      const formData = new FormData();
      Object.entries(newTicket).forEach(([key, value]) => {
        formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });
      files.forEach((file) => formData.append("files", file));
      createMutation.mutate(formData);
      return;
    }

    createMutation.mutate(newTicket);
  }

  if (techniciansLoading || assetsLoading) return <p className="text-text-secondary">Loading ticket data...</p>;
  if (techniciansError || assetsError) return <p className="text-status-critical">Couldn't load ticket data. Check the backend is running.</p>;

  return (
    <div className="max-w-4xl">
      <h2 className="text-xl font-semibold text-text-primary mb-6">Raise a ticket</h2>

      <form onSubmit={handleSubmit} className="bg-surface-card border border-surface-border rounded-xl p-6 space-y-6">
        {error && <p className="text-sm text-status-critical">{error}</p>}

        <div>
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
            Company details
          </p>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Company name" required>
              {role === "client" ? (
                <input disabled value={activeCompanyName || "—"} className={disabledClass} />
              ) : (
                <>
                  <input
                    list="company-options"
                    value={selectedCompanyName}
                    onChange={handleCompanyTyped}
                    placeholder="Type to search company..."
                    className={inputClass}
                    autoComplete="off"
                  />
                  <datalist id="company-options">
                    {companies.map((company) => (
                      <option key={company._id} value={company.companyName} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <Field label="Department">
              <input name="department" value={formValues.department} onChange={handleChange} className={inputClass} />
            </Field>
            <Field label="Address">
              {role === "client" ? (
                <input disabled value={formValues.address || "—"} className={disabledClass} />
              ) : (
                <input name="address" value={formValues.address} onChange={handleChange} className={inputClass} />
              )}
            </Field>
            <Field label="Location">
              <input name="location" value={formValues.location} onChange={handleChange} className={inputClass} />
            </Field>
            <Field label="Contact person">
              <input name="contactPerson" value={formValues.contactPerson} onChange={handleChange} className={inputClass} />
            </Field>
            <Field label="Contact number">
              <input name="contactNumber" value={formValues.contactNumber} onChange={handleChange} className={inputClass} />
            </Field>
            <Field label="Contact email">
              <input type="email" name="contactEmail" value={formValues.contactEmail} onChange={handleChange} className={inputClass} required />
            </Field>
          </div>
        </div>

        <div className="border-t border-surface-border pt-5">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
            Product details
          </p>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Product serial number">
              <select value={form.productSerialNumber} onChange={handleProductSelect} className={inputClass}>
                <option value="">-- Select product Slno --</option>
                {companyAssets.map((a) => (
                  <option key={a.serialNumber} value={a.serialNumber}>{a.serialNumber}</option>
                ))}
              </select>
            </Field>
            <Field label="Product name">
              <input name="productName" value={form.productName} onChange={handleChange} className={inputClass} placeholder="Auto-filled after selecting serial number" />
            </Field>
            <Field label="Product model">
              <input name="productModel" value={form.productModel} onChange={handleChange} className={inputClass} />
            </Field>
            <Field label="Product description">
              <input name="productDescription" value={form.productDescription} onChange={handleChange} className={inputClass} />
            </Field>
          </div>
        </div>

        <div className="border-t border-surface-border pt-5">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
            Raised by
          </p>
          <div className="grid grid-cols-3 gap-4">
            <Field label="User name">
              <input name="userName" value={form.userName} onChange={handleChange} className={inputClass} />
            </Field>
            <Field label="User number">
              <input name="userNumber" value={form.userNumber} onChange={handleChange} className={inputClass} />
            </Field>
            <Field label="User email">
              <input type="email" name="userEmail" value={form.userEmail} onChange={handleChange} className={inputClass} />
            </Field>
            <Field label="User address">
              <input name="userAddress" value={form.userAddress} onChange={handleChange} className={inputClass} />
            </Field>
            <Field label="Project">
              <input name="project" value={form.project} onChange={handleChange} className={inputClass} />
            </Field>
          </div>
        </div>

        <div className="border-t border-surface-border pt-5">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
            Ticket details
          </p>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Priority" required>
              <select name="priority" value={form.priority} onChange={handleChange} className={inputClass}>
                {priorities.map((p) => <option key={p}>{p}</option>)}
              </select>
            </Field>
            {role === "admin" && (
              <Field label="Assigned To">
                <select name="assignedTo" value={form.assignedTo} onChange={handleChange} className={inputClass}>
                  <option value="">-- Unassigned --</option>
                  {technicians.map((technician) => (
                    <option key={technician._id} value={technician.name}>
                      {technician.role === "admin"
                        ? `${technician.name}${String(technician._id) === String(userId) ? " (You)" : " - Team Lead"}`
                        : technician.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Call logged date" required>
              <input type="date" name="callLoggedDate" value={form.callLoggedDate} onChange={handleChange} className={inputClass} />
            </Field>
            <Field label="Call logged time" required>
              <input type="time" name="callLoggedTime" value={form.callLoggedTime} onChange={handleChange} className={inputClass} />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Issue reported" required>
              <textarea name="issueReported" value={form.issueReported} onChange={handleChange} rows={3} className={inputClass} placeholder="Describe the issue" />
            </Field>
          </div>
        </div>

        <div className="border-t border-surface-border pt-5">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
            Attachments (optional)
          </p>

          <label
            htmlFor="ticket-attachments-input"
            className="group block cursor-pointer rounded-lg border-2 border-dashed border-surface-border bg-surface-page p-6 text-center transition-colors duration-150 hover:border-brand-purple/60 hover:bg-surface-page/80"
          >
            <input
              id="ticket-attachments-input"
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.log"
              onChange={(e) => {
                const selectedFiles = Array.from(e.target.files || []);
                setFiles(selectedFiles);
                setError(getAttachmentError(selectedFiles));
                e.target.value = "";
              }}
              className="hidden"
            />

            {files.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 text-left">
                  <p className="text-sm font-medium text-text-primary">Selected files</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setFiles([]);
                        setError("");
                    }}
                    className="text-xs font-medium text-text-secondary underline-offset-2 hover:text-brand-purple hover:underline"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 text-left">
                  {files.map((file) => (
                    <span
                      key={`${file.name}-${file.size}`}
                      className="inline-flex items-center gap-2 rounded-full border border-surface-border bg-surface-card px-2.5 py-1 text-xs text-text-primary"
                    >
                      <span className="max-w-[180px] truncate">{file.name}</span>
                      <span className="text-text-secondary">{formatFileSize(file.size)}</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-purple/10 text-brand-purple">
                  <Upload size={20} />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">Click to upload or drag files here</p>
                  <p className="mt-1 text-xs text-text-secondary">
                    Screenshots, PDFs, or log files — up to 10MB each.
                  </p>
                </div>
              </div>
            )}
          </label>
        </div>

        <div className="flex gap-3 border-t border-surface-border pt-5">
          <button
            type="submit"
            disabled={createMutation.isPending || Boolean(getAttachmentError(files))}
            className="bg-brand-purple text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {createMutation.isPending ? (files.length ? "Uploading..." : "Submitting...") : "Submit"}
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
  );
}
