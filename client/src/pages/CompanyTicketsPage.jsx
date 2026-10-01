import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, CheckCircle2, FolderOpen, RotateCcw, XCircle } from "lucide-react";
import { fetchCompanyById } from "../api/companies";
import { fetchTicketStats, exportCompanyTickets } from "../api/tickets";
import TicketList from "./TicketList";

function StatCard({ label, value, icon: Icon, accentColor }) {
  return (
    <div className="group text-left bg-surface-card border border-surface-border rounded-xl p-5 overflow-hidden relative">
      <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: accentColor }} />
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">{label}</p>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accentColor}1A` }}>
          <Icon size={18} style={{ color: accentColor }} />
        </div>
      </div>
      <p className="text-3xl font-semibold mt-3 text-text-primary">{value}</p>
    </div>
  );
}

export default function CompanyTicketsPage() {
  const { companyId } = useParams();

  const { data: company, isLoading: companyLoading, isError: companyError } = useQuery({
    queryKey: ["company", companyId],
    queryFn: () => fetchCompanyById(companyId),
    enabled: Boolean(companyId),
  });

  const { data: ticketStats, isLoading: ticketsLoading, isError: ticketsError } = useQuery({
    queryKey: ["ticketStats", companyId],
    queryFn: () => fetchTicketStats({ companyId }),
    enabled: Boolean(companyId),
  });

  const stats = useMemo(() => {
    const byStatus = ticketStats?.byStatus || {};
    return {
      open: Object.entries(byStatus)
        .filter(([status]) => !["Closed", "Cancelled"].includes(status))
        .reduce((sum, [, count]) => sum + count, 0),
      reopened: ticketStats?.reopened || 0,
      resolved: byStatus.Closed || 0,
      closed: byStatus.Cancelled || 0,
    };
  }, [ticketStats]);

  const downloadReport = async () => {
    try {
      await exportCompanyTickets(companyId);
    } catch (error) {
      console.error("Unable to download company report", error);
    }
  };

  if (companyLoading || ticketsLoading) return <p className="text-text-secondary">Loading company tickets...</p>;
  if (companyError || ticketsError || !company) {
    return <p className="text-status-critical">Couldn't load this company report.</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-purple/10 text-brand-purple">
            <Building2 size={20} />
          </div>
          <div>
            <p className="text-sm text-text-secondary">Company tickets</p>
            <h2 className="text-2xl font-semibold text-text-primary">{company.companyName}</h2>
          </div>
        </div>

        <button
          type="button"
          onClick={downloadReport}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          Download Report
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Open" value={stats.open} icon={FolderOpen} accentColor="#2563EB" />
        <StatCard label="Reopened" value={stats.reopened} icon={RotateCcw} accentColor="#F59E0B" />
        <StatCard label="Resolved" value={stats.resolved} icon={CheckCircle2} accentColor="#16A34A" />
        <StatCard label="Closed" value={stats.closed} icon={XCircle} accentColor="#9CA3AF" />
      </div>

      <TicketList companyId={companyId} hideHeader />
    </div>
  );
}
