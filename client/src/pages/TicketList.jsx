import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, MessageSquare, Globe, Mail, Code2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchTickets, fetchMessages, sendMessage, markMessagesRead } from "../api/tickets";
import ReportDownloadButton from "../components/ReportDownloadButton";
import { useAuth } from "../context/useAuth";
import useKeyedState from "../hooks/useKeyedState";

const priorityColors = {
  Critical: "bg-status-critical",
  High: "bg-status-high",
  Medium: "bg-status-medium",
  Low: "bg-status-low",
};

const statusColors = {
  New: "bg-sky-600",
  "Un-Assigned": "bg-status-unassigned",
  Assigned: "bg-status-assigned",
  Closed: "bg-status-closed",
  Cancelled: "bg-status-cancelled",
  "Re-Assigned": "bg-status-reassigned",
};

const priorityOptions = Object.keys(priorityColors);
const statusOptions = Object.keys(statusColors);
const sourceOptions = ["Portal", "Email", "API"];
const ROWS_PER_PAGE = 10;

function getTicketSourceValue(source) {
  const normalized = String(source || "").toLowerCase();
  if (["email", "mail"].includes(normalized)) return "Email";
  if (["api", "rest", "integration"].includes(normalized)) return "API";
  return "Portal";
}

function SourceBadge({ source }) {
  const value = getTicketSourceValue(source);
  const config = {
    Portal: { icon: Globe, className: "bg-sky-600 text-white" },
    Email: { icon: Mail, className: "bg-emerald-600 text-white" },
    API: { icon: Code2, className: "bg-violet-600 text-white" },
  };

  const Icon = config[value]?.icon || Globe;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium ${config[value]?.className || "bg-slate-600 text-white"}`}>
      <Icon size={12} />
      {value}
    </span>
  );
}

function formatRelativeDuration(ms) {
  const totalMinutes = Math.max(0, Math.round(Math.abs(ms) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

function getSlaBadge(ticket) {
  if (!ticket || ["Closed", "Cancelled"].includes(ticket.ticketInfo?.status)) return null;
  if (!ticket.slaDueAt) return null;

  const dueAt = new Date(ticket.slaDueAt).getTime();
  const now = Date.now();
  const timeRemaining = dueAt - now;

  if (timeRemaining <= 0) {
    return {
      label: `⚠️ ${formatRelativeDuration(Math.abs(timeRemaining))} ago`,
      className: "bg-status-critical text-white",
    };
  }

  if (timeRemaining < 60 * 60 * 1000) {
    return {
      label: `Due ${formatRelativeDuration(timeRemaining)}`,
      className: "bg-amber-500 text-white",
    };
  }

  return {
    label: `Due ${formatRelativeDuration(timeRemaining)}`,
    className: "bg-emerald-600 text-white",
  };
}

function Badge({ label, colorClass }) {
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium text-white ${colorClass}`}>
      {label}
    </span>
  );
}

const selectClass =
  "px-3 py-2 border border-surface-border rounded-lg text-sm text-text-primary bg-surface-card focus:outline-none";

export default function TicketList({ companyId = null, hideHeader = false }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlStatus = searchParams.get("status");
  const urlReopened = searchParams.get("reopened") === "true";
  const { role, userId } = useAuth();
  const queryClient = useQueryClient();
  const [chatTicketId, setChatTicketId] = useState(null);
  const [messageText, setMessageText] = useState("");

  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState(urlStatus || "");
  const [sourceFilter, setSourceFilter] = useState("");
  const [reopenedOnly, setReopenedOnly] = useState(urlReopened);
  const pageKey = JSON.stringify([query, priorityFilter, statusFilter, sourceFilter, reopenedOnly, companyId]);
  const [page, setPage] = useKeyedState(pageKey, () => 1);
  const ticketParams = {
    page,
    limit: ROWS_PER_PAGE,
    q: query.trim() || undefined,
    priority: priorityFilter || undefined,
    status: statusFilter || undefined,
    source: sourceFilter || undefined,
    reopened: reopenedOnly ? true : undefined,
    companyId: companyId || undefined,
  };
  const { data: ticketPage, isLoading, isError } = useQuery({
    queryKey: ["tickets", ticketParams],
    queryFn: ({ queryKey }) => fetchTickets(queryKey[1]),
    refetchInterval: () => (document.hidden ? false : 30_000),
    refetchOnWindowFocus: true,
  });
  const tickets = ticketPage?.items || [];
  const totalTickets = ticketPage?.total || 0;
  const totalPages = ticketPage?.pages || 0;
  const currentPage = ticketPage?.page || page;
  const messagesQuery = useQuery({
    queryKey: ["messages", chatTicketId],
    queryFn: () => fetchMessages(chatTicketId),
    enabled: Boolean(chatTicketId),
  });
  const markReadMutation = useMutation({
    mutationFn: markMessagesRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recentMessages"] }),
  });
  const messageMutation = useMutation({
    mutationFn: (text) => sendMessage(chatTicketId, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", chatTicketId] });
      setMessageText("");
    },
  });

  const hasActiveFilters = query || priorityFilter || statusFilter || sourceFilter || reopenedOnly;
  const activeChatTicket = tickets.find((ticket) => ticket._id === chatTicketId);
  const roleLabels = {
    client: "Client",
    it_staff: "Technician",
    admin: "Admin",
  };

  function clearFilters() {
    setQuery("");
    setPriorityFilter("");
    setStatusFilter("");
    setSourceFilter("");
    setReopenedOnly(false);
  }

  function handleSendMessage(e) {
    e.preventDefault();
    const text = messageText.trim();
    if (!text || messageMutation.isPending) return;
    messageMutation.mutate(text);
  }

  if (isLoading) return <p className="text-text-secondary">Loading tickets...</p>;
  if (isError) return <p className="text-status-critical">Couldn't load tickets. Check the backend is running.</p>;

  return (
    <div>
      {!hideHeader && (
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-text-primary">Tickets</h2>
            <p className="text-sm text-text-secondary mt-1">
              {totalTickets} tickets found · {tickets.length} shown on this page
            </p>
          </div>
          <div className="flex items-center gap-3">
            {role === "admin" && <ReportDownloadButton />}
            {role !== "it_staff" && (
              <button
                onClick={() => navigate("/raise-ticket")}
                className="bg-brand-purple text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                + Raise Ticket
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by ticket number or issue..."
            className="w-full pl-9 pr-3 py-2 border border-surface-border rounded-lg text-sm focus:outline-none"
          />
        </div>

        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className={selectClass}>
          <option value="">All priorities</option>
          {priorityOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
          <option value="">All statuses</option>
          {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className={selectClass}>
          <option value="">All sources</option>
          {sourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}
        </select>

        <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={reopenedOnly}
            onChange={(event) => setReopenedOnly(event.target.checked)}
            className="h-4 w-4 accent-amber-500"
          />
          Reopened only
        </label>

        {hasActiveFilters && (
          <button onClick={clearFilters} className="text-sm text-text-secondary hover:text-brand-purple">
            Clear
          </button>
        )}
      </div>

      <div className="bg-surface-card border border-surface-border rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-page border-b border-surface-border text-left">
              <th className="px-4 py-3 font-medium text-text-secondary">Ticket #</th>
              <th className="px-4 py-3 font-medium text-text-secondary">Priority</th>
              <th className="px-4 py-3 font-medium text-text-secondary">Status</th>
              <th className="px-4 py-3 font-medium text-text-secondary">Source</th>
              <th className="px-4 py-3 font-medium text-text-secondary">SLA</th>
              <th className="px-4 py-3 font-medium text-text-secondary">Company</th>
              <th className="px-4 py-3 font-medium text-text-secondary">Assigned To</th>
              <th className="px-4 py-3 font-medium text-text-secondary">Logged On</th>
              <th className="px-4 py-3 font-medium text-text-secondary">Chat</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => {
              const chatActive = Boolean(ticket.assignment.assignedTo);
              const chatReadOnly = ticket.ticketInfo.status === "Closed";
              const slaBadge = getSlaBadge(ticket);
              return (
                <tr
                  key={ticket._id}
                  onClick={() => navigate(`/tickets/${ticket._id}`)}
                  className="border-b border-surface-border last:border-0 hover:bg-surface-page cursor-pointer"
                >
                <td className="px-4 py-3 whitespace-nowrap text-text-primary">{ticket.ticketNumber || ticket._id}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <Badge label={ticket.ticketInfo.priority} colorClass={priorityColors[ticket.ticketInfo.priority]} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex flex-col items-start gap-1">
                    <Badge label={ticket.ticketInfo.status} colorClass={statusColors[ticket.ticketInfo.status]} />
                    {ticket.reopenCount > 0 && ticket.ticketInfo.status !== "Closed" && (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                        Reopened{ticket.reopenCount > 1 ? ` ×${ticket.reopenCount}` : ""}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <SourceBadge source={ticket.source} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {slaBadge ? (
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium ${slaBadge.className}`}>
                      {slaBadge.label}
                    </span>
                  ) : (
                    <span className="text-xs text-text-secondary">—</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-text-primary">{ticket.companyInfo.companyName}</td>
                <td className="px-4 py-3 whitespace-nowrap text-text-primary">{ticket.assignment.assignedTo || "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap text-text-secondary">
                  {new Date(ticket.ticketInfo.callLoggedDate).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => {
                      setMessageText("");
                      setChatTicketId(ticket._id);
                      markReadMutation.mutate(ticket._id);
                    }}
                    disabled={!chatActive}
                    title={!chatActive
                      ? "Chat will be available once this ticket is assigned to a technician."
                      : chatReadOnly ? "Open read-only chat" : "Open chat"}
                    aria-label={`Open chat for ticket ${ticket._id}`}
                    className="inline-flex items-center justify-center rounded-lg bg-brand-blue p-2 text-white hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <MessageSquare size={15} />
                  </button>
                </td>
                </tr>
              );
            })}

            {tickets.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-text-secondary">
                  No tickets match your search.
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>
      </div>

      {totalTickets > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-text-secondary">
            Showing {(currentPage - 1) * ROWS_PER_PAGE + 1}–{Math.min(currentPage * ROWS_PER_PAGE, totalTickets)} of {totalTickets}
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

      {chatTicketId && activeChatTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-surface-card p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">Conversation</h3>
              <button
                type="button"
                onClick={() => setChatTicketId(null)}
                aria-label="Close chat"
                className="text-xl text-text-secondary hover:text-text-primary"
              >
                ×
              </button>
            </div>

            {messagesQuery.isLoading ? (
              <p className="text-sm text-text-secondary">Loading messages...</p>
            ) : messagesQuery.isError ? (
              <p className="text-sm text-status-critical">
                Couldn't load the conversation. Please try again.
              </p>
            ) : (
              <div className="min-h-0 max-h-[55vh] flex-1 space-y-3 overflow-y-auto">
                {messagesQuery.data.length === 0 ? (
                  <p className="text-sm text-text-secondary">No messages yet.</p>
                ) : (
                  messagesQuery.data.map((message) => {
                    const isOwnMessage = String(message.senderId) === String(userId);
                    return (
                      <div
                        key={message._id}
                        className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-xl px-4 py-3 ${
                            isOwnMessage
                              ? "bg-brand-purple text-white"
                              : "bg-surface-page text-text-primary"
                          }`}
                        >
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-medium">{message.senderName}</span>
                            <span className={isOwnMessage ? "text-white/70" : "text-text-secondary"}>
                              {roleLabels[message.senderRole] || message.senderRole}
                            </span>
                            <span className={isOwnMessage ? "text-white/70" : "text-text-secondary"}>
                              {new Date(message.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-sm">{message.text}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeChatTicket.ticketInfo.status === "Closed" ? (
              <p className="mt-4 border-t border-surface-border pt-4 text-sm text-text-secondary">
                This ticket is closed — conversation is read-only.
              </p>
            ) : (
              <>
                <form onSubmit={handleSendMessage} className="mt-4 flex gap-2 border-t border-surface-border pt-4">
                  <input
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Write a message..."
                    className="flex-1 w-full px-3 py-2 border border-surface-border rounded-lg text-sm focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!messageText.trim() || messageMutation.isPending}
                    className="bg-brand-purple text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {messageMutation.isPending ? "Sending..." : "Send"}
                  </button>
                </form>

                {messageMutation.isError && (
                  <p className="mt-2 text-sm text-status-critical">
                    Couldn't send message. Please try again.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}