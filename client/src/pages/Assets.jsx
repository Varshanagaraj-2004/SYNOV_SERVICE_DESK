import { useCallback, useEffect, useState } from "react";
import { Search, Plus, Pencil, Trash2, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAsset, deleteAsset, fetchAssets, updateAsset } from "../api/assets";
import { fetchAllCompanies } from "../api/companies";
import { useAuth } from "../context/useAuth";
import useKeyedState from "../hooks/useKeyedState";

const statusColors = {
  "In Use": "bg-status-assigned",
  "In Storage": "bg-status-unassigned",
  "Under Repair": "bg-status-high",
  Retired: "bg-status-cancelled",
};

const statusOptions = Object.keys(statusColors);
const ROWS_PER_PAGE = 10;
const emptyAsset = {
  crmId: "",
  assetName: "",
  type: "",
  configuration: "",
  model: "",
  serialNumber: "",
  companyId: "",
  assignedTo: "",
  location: "",
  purchaseDate: "",
  warrantyExpiry: "",
  status: "In Use",
};

function Badge({ label, colorClass }) {
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium text-white ${colorClass}`}>
      {label}
    </span>
  );
}

const selectClass =
  "px-3 py-2 border border-surface-border rounded-lg text-sm text-text-primary bg-surface-card focus:outline-none";

export default function Assets() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const canEdit = isAdmin || role === "it_staff";
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useKeyedState(JSON.stringify([query, statusFilter]), () => 1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [assetForm, setAssetForm] = useState(emptyAsset);
  const [formError, setFormError] = useState("");

  const closeAssetModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingAsset(null);
    setAssetForm(emptyAsset);
    setFormError("");
  }, []);

  useEffect(() => {
    if (!isModalOpen) return undefined;

    function handleEscape(event) {
      if (event.key === "Escape") closeAssetModal();
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isModalOpen, closeAssetModal]);

  const assetParams = {
    page,
    limit: ROWS_PER_PAGE,
    q: query.trim() || undefined,
    status: statusFilter || undefined,
  };
  const { data: assetPage, isLoading, isError } = useQuery({
    queryKey: ["assets", assetParams],
    queryFn: ({ queryKey }) => fetchAssets(queryKey[1]),
  });
  const assets = assetPage?.items || [];
  const totalAssets = assetPage?.total || 0;
  const totalPages = assetPage?.pages || 0;
  const currentPage = assetPage?.page || page;
  const { data: companies = [] } = useQuery({
    queryKey: ["companies", "all-options"],
    queryFn: fetchAllCompanies,
    enabled: isAdmin,
  });

  async function refreshAssets() {
    await queryClient.invalidateQueries({ queryKey: ["assets"] });
    await queryClient.invalidateQueries({ queryKey: ["assets", "all-options"] });
  }

  const createMutation = useMutation({
    mutationFn: createAsset,
    onSuccess: async () => {
      await refreshAssets();
      closeAssetModal();
    },
    onError: (error) => setFormError(error.response?.data?.error || "Couldn't create this asset."),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateAsset(id, payload),
    onSuccess: async () => {
      await refreshAssets();
      closeAssetModal();
    },
    onError: (error) => setFormError(error.response?.data?.error || "Couldn't update this asset."),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteAsset,
    onSuccess: refreshAssets,
  });

  const hasActiveFilters = query || statusFilter;

  function clearFilters() {
    setQuery("");
    setStatusFilter("");
  }

  function openCreateModal() {
    setEditingAsset(null);
    setAssetForm(emptyAsset);
    setFormError("");
    setIsModalOpen(true);
  }

  function openEditModal(asset) {
    setEditingAsset(asset);
    setAssetForm({
      ...emptyAsset,
      ...asset,
      companyId: String(asset.companyId?._id || asset.companyId || ""),
      purchaseDate: asset.purchaseDate ? new Date(asset.purchaseDate).toISOString().slice(0, 10) : "",
      warrantyExpiry: asset.warrantyExpiry ? new Date(asset.warrantyExpiry).toISOString().slice(0, 10) : "",
    });
    setFormError("");
    setIsModalOpen(true);
  }

  function handleAssetSubmit(event) {
    event.preventDefault();
    setFormError("");
    const assetPayload = { ...assetForm };
    if (assetPayload.crmId === "") delete assetPayload.crmId;
    if (editingAsset) {
      const payload = isAdmin
        ? assetPayload
        : { status: assetForm.status, location: assetForm.location, assignedTo: assetForm.assignedTo };
      updateMutation.mutate({ id: editingAsset._id, payload });
      return;
    }
    createMutation.mutate({
      ...assetPayload,
      purchaseDate: assetForm.purchaseDate || null,
      warrantyExpiry: assetForm.warrantyExpiry || null,
    });
  }

  if (isLoading) return <p className="text-text-secondary">Loading assets...</p>;
  if (isError) return <p className="text-status-critical">Couldn't load assets. Check the backend is running.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Assets</h2>
          <p className="text-sm text-text-secondary mt-1">
            {assets.length} of {totalAssets} assets on this page
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-purple px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus size={16} /> Add Asset
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by asset ID, name, serial number, company..."
            className="w-full pl-9 pr-3 py-2 border border-surface-border rounded-lg text-sm focus:outline-none"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-text-secondary hover:text-brand-purple"
          >
            Clear
          </button>
        )}
      </div>

      <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="bg-surface-muted text-left text-text-secondary text-xs uppercase tracking-wide">
              <th className="px-5 py-3 font-medium">Asset ID</th>
              <th className="px-5 py-3 font-medium">Asset Name</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Company</th>
              <th className="px-5 py-3 font-medium">Assigned To</th>
              <th className="px-5 py-3 font-medium">Serial Number</th>
              <th className="px-5 py-3 font-medium">Warranty</th>
              <th className="px-5 py-3 font-medium">Status</th>
              {canEdit && <th className="px-5 py-3 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr
                key={asset._id || asset.crmId}
                className="border-t border-surface-border hover:bg-surface-muted/50 transition-colors"
              >
                <td className="px-5 py-4 font-medium text-brand-purple">{asset.crmId || asset._id}</td>
                <td className="px-5 py-4 text-text-primary">{asset.assetName}</td>
                <td className="px-5 py-4 text-text-secondary">{asset.type}</td>
                <td className="px-5 py-4 text-text-primary">{asset.company}</td>
                <td className="px-5 py-4 text-text-secondary">{asset.assignedTo}</td>
                <td className="px-5 py-4 text-text-secondary">{asset.serialNumber}</td>
                <td className="px-5 py-4 text-text-secondary">{asset.warrantyStatus || "Unknown"}</td>
                <td className="px-5 py-4">
                  <Badge label={asset.status} colorClass={statusColors[asset.status]} />
                </td>
                {canEdit && (
                  <td className="px-5 py-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button type="button" onClick={() => openEditModal(asset)} aria-label={`Edit ${asset.assetName}`} className="rounded-md border border-surface-border p-2 text-text-secondary hover:text-brand-purple">
                        <Pencil size={15} />
                      </button>
                      {isAdmin && (
                        <button type="button" onClick={() => window.confirm(`Delete ${asset.assetName}?`) && deleteMutation.mutate(asset._id)} aria-label={`Delete ${asset.assetName}`} className="rounded-md border border-status-critical/30 p-2 text-status-critical">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}

            {assets.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 9 : 8} className="px-5 py-8 text-center text-text-secondary">
                  No assets match your search.
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>
      </div>

      {totalAssets > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-text-secondary">
            Showing {(currentPage - 1) * ROWS_PER_PAGE + 1}–{Math.min(currentPage * ROWS_PER_PAGE, totalAssets)} of {totalAssets}
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

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeAssetModal();
          }}
        >
          <form onSubmit={handleAssetSubmit} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-surface-border bg-surface-card p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-text-primary">{editingAsset ? "Edit asset" : "Add asset"}</h3>
              <button type="button" onClick={closeAssetModal} aria-label="Close asset form" className="text-text-secondary hover:text-text-primary"><X size={20} /></button>
            </div>
            {formError && <p role="alert" className="mb-4 text-sm text-status-critical">{formError}</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {isAdmin && <>
                <label className="text-xs text-text-secondary">Asset name<input required value={assetForm.assetName} onChange={(event) => setAssetForm({ ...assetForm, assetName: event.target.value })} className={`${selectClass} mt-1 w-full`} /></label>
                <label className="text-xs text-text-secondary">Serial number<input required value={assetForm.serialNumber} onChange={(event) => setAssetForm({ ...assetForm, serialNumber: event.target.value })} className={`${selectClass} mt-1 w-full`} /></label>
                <label className="text-xs text-text-secondary">Company<select required value={assetForm.companyId} onChange={(event) => setAssetForm({ ...assetForm, companyId: event.target.value })} className={`${selectClass} mt-1 w-full`}><option value="">Select company</option>{companies.map((company) => <option key={company._id} value={company._id}>{company.companyName}</option>)}</select></label>
                <label className="text-xs text-text-secondary">Asset ID<input value={assetForm.crmId || ""} onChange={(event) => setAssetForm({ ...assetForm, crmId: event.target.value })} className={`${selectClass} mt-1 w-full`} /></label>
                <label className="text-xs text-text-secondary">Type<input value={assetForm.type || ""} onChange={(event) => setAssetForm({ ...assetForm, type: event.target.value })} className={`${selectClass} mt-1 w-full`} /></label>
                <label className="text-xs text-text-secondary">Model<input value={assetForm.model || ""} onChange={(event) => setAssetForm({ ...assetForm, model: event.target.value })} className={`${selectClass} mt-1 w-full`} /></label>
                <label className="text-xs text-text-secondary">Configuration<input value={assetForm.configuration || ""} onChange={(event) => setAssetForm({ ...assetForm, configuration: event.target.value })} className={`${selectClass} mt-1 w-full`} /></label>
                <label className="text-xs text-text-secondary">Purchase date<input type="date" value={assetForm.purchaseDate || ""} onChange={(event) => setAssetForm({ ...assetForm, purchaseDate: event.target.value })} className={`${selectClass} mt-1 w-full`} /></label>
                <label className="text-xs text-text-secondary">Warranty expiry<input type="date" value={assetForm.warrantyExpiry || ""} onChange={(event) => setAssetForm({ ...assetForm, warrantyExpiry: event.target.value })} className={`${selectClass} mt-1 w-full`} /></label>
              </>}
              <label className="text-xs text-text-secondary">Status<select value={assetForm.status} onChange={(event) => setAssetForm({ ...assetForm, status: event.target.value })} className={`${selectClass} mt-1 w-full`}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
              <label className="text-xs text-text-secondary">Location<input value={assetForm.location || ""} onChange={(event) => setAssetForm({ ...assetForm, location: event.target.value })} className={`${selectClass} mt-1 w-full`} /></label>
              <label className="text-xs text-text-secondary">Assigned to<input value={assetForm.assignedTo || ""} onChange={(event) => setAssetForm({ ...assetForm, assignedTo: event.target.value })} className={`${selectClass} mt-1 w-full`} /></label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeAssetModal} className="rounded-lg border border-surface-border px-4 py-2 text-sm text-text-secondary">Cancel</button>
              <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="rounded-lg bg-brand-purple px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save asset"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}