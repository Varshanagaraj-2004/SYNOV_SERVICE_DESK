import { useState } from "react";
import { Download } from "lucide-react";
import { downloadTicketsReport } from "../api/reports";

function getDateRange(preset) {
  const end = new Date();
  const start = new Date();
  if (preset === "30d") start.setDate(end.getDate() - 30);
  else if (preset === "3m") start.setMonth(end.getMonth() - 3);
  else if (preset === "6m") start.setMonth(end.getMonth() - 6);
  else if (preset === "1y") start.setFullYear(end.getFullYear() - 1);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

export default function ReportDownloadButton({ technician, label = "Download Report" }) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const applyPreset = (preset) => {
    const range = getDateRange(preset);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  const handleDownload = async () => {
    setError("");
    setDownloading(true);
    try {
      await downloadTicketsReport({ startDate, endDate, technician });
      setOpen(false);
    } catch {
      setError("Couldn't generate the report. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-brand-purple px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
      >
        <Download size={16} />
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-surface-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-text-primary mb-1">
              {technician ? `Download Report — ${technician}` : "Download Ticket Report"}
            </h3>
            <p className="text-sm text-text-secondary mb-4">Choose a date range to export.</p>

            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { key: "30d", label: "Last 30 Days" },
                { key: "3m", label: "Last 3 Months" },
                { key: "6m", label: "Last 6 Months" },
                { key: "1y", label: "This Year" },
              ].map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyPreset(p.key)}
                  className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-muted transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">End Date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm" />
              </div>
            </div>

            {error && <p className="text-xs text-status-critical mb-3">{error}</p>}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors">
                Cancel
              </button>
              <button
                type="button"
                disabled={!startDate || !endDate || downloading}
                onClick={handleDownload}
                className="rounded-lg bg-brand-purple px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading ? "Generating..." : "Download"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
