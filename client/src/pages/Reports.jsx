import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, LabelList,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import ReportDownloadButton from "../components/ReportDownloadButton";
import { fetchAllTickets } from "../api/tickets";
import { fetchTechnicians } from "../api/technicians";
import { fetchTopCompanies } from "../api/reports";

const PURPLE = "#7B3F9E";
const BLUE = "#2E5AA8";

const statusColorMap = {
  "Un-Assigned": "#6B7280",
  Assigned: "#2E5AA8",
  Closed: "#22C55E",
  Cancelled: "#9CA3AF",
  "Re-Assigned": "#7B3F9E",
};

function ChartCard({ title, children }) {
  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-4">{title}</h3>
      {children}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-5">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="text-3xl font-semibold mt-2 text-text-primary">{value}</p>
    </div>
  );
}

function getStartOfWeek(date) {
  const start = new Date(date);
  const day = start.getDay();
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return start;
}

function formatWeekLabel(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getTicketVolumeTrend(tickets) {
  const currentWeek = getStartOfWeek(new Date());
  const weeks = Array.from({ length: 4 }, (_, index) => {
    const weekStart = new Date(currentWeek);
    weekStart.setDate(currentWeek.getDate() - (3 - index) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    return { weekStart, weekEnd, week: formatWeekLabel(weekStart), tickets: 0 };
  });

  tickets.forEach((ticket) => {
    const createdAt = new Date(ticket.createdAt);
    const bucket = weeks.find(({ weekStart, weekEnd }) => createdAt >= weekStart && createdAt < weekEnd);
    if (bucket) bucket.tickets += 1;
  });

  return weeks.map(({ week, tickets: count }) => ({ week, tickets: count }));
}

function getResolutionTimeByPriority(tickets) {
  const totals = {};

  tickets.forEach((ticket) => {
    if (ticket.ticketInfo.status !== "Closed" || !ticket.createdAt || !ticket.resolvedAt) return;
    const createdAt = new Date(ticket.createdAt).getTime();
    const resolvedAt = new Date(ticket.resolvedAt).getTime();
    if (!Number.isFinite(createdAt) || !Number.isFinite(resolvedAt) || resolvedAt < createdAt) return;

    const priority = ticket.ticketInfo.priority;
    if (!totals[priority]) totals[priority] = { totalHours: 0, count: 0 };
    totals[priority].totalHours += (resolvedAt - createdAt) / (1000 * 60 * 60);
    totals[priority].count += 1;
  });

  return Object.entries(totals).map(([priority, data]) => ({
    priority,
    avgHours: Number((data.totalHours / data.count).toFixed(1)),
  }));
}

export default function Reports() {
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());

  const { data: tickets = [], isLoading, isError } = useQuery({
    queryKey: ["tickets"],
    queryFn: fetchAllTickets,
  });
  const { data: technicians = [], isLoading: techniciansLoading, isError: techniciansError } = useQuery({
    queryKey: ["technicians"],
    queryFn: fetchTechnicians,
  });
  const { data: topCompanies = [], isLoading: topCompaniesLoading, isError: topCompaniesError } = useQuery({
    queryKey: ["top-companies", selectedMonth, selectedYear],
    queryFn: () => fetchTopCompanies({ month: selectedMonth, year: selectedYear }),
  });

  const totalTickets = tickets.length;
  const closedTickets = tickets.filter((t) => t.ticketInfo.status === "Closed").length;
  const ratedTickets = tickets.filter((t) => t.feedback);
  const avgCsatAll =
    ratedTickets.reduce((sum, t) => sum + t.feedback.rating, 0) / (ratedTickets.length || 1);

  const statusCounts = Object.keys(statusColorMap).map((status) => ({
    status,
    count: tickets.filter((t) => t.ticketInfo.status === status).length,
  }));

  const technicianPerformance = technicians.map((tech) => {
    const assigned = tickets.filter((t) => t.assignment.assignedTo === tech.name);
    const resolved = assigned.filter((t) => t.ticketInfo.status === "Closed").length;
    const rated = assigned.filter((t) => t.feedback);
    const avgCsat = rated.length
      ? rated.reduce((sum, t) => sum + t.feedback.rating, 0) / rated.length
      : 0;

    return { name: tech.name, resolved, avgCsat: Number(avgCsat.toFixed(1)) };
  });
  const ticketVolumeTrend = getTicketVolumeTrend(tickets);
  const resolutionTimeByPriority = getResolutionTimeByPriority(tickets);
  const monthOptions = Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: new Date(2024, index, 1).toLocaleString("en-US", { month: "long" }) }));
  const yearOptions = Array.from({ length: 6 }, (_, index) => currentDate.getFullYear() - 5 + index);

  if (isLoading || techniciansLoading) return <p className="text-text-secondary">Loading reports...</p>;
  if (isError || techniciansError) return <p className="text-status-critical">Couldn't load report data. Check the backend is running.</p>;

  return (
    <div>
      <div className="flex justify-end gap-2 mb-4">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-brand-purple px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          <Download size={16} />
          Download PDF
        </button>
        <ReportDownloadButton label="Download Excel" />
      </div>

      <div id="analytics-print-area">
        <div className="report-export-block">
          <h2 className="text-xl font-semibold text-text-primary mb-1">Reports</h2>
          <p className="text-sm text-text-secondary mb-6">
            Ticket volume, resolution-time, and technician performance overview calculated from current ticket data.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 report-export-block">
          <StatCard label="Total Tickets" value={totalTickets} />
          <StatCard label="Closed" value={closedTickets} />
          <StatCard label="Active Technicians" value={technicians.length} />
          <StatCard label="Avg CSAT" value={ratedTickets.length ? `${avgCsatAll.toFixed(1)} / 5` : "—"} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 report-export-block">
          <ChartCard title="Top 5 Companies This Month">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <select
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(Number(event.target.value))}
                className="rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-sm text-text-primary focus:outline-none"
              >
                {monthOptions.map((month) => (
                  <option key={month.value} value={month.value}>{month.label}</option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(event) => setSelectedYear(Number(event.target.value))}
                className="rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-sm text-text-primary focus:outline-none"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            {topCompaniesLoading ? (
              <div className="space-y-3 pt-2">
                {[...Array(5)].map((_, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="h-4 w-28 animate-pulse rounded bg-surface-page" />
                    <div className="h-4 flex-1 animate-pulse rounded bg-surface-page" />
                  </div>
                ))}
              </div>
            ) : topCompaniesError ? (
              <p className="text-sm text-status-critical">Couldn't load the top companies report.</p>
            ) : topCompanies.length === 0 ? (
              <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-surface-border bg-surface-page/60">
                <p className="text-sm text-text-secondary">No tickets were raised for this month.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topCompanies} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="companyName" width={140} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="ticketCount" fill={PURPLE} radius={[0, 6, 6, 0]}>
                    {topCompanies.map((entry) => (
                      <Cell key={entry.companyId} fill={PURPLE} />
                    ))}
                    <LabelList dataKey="ticketCount" position="right" fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Ticket Status Distribution">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={statusCounts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {statusCounts.map((entry) => (
                    <Cell key={entry.status} fill={statusColorMap[entry.status]} />
                  ))}
                  <LabelList dataKey="count" position="top" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Ticket Volume — Last 4 Weeks">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={ticketVolumeTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="tickets" stroke={PURPLE} strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Ticket Status Distribution">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={statusCounts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {statusCounts.map((entry) => (
                    <Cell key={entry.status} fill={statusColorMap[entry.status]} />
                  ))}
                  <LabelList dataKey="count" position="top" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Avg Resolution Time by Priority (hrs)">
            {resolutionTimeByPriority.length === 0 ? (
              <div className="flex h-60 items-center justify-center rounded-lg border border-dashed border-surface-border bg-surface-page/60">
                <p className="text-sm text-text-secondary">No closed tickets yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={resolutionTimeByPriority}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="priority" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="avgHours" fill={BLUE} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Tickets Resolved per Technician">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={technicianPerformance} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={120} />
                <Tooltip />
                <Bar dataKey="resolved" fill={PURPLE} radius={[0, 6, 6, 0]}>
                  <LabelList dataKey="resolved" position="right" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Avg CSAT per Technician">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={technicianPerformance} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={120} />
                <Tooltip />
                <Bar dataKey="avgCsat" fill={BLUE} radius={[0, 6, 6, 0]}>
                  <LabelList dataKey="avgCsat" position="right" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}