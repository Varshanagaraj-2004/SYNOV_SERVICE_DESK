import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchAllTickets } from "../api/tickets";
import { fetchTechnicians } from "../api/technicians";
import ReportDownloadButton from "../components/ReportDownloadButton";

function StatCard({ label, value }) {
  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-5">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="text-3xl font-semibold mt-2 text-text-primary">{value}</p>
    </div>
  );
}

export default function TechnicianProfile() {
  const { name } = useParams();
  const decodedName = decodeURIComponent(name);
  const { data: technicians = [], isLoading, isError } = useQuery({
    queryKey: ["technicians"],
    queryFn: fetchTechnicians,
  });
  const { data: tickets = [], isLoading: ticketsLoading, isError: ticketsError } = useQuery({
    queryKey: ["tickets"],
    queryFn: fetchAllTickets,
  });
  const technician = technicians.find((t) => t.name === decodedName);

  const assignedTickets = tickets.filter(
    (t) => t.assignment.assignedTo === decodedName
  );
  const resolvedTickets = assignedTickets.filter(
    (t) => t.ticketInfo.status === "Closed"
  );
  const openTickets = assignedTickets.filter(
    (t) => !["Closed", "Cancelled"].includes(t.ticketInfo.status)
  );

  const ratedTickets = assignedTickets.filter((t) => t.feedback);
  const avgCsat =
    ratedTickets.length > 0
      ? (
          ratedTickets.reduce((sum, t) => sum + t.feedback.rating, 0) /
          ratedTickets.length
        ).toFixed(1)
      : "—";

  if (isLoading || ticketsLoading) return <p className="text-text-secondary">Loading technician...</p>;
  if (isError || ticketsError || !technician) {
    return (
      <div>
        <p className="text-text-secondary">Technician not found.</p>
        <Link to="/technicians" className="text-brand-purple text-sm">← Back to technicians</Link>
      </div>
    );
  }

  return (
    <div>
      <Link to="/technicians" className="text-sm text-text-secondary hover:text-brand-purple mb-4 inline-block">
        ← Back to technicians
      </Link>

      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-full bg-brand-purple text-white flex items-center justify-center text-lg font-semibold">
          {technician.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
        </div>
        <div>
          <h2 className="text-xl font-semibold text-text-primary">{technician.name}</h2>
          <p className="text-sm text-text-secondary">{technician.designation} · {technician.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Assigned" value={assignedTickets.length} />
        <StatCard label="Open" value={openTickets.length} />
        <StatCard label="Resolved" value={resolvedTickets.length} />
        <StatCard label="Avg. CSAT" value={avgCsat === "—" ? "—" : `${avgCsat} / 5`} />
      </div>

      <div className="mb-8">
        <ReportDownloadButton technician={decodedName} />
      </div>

      <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-border">
          <p className="text-sm font-semibold text-text-primary">Assigned tickets</p>
        </div>
        {assignedTickets.length === 0 ? (
          <p className="px-5 py-4 text-sm text-text-secondary">No tickets assigned yet.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {assignedTickets.map((t) => (
                <tr key={t.id} className="border-b border-surface-border last:border-0">
                  <td className="px-5 py-3 font-medium text-brand-purple">{t.id}</td>
                  <td className="px-5 py-3 text-text-primary">{t.companyInfo.companyName}</td>
                  <td className="px-5 py-3 text-text-secondary">{t.ticketInfo.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}