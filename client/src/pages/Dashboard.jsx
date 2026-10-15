import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ticket, CheckCircle2, UserX, AlertTriangle, XCircle, ListChecks, Bell, MessageSquare, Send, X,
} from "lucide-react";
import {
  fetchTickets,
  fetchAllTickets,
  fetchTicketStats,
  fetchRecentMessages,
  fetchMessages,
  markMessagesRead,
  sendMessage,
} from "../api/tickets";
import { useAuth } from "../context/useAuth";
import FeedbackForm from "../components/FeedbackForm";
import useKeyedState from "../hooks/useKeyedState";
import { getVisibleTickets } from "../utils/ticketAccess";

// Each logged-in identity gets its own "seen" list, so viewing a ticket
// as one account doesn't mark it seen for other accounts on the same browser.
function getSeenKey({ role, technicianName, companyName }) {
  const identity = role === "it_staff" ? technicianName : role === "client" ? companyName : "admin";
  return `synov_seen_ticket_ids__${role || "none"}__${identity || "none"}`;
}

function getSeenMap(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || "{}");
    if (Array.isArray(stored)) {
      return Object.fromEntries(stored.map((id) => [id, 0]));
    }
    return stored;
  } catch {
    return {};
  }
}

function saveSeenMap(key, seenMap) {
  localStorage.setItem(key, JSON.stringify(seenMap));
}

function getFeedbackDismissedKey({ role, companyName }) {
  const identity = role === "client" ? companyName : "none";
  return `synov_feedback_dismissed_ticket_ids__${role || "none"}__${identity || "none"}`;
}

function getFeedbackDismissedIds(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(stored) ? stored : []);
  } catch {
    return new Set();
  }
}

function saveFeedbackDismissedIds(key, dismissedIds) {
  localStorage.setItem(key, JSON.stringify([...dismissedIds]));
}

function getTicketUpdatedAt(ticket) {
  return new Date(ticket.updatedAt || ticket.createdAt || ticket.ticketInfo.callLoggedDate).getTime();
}

function formatMessageAge(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatRelativeDuration(ms) {
  const totalMinutes = Math.max(0, Math.round(Math.abs(ms) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

function getSlaState(ticket) {
  if (!ticket || ["Closed", "Cancelled"].includes(ticket.ticketInfo?.status) || !ticket.slaDueAt) {
    return null;
  }

  const dueAt = new Date(ticket.slaDueAt).getTime();
  const now = Date.now();
  const remaining = dueAt - now;

  if (remaining <= 0) {
    return {
      label: `${formatRelativeDuration(Math.abs(remaining))} overdue`,
      className: "bg-status-critical text-white",
    };
  }

  if (remaining < 60 * 60 * 1000) {
    return {
      label: `${formatRelativeDuration(remaining)} left`,
      className: "bg-amber-500 text-white",
    };
  }

  return {
    label: `${formatRelativeDuration(remaining)} left`,
    className: "bg-emerald-600 text-white",
  };
}

const priorityColors = {
  Critical: "bg-status-critical",
  High: "bg-status-high",
  Medium: "bg-status-medium",
  Low: "bg-status-low",
};

const statusColors = {
  "Un-Assigned": "bg-status-unassigned",
  Assigned: "bg-status-assigned",
  Closed: "bg-status-closed",
  Cancelled: "bg-status-cancelled",
  "Re-Assigned": "bg-status-reassigned",
};

function Badge({ label, colorClass }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium text-white ${colorClass}`}>
      {label}
    </span>
  );
}

function PanelHeader({ icon: Icon, title, iconClass, badge, subtitle, action }) {
  return (
    <div className="flex h-20 shrink-0 items-center justify-between gap-3 border-b border-surface-border bg-surface-page/60 px-5">
      <div className="flex min-w-0 items-center gap-2">
        <Icon size={18} className={`shrink-0 ${iconClass}`} />
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-text-primary">{title}</h3>
          {subtitle && <p className="truncate text-xs text-text-secondary">{subtitle}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {badge}
        {action}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accentColor, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group text-left bg-surface-card border border-surface-border rounded-xl p-5 overflow-hidden relative
                 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
    >
      <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: accentColor }} />
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">{label}</p>
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${accentColor}1A` }}
        >
          <Icon size={18} style={{ color: accentColor }} />
        </div>
      </div>
      <p className="text-3xl font-semibold mt-3 text-text-primary group-hover:opacity-80 transition-opacity">
        {value}
      </p>
    </button>
  );
}

function FeedbackModal({ ticket, onDismiss, onSubmitted }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="relative w-full max-w-lg rounded-xl bg-surface-card p-6 shadow-xl">
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Rate later"
          className="absolute right-4 top-4 text-xl text-text-secondary hover:text-text-primary"
        >
          ×
        </button>
        <h3 className="pr-8 text-lg font-semibold text-text-primary">How was your support?</h3>
        <p className="mt-1 text-sm text-text-secondary">{ticket.ticketInfo.issueReported}</p>
        <div className="mt-5">
          <FeedbackForm ticketId={ticket._id} onSuccess={onSubmitted} />
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-3 text-sm text-text-secondary underline hover:text-text-primary"
        >
          Rate Later
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role, technicianName, companyName, userId } = useAuth();
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [conversationReply, setConversationReply] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);

  const seenKey = useMemo(
    () => getSeenKey({ role, technicianName, companyName }),
    [role, technicianName, companyName]
  );

  const [seenMap, setSeenMap] = useKeyedState(seenKey, () => getSeenMap(seenKey));
  const feedbackDismissedKey = useMemo(
    () => getFeedbackDismissedKey({ role, companyName }),
    [role, companyName]
  );
  const [dismissedFeedbackIds, setDismissedFeedbackIds] = useKeyedState(
    feedbackDismissedKey,
    () => getFeedbackDismissedIds(feedbackDismissedKey)
  );
  const [submittedFeedbackIds, setSubmittedFeedbackIds] = useKeyedState(
    feedbackDismissedKey,
    () => new Set()
  );

  const refetchVisibleList = {
    refetchInterval: () => (document.hidden ? false : 30_000),
    refetchOnWindowFocus: true,
  };
  const ticketPageQuery = useQuery({
    queryKey: ["tickets", "dashboard", role],
    queryFn: () => fetchTickets({ page: 1, limit: 100 }),
    ...refetchVisibleList,
  });
  const ticketStatsQuery = useQuery({
    queryKey: ["ticketStats", role],
    queryFn: () => fetchTicketStats(),
    ...refetchVisibleList,
  });
  const reopenedTicketsQuery = useQuery({
    queryKey: ["tickets", "dashboard-reopened", role],
    queryFn: () => fetchAllTickets({ reopened: true }),
    enabled: role === "admin" || role === "it_staff",
    ...refetchVisibleList,
  });
  const unassignedQueueQuery = useQuery({
    queryKey: ["tickets", "dashboard-unassigned"],
    queryFn: () => fetchTickets({ status: "Un-Assigned", page: 1, limit: 100 }),
    enabled: role === "admin",
    ...refetchVisibleList,
  });
  const closedTicketsQuery = useQuery({
    queryKey: ["tickets", "dashboard-closed"],
    queryFn: () => fetchTickets({ status: "Closed", page: 1, limit: 100 }),
    enabled: role === "client",
    ...refetchVisibleList,
  });
  const slaBreachedQuery = useQuery({
    queryKey: ["tickets", "dashboard-sla-breached"],
    queryFn: () => fetchTickets({ slaBreached: true, page: 1, limit: 100 }),
    enabled: role === "admin" || role === "it_staff",
    ...refetchVisibleList,
  });
  const tickets = ticketPageQuery.data?.items || [];
  const stats = ticketStatsQuery.data;
  const { data: recentMessages = [] } = useQuery({
    queryKey: ["recentMessages"],
    queryFn: fetchRecentMessages,
    refetchOnWindowFocus: true,
  });
  const conversationQuery = useQuery({
    queryKey: ["messages", selectedConversation?.ticketId],
    queryFn: () => fetchMessages(selectedConversation.ticketId),
    enabled: Boolean(selectedConversation?.ticketId),
  });
  const sendMessageMutation = useMutation({
    mutationFn: ({ ticketId, text, internal }) => sendMessage(ticketId, text, internal),
    onSuccess: (_message, variables) => {
      setConversationReply("");
      setIsInternalNote(false);
      queryClient.invalidateQueries({ queryKey: ["messages", variables.ticketId] });
      queryClient.invalidateQueries({ queryKey: ["recentMessages"] });
    },
  });

  const total = stats?.total || 0;
  const byStatus = stats?.byStatus || {};
  const byPriority = stats?.byPriority || {};
  const open = Object.entries(byStatus)
    .filter(([status]) => !["Closed", "Cancelled"].includes(status))
    .reduce((sum, [, count]) => sum + count, 0);
  const closed = byStatus.Closed || 0;
  const unassigned = stats?.unassigned || 0;
  const critical = byPriority.Critical || 0;
  const cancelled = byStatus.Cancelled || 0;
  const reopenedCount = stats?.reopened || 0;

  function goToTicketsFiltered(status) {
    navigate(status ? `/tickets?status=${encodeURIComponent(status)}` : "/tickets");
  }

  function goToReopenedTickets() {
    navigate("/tickets?reopened=true");
  }

  const isTicketNew = (ticket) =>
    !seenMap[ticket._id] || getTicketUpdatedAt(ticket) > seenMap[ticket._id];
  const reopenedNotifications = role === "admin" || role === "it_staff"
    ? getVisibleTickets(reopenedTicketsQuery.data || [], { role, technicianName, userId, companyName })
      .filter((ticket) => ticket.reopenCount > 0 && !["Closed", "Cancelled"].includes(ticket.ticketInfo.status))
      .sort((first, second) => new Date(second.reopenedAt) - new Date(first.reopenedAt))
    : [];
  const unassignedQueue = unassignedQueueQuery.data?.items || [];
  const recentTicketSource = role === "admin" ? unassignedQueue : tickets;
  const recentTickets = [...recentTicketSource]
    .filter((ticket) => {
      if (role === "admin") {
        return ticket.ticketInfo.status === "Un-Assigned" && isTicketNew(ticket);
      }
      if (role === "it_staff") return isTicketNew(ticket);
      return true;
    })
    .sort((a, b) => new Date(b.ticketInfo.callLoggedDate) - new Date(a.ticketInfo.callLoggedDate))
    .slice(0, 6);
  const regularNewCount = role === "client"
    ? 0
    : role === "admin" || role === "it_staff"
    ? recentTickets.length
    : recentTickets.filter(isTicketNew).length;
  const unseenMessages = recentMessages;
  const newCount = regularNewCount
    + reopenedNotifications.filter(isTicketNew).length
    + unseenMessages.length;

  function markSeenAndOpen(ticket) {
    markSeen(ticket);
    navigate(`/tickets/${ticket._id}`);
  }

  function markSeen(ticket) {
    const next = { ...seenMap, [ticket._id]: getTicketUpdatedAt(ticket) };
    setSeenMap(next);
    saveSeenMap(seenKey, next);
  }

  async function markMessageSeenAndOpen(notification) {
    setSelectedConversation(notification);
    setConversationReply("");
    setIsInternalNote(false);
    sendMessageMutation.reset();
    try {
      await markMessagesRead(notification.ticketId);
    } catch {
      // Loading the conversation should still work when marking read fails.
    } finally {
      queryClient.invalidateQueries({ queryKey: ["recentMessages"] });
    }
  }

  function clearConversation() {
    setSelectedConversation(null);
    setConversationReply("");
    setIsInternalNote(false);
    sendMessageMutation.reset();
  }

  function handleConversationReply(event) {
    event.preventDefault();
    const text = conversationReply.trim();
    if (!text || !selectedConversation || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate({
      ticketId: selectedConversation.ticketId,
      text,
      internal: role !== "client" && isInternalNote,
    });
  }

  const slaBreachedTickets = slaBreachedQuery.data?.items || [];

  const unratedClosedTickets = (closedTicketsQuery.data?.items || []).filter((ticket) => (
      ticket.ticketInfo.status === "Closed"
      && ticket.feedback?.rating == null
    ));

  const feedbackTicket = role === "client"
    ? unratedClosedTickets.find(
        (ticket) => !dismissedFeedbackIds.has(ticket._id) && !submittedFeedbackIds.has(ticket._id)
      ) || null
    : null;

  function dismissFeedback(ticketId) {
    const next = new Set(dismissedFeedbackIds);
    next.add(ticketId);
    setDismissedFeedbackIds(next);
    saveFeedbackDismissedIds(feedbackDismissedKey, next);
  }

  function handleFeedbackSubmitted(ticket) {
    const nextDismissedIds = new Set(dismissedFeedbackIds);
    nextDismissedIds.delete(ticket._id);
    setDismissedFeedbackIds(nextDismissedIds);
    saveFeedbackDismissedIds(feedbackDismissedKey, nextDismissedIds);
    setSubmittedFeedbackIds((current) => new Set(current).add(ticket._id));
  }

  const secondWidget =
    role === "admin"
      ? { title: `Unassigned Queue (${unassignedQueue.length})`, tickets: unassignedQueue }
      : role === "it_staff"
      ? { title: `My Tickets — ${technicianName}`, tickets }
      : role === "client"
      ? { title: "Your recent tickets", tickets }
      : { title: "Your recent tickets", tickets };

  const slaWidget = (role === "admin" || role === "it_staff")
    ? { title: `SLA Breached (${stats?.slaBreached || 0})`, tickets: slaBreachedTickets }
    : { title: "SLA Breached", tickets: [], placeholder: "SLA details are available to staff." };

  const notifications = [
    ...unseenMessages.map((notification) => ({
      type: "message",
      key: `message-${notification.ticketId}`,
      timestamp: new Date(notification.createdAt).getTime(),
      notification,
      isNew: true,
    })),
    ...reopenedNotifications.map((ticket) => ({
      type: "reopened",
      key: `reopened-${ticket._id}`,
      timestamp: new Date(ticket.reopenedAt || ticket.updatedAt || ticket.createdAt).getTime(),
      ticket,
      isNew: isTicketNew(ticket),
    })),
    ...recentTickets.map((ticket) => ({
      type: "ticket",
      key: `ticket-${ticket._id}`,
      timestamp: new Date(ticket.createdAt || ticket.ticketInfo.callLoggedDate).getTime(),
      ticket,
      isNew: role !== "client",
    })),
  ].sort((first, second) => second.timestamp - first.timestamp);

  const listLoading = ticketPageQuery.isLoading || ticketStatsQuery.isLoading
    || (role === "admin" && unassignedQueueQuery.isLoading)
    || ((role === "admin" || role === "it_staff") && reopenedTicketsQuery.isLoading)
    || (role === "client" && closedTicketsQuery.isLoading)
    || ((role === "admin" || role === "it_staff") && slaBreachedQuery.isLoading);
  const listError = ticketPageQuery.isError || ticketStatsQuery.isError
    || (role === "admin" && unassignedQueueQuery.isError)
    || ((role === "admin" || role === "it_staff") && reopenedTicketsQuery.isError)
    || (role === "client" && closedTicketsQuery.isError)
    || ((role === "admin" || role === "it_staff") && slaBreachedQuery.isError);
  if (listLoading) return <p className="text-text-secondary">Loading dashboard...</p>;
  if (listError) return <p className="text-status-critical">Couldn't load tickets. Check the backend is running.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-text-primary">Dashboard</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-4 mb-6">
        <StatCard label="Total Tickets" value={total} icon={Ticket} accentColor="#7B3F9E" onClick={() => goToTicketsFiltered("")} />
        <StatCard label="Open" value={open} icon={ListChecks} accentColor="#2563EB" onClick={() => goToTicketsFiltered("Assigned")} />
        {(role === "admin" || role === "it_staff") && (
          <StatCard label="Reopened" value={reopenedCount} icon={Ticket} accentColor="#F59E0B" onClick={goToReopenedTickets} />
        )}
        <StatCard label="Closed" value={closed} icon={CheckCircle2} accentColor="#16A34A" onClick={() => goToTicketsFiltered("Closed")} />
        <StatCard label="Un-Assigned" value={unassigned} icon={UserX} accentColor="#64748B" onClick={() => goToTicketsFiltered("Un-Assigned")} />
        <StatCard label="Critical" value={critical} icon={AlertTriangle} accentColor="#DC2626" onClick={() => goToTicketsFiltered("")} />
        <StatCard label="Cancelled" value={cancelled} icon={XCircle} accentColor="#9CA3AF" onClick={() => goToTicketsFiltered("Cancelled")} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="flex h-[402px] min-h-0 flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-card">
          <PanelHeader
            icon={Bell}
            title="Notifications"
            iconClass="text-brand-purple"
            badge={newCount > 0 && (
              <span
                className="bg-status-critical text-white text-xs font-bold px-3 py-1 animate-pulse"
                style={{ clipPath: "polygon(0% 0%, 100% 0%, 92% 50%, 100% 100%, 0% 100%)" }}
              >
                {newCount} new
              </span>
            )}
          />

          <div className="h-80 shrink-0 divide-y divide-surface-border overflow-y-auto [scrollbar-width:thin]">
            {notifications.length === 0 ? (
              <p className="flex h-full items-center justify-center px-5 text-center text-sm text-text-secondary">No tickets to show.</p>
            ) : (
              notifications.map((entry) => {
                if (entry.type === "message") {
                  const notification = entry.notification;
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      onClick={() => markMessageSeenAndOpen(notification)}
                      className="flex h-16 w-full shrink-0 items-center justify-between gap-3 px-4 text-left hover:bg-surface-page transition-colors bg-brand-blue/5"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <MessageSquare size={16} className="mt-0.5 shrink-0 text-brand-blue" />
                        <div className="min-w-0">
                          <span className="block truncate text-sm font-medium text-text-primary">
                            New message on Ticket #{notification.ticketNumber || notification.ticketId}
                          </span>
                          <p className="mt-0.5 truncate text-xs text-text-secondary">
                            {notification.companyName} · {notification.unreadCount} unread · {formatMessageAge(notification.createdAt)}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                }

                const ticket = entry.ticket;
                const isReopened = entry.type === "reopened";
                return (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => markSeenAndOpen(ticket)}
                    className={`flex h-16 w-full shrink-0 items-center justify-between gap-3 px-4 text-left hover:bg-surface-page transition-colors ${entry.isNew ? "bg-brand-purple/5" : ""}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {entry.isNew && (
                          <span
                            className="shrink-0 bg-status-critical text-white text-[10px] font-bold px-3 py-1 animate-pulse"
                            style={{ clipPath: "polygon(0% 0%, 100% 0%, 92% 50%, 100% 100%, 0% 100%)" }}
                            aria-label="New notification"
                          >
                            NEW
                          </span>
                        )}
                        <span className="line-clamp-1 text-sm font-medium text-text-primary">
                          {isReopened
                            ? `Ticket #${ticket.ticketNumber || ticket._id} was reopened by ${ticket.reopenedBy?.name || "Unknown user"}`
                            : ticket.companyInfo.companyName}
                        </span>
                      </div>
                      <p className="line-clamp-1 text-xs text-text-secondary mt-0.5">
                        {ticket.companyInfo.companyName} · {ticket.ticketInfo.issueReported}
                      </p>
                    </div>
                    <Badge label={ticket.ticketInfo.status} colorClass={statusColors[ticket.ticketInfo.status]} />
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex h-[402px] min-h-0 flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-card">
            <PanelHeader
              icon={role === "admin" ? UserX : role === "client" ? Ticket : ListChecks}
              title={secondWidget.title}
              iconClass="text-brand-blue"
            />
            <div className="h-80 shrink-0 divide-y divide-surface-border overflow-y-auto [scrollbar-width:thin]">
              {secondWidget.tickets.length === 0 ? (
                <p className="flex h-full items-center justify-center px-5 text-center text-sm text-text-secondary">
                  {role === "admin" ? "Nothing waiting — queue is clear." : "No tickets to show."}
                </p>
              ) : (
                secondWidget.tickets.map((t) => {
                  const isNew = role === "admin" && isTicketNew(t);
                  return (
                  <Link
                    key={t._id}
                    to={`/tickets/${t._id}`}
                    onClick={() => markSeen(t)}
                    className="flex h-16 shrink-0 items-center justify-between gap-3 px-4 hover:bg-surface-page transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {isNew && (
                          <span
                            className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center"
                            aria-label="New ticket"
                          >
                            <span className="absolute inset-0 rounded-full bg-status-critical opacity-75 animate-ping" />
                            <span className="relative h-1.5 w-1.5 rounded-full bg-status-critical" />
                          </span>
                        )}
                        <span className="block text-sm font-medium text-text-primary line-clamp-1">
                          {t.companyInfo.companyName}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">
                        {t.ticketInfo.issueReported}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Badge label={t.ticketInfo.priority} colorClass={priorityColors[t.ticketInfo.priority]} />
                      <Badge label={t.ticketInfo.status} colorClass={statusColors[t.ticketInfo.status]} />
                    </div>
                  </Link>
                  );
                })
              )}
            </div>
          </div>

        <div className="flex h-[402px] min-h-0 flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-card">
            <PanelHeader icon={AlertTriangle} title={slaWidget.title} iconClass="text-status-critical" />
            <div className="h-80 shrink-0 divide-y divide-surface-border overflow-y-auto [scrollbar-width:thin]">
              {slaWidget.placeholder ? (
                <p className="flex h-full items-center justify-center px-5 py-4 text-center text-sm text-text-secondary">
                  {slaWidget.placeholder}
                </p>
              ) : slaWidget.tickets.length === 0 ? (
                <p className="flex h-full items-center justify-center px-5 text-center text-sm text-text-secondary">No breached SLAs.</p>
              ) : (
                slaWidget.tickets.map((ticket) => {
                  const slaState = getSlaState(ticket);
                  return (
                    <Link
                      key={ticket._id}
                      to={`/tickets/${ticket._id}`}
                      className="flex h-16 shrink-0 items-center justify-between gap-3 px-4 hover:bg-surface-page transition-colors"
                    >
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            window.open(`/admin/companies/${ticket.companyInfo.companyId}/tickets`, "_blank", "noopener,noreferrer");
                          }}
                          className="text-left text-sm font-medium text-text-primary hover:text-brand-purple hover:underline truncate"
                        >
                          {ticket.companyInfo.companyName}
                        </button>
                        <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">{ticket.ticketInfo.issueReported}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge label={ticket.ticketInfo.priority} colorClass={priorityColors[ticket.ticketInfo.priority]} />
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium ${slaState?.className}`}>
                          {slaState?.label}
                        </span>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        <div className="flex h-[402px] min-h-0 flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-card">
          <PanelHeader
            icon={MessageSquare}
            title="Conversation"
            iconClass="text-brand-blue"
            subtitle={selectedConversation
              ? `Ticket #${selectedConversation.ticketNumber || selectedConversation.ticketId} · ${selectedConversation.companyName}`
              : undefined}
            action={selectedConversation && (
              <>
                <button
                  type="button"
                  onClick={() => navigate(`/tickets/${selectedConversation.ticketId}`)}
                  className="text-xs font-medium text-brand-purple hover:underline"
                >
                  Open ticket
                </button>
                <button
                  type="button"
                  onClick={clearConversation}
                  aria-label="Clear conversation"
                  className="rounded-md p-1 text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                >
                  <X size={16} />
                </button>
              </>
            )}
          />
          <div className="flex h-80 min-h-0 shrink-0 flex-col overflow-hidden">
            {selectedConversation ? (
              <>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 [scrollbar-width:thin]">
                {conversationQuery.isLoading ? (
                  <p className="text-sm text-text-secondary">Loading conversation...</p>
                ) : conversationQuery.isError ? (
                  <p className="text-sm text-status-critical">Couldn't load this conversation.</p>
                ) : (conversationQuery.data || []).filter((message) => role !== "client" || !message.isInternal).length === 0 ? (
                  <p className="text-sm text-text-secondary">No messages yet.</p>
                ) : (conversationQuery.data || [])
                  .filter((message) => role !== "client" || !message.isInternal)
                  .map((message) => (
                    <div key={message._id} className="rounded-lg border border-surface-border bg-surface-page/60 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">{message.senderName}</span>
                        <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-[10px] font-medium text-brand-blue">
                          {message.senderRole}
                        </span>
                        {message.isInternal && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                            Internal note
                          </span>
                        )}
                        <time className="ml-auto text-[10px] text-text-secondary" dateTime={message.createdAt}>
                          {new Date(message.createdAt).toLocaleString()}
                        </time>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-text-primary">{message.text}</p>
                    </div>
                  ))}
              </div>
                <form onSubmit={handleConversationReply} className="shrink-0 border-t border-surface-border p-3">
                {role !== "client" && (
                  <label className="mb-2 flex items-center gap-2 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      checked={isInternalNote}
                      onChange={(event) => setIsInternalNote(event.target.checked)}
                      className="h-4 w-4 accent-amber-500"
                    />
                    Internal note
                  </label>
                )}
                <div className="flex gap-2">
                  <input
                    value={conversationReply}
                    onChange={(event) => setConversationReply(event.target.value)}
                    placeholder={isInternalNote ? "Write an internal note..." : "Write a reply..."}
                    aria-label="Conversation reply"
                    className="min-w-0 flex-1 rounded-lg border border-surface-border px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={!conversationReply.trim() || sendMessageMutation.isPending}
                    className="inline-flex items-center gap-1 rounded-lg bg-brand-purple px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Send size={14} />
                    {sendMessageMutation.isPending ? "Sending..." : "Send"}
                  </button>
                </div>
                {sendMessageMutation.isError && (
                  <p className="mt-2 text-xs text-status-critical">Couldn't send this message.</p>
                )}
                </form>
              </>
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-text-secondary">
                Click a message notification to view the conversation
              </div>
            )}
          </div>
        </div>
      </div>

      {feedbackTicket && (
        <FeedbackModal
          ticket={feedbackTicket}
          onDismiss={() => dismissFeedback(feedbackTicket._id)}
          onSubmitted={handleFeedbackSubmitted}
        />
      )}
    </div>
  );
}