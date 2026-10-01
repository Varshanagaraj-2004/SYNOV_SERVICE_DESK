import { useState, useEffect, useRef } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { AlertCircle, Building2, ClipboardList, Package, Pencil, UserRound } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchTicketById,
  updateTicketStatus,
  fetchMessages,
  sendMessage,
  addTicketAttachment,
  exportTicketExcel,
  markMessagesRead,
  reopenTicket,
} from "../api/tickets";
import { fetchTechnicians } from "../api/technicians";
import { useAuth } from "../context/useAuth";
import useKeyedState from "../hooks/useKeyedState";
import FeedbackForm from "../components/FeedbackForm";

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

const statusOptionsByCurrentStatus = {
  New: ["New", "Assigned", "Cancelled"],
  "Un-Assigned": ["Un-Assigned", "Assigned", "Cancelled"],
  Assigned: ["Assigned", "Re-Assigned", "Cancelled"],
  "Re-Assigned": ["Assigned", "Re-Assigned", "Cancelled"],
};
const sectionAccents = {
  purple: { border: "border-l-purple-500", icon: "bg-purple-100 text-purple-700" },
  blue: { border: "border-l-blue-500", icon: "bg-blue-100 text-blue-700" },
  green: { border: "border-l-green-500", icon: "bg-green-100 text-green-700" },
  amber: { border: "border-l-amber-500", icon: "bg-amber-100 text-amber-700" },
};

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
      label: `⚠️ SLA breached — was due ${formatRelativeDuration(Math.abs(timeRemaining))} ago`,
      className: "bg-status-critical text-white",
    };
  }

  if (timeRemaining < 60 * 60 * 1000) {
    return {
      label: `Due in ${formatRelativeDuration(timeRemaining)}`,
      className: "bg-amber-500 text-white",
    };
  }

  return {
    label: `Due in ${formatRelativeDuration(timeRemaining)}`,
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

function Section({ title, icon: Icon, accent, gridClassName = "grid-cols-2", children }) {
  const accentStyle = sectionAccents[accent];
  return (
    <div className={`bg-surface-card border border-surface-border rounded-xl p-5 mb-4 ${accentStyle ? `border-l-4 ${accentStyle.border}` : ""}`}>
      <div className="mb-4 flex items-center gap-3">
        {Icon && (
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${accentStyle?.icon || "bg-surface-muted text-text-secondary"}`}>
            <Icon size={16} />
          </span>
        )}
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      </div>
      <div className={`grid ${gridClassName} gap-x-3 gap-y-3 md:gap-x-4`}>{children}</div>
    </div>
  );
}

function Field({ label, value, children, tile = false }) {
  return (
    <div className={tile ? "min-w-0 rounded-lg bg-surface-muted px-3 py-2" : ""}>
      <p className={tile ? "text-[10px] font-semibold uppercase text-text-secondary" : "text-xs text-text-secondary"}>{label}</p>
      {children || (
        <p className={`mt-0.5 text-sm text-text-primary ${tile ? "font-medium" : ""}`}>{value || "—"}</p>
      )}
    </div>
  );
}

function CloseTicketModal({
  resolutionRemarks,
  setResolutionRemarks,
  supportType,
  setSupportType,
  onCancel,
  onConfirm,
  isPending,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="relative w-full max-w-lg rounded-xl bg-surface-card p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-text-primary">Resolve &amp; close this ticket</h3>
        <p className="mt-1 text-sm text-text-secondary">Resolution remarks are required.</p>
        <textarea
          value={resolutionRemarks}
          onChange={(e) => setResolutionRemarks(e.target.value)}
          rows={5}
          autoFocus
          className={`${inputClass} mt-5`}
          placeholder="Describe how this was resolved..."
        />
        <label className="mt-4 block text-xs font-medium text-text-secondary">
          Support type <span className="text-status-critical">*</span>
          <select
            value={supportType}
            onChange={(e) => setSupportType(e.target.value)}
            className={`${inputClass} mt-1`}
          >
            <option value="">-- Select support type --</option>
            <option value="Remote">Remote</option>
            <option value="Off Site">Off Site</option>
          </select>
        </label>
        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2 text-sm font-medium text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!resolutionRemarks.trim() || !supportType || isPending}
            className="bg-status-critical text-white px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isPending ? "Closing..." : "Close Ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReopenTicketModal({ reason, setReason, error, onCancel, onConfirm, isPending }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form onSubmit={onConfirm} className="relative w-full max-w-lg rounded-xl bg-surface-card p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-text-primary">Reopen ticket</h3>
        <label className="mt-4 block text-xs font-medium text-text-secondary">
          Why are you reopening this ticket?
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={5}
            maxLength={500}
            required
            rows={4}
            className={`${inputClass} mt-1`}
          />
        </label>
        {error && <p role="alert" className="mt-2 text-sm text-status-critical">{error}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2 text-sm font-medium text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={reason.trim().length < 5 || isPending}
            className="bg-brand-purple text-white px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isPending ? "Reopening..." : "Reopen ticket"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2 border border-surface-border rounded-lg text-sm focus:outline-none";

export default function TicketDetail() {
  const { id } = useParams();
  const location = useLocation();
  const { role, technicianName, userId } = useAuth();
  const queryClient = useQueryClient();
  const chatContainerRef = useRef(null);
  const manageSectionRef = useRef(null);
  const statusSelectRef = useRef(null);
  const highlightTimeoutRef = useRef(null);
  const reopenSuccessTimeoutRef = useRef(null);
  const [saved, setSaved] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [chatOpen, setChatOpen] = useKeyedState(`${id}:${location.key}`, () => Boolean(location.state?.openChat));
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenSuccess, setReopenSuccess] = useState("");
  const [resolutionRemarks, setResolutionRemarks] = useState("");
  const [supportType, setSupportType] = useState("");

  const { data: ticket, isLoading, isError, refetch: refetchTicket } = useQuery({
    queryKey: ["ticket", id],
    queryFn: () => fetchTicketById(id),
  });
  const { data: technicians = [], isLoading: techniciansLoading, isError: techniciansError } = useQuery({
    queryKey: ["technicians", role === "admin" ? "assignable" : "default"],
    queryFn: () => fetchTechnicians({ assignable: role === "admin" }),
  });
  const messagesQuery = useQuery({
    queryKey: ["messages", id],
    queryFn: () => fetchMessages(id),
    enabled: chatOpen && Boolean(ticket?.assignment?.assignedTo),
  });

  const ticketEditorKey = ticket || id;
  const [ticketEditor, setTicketEditor] = useKeyedState(ticketEditorKey, () => ({
    status: ticket?.ticketInfo.status || "",
    assignedTo: ticket?.assignment.assignedTo || "",
  }));
  const [resolutionNotes, setResolutionNotes] = useKeyedState(
    ticketEditorKey,
    () => ticket?.assignment?.actionTaken || ""
  );
  const { status, assignedTo } = ticketEditor;
  const setStatus = (value) => setTicketEditor((current) => ({
    ...current,
    status: value,
    assignedTo: value === "Un-Assigned" ? "" : current.assignedTo,
  }));
  const setAssignedTo = (value) => setTicketEditor((current) => ({ ...current, assignedTo: value }));
  const [, setAttachmentFiles] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [highlightManage, setHighlightManage] = useState(false);
  const [exportError, setExportError] = useState("");

  const exportMutation = useMutation({
    mutationFn: () => exportTicketExcel(id),
    onSuccess: () => setExportError(""),
    onError: (error) => {
      const message = error?.response?.data?.error || "Unable to download the file.";
      setExportError(message);
    },
  });

  useEffect(() => () => {
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    if (reopenSuccessTimeoutRef.current) clearTimeout(reopenSuccessTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!ticket || !location.state?.openChat || !ticket.assignment?.assignedTo) return;
    const frame = requestAnimationFrame(() => {
      chatContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [ticket, chatOpen, location.state?.openChat]);

  const saveMutation = useMutation({
    mutationFn: (updates) => updateTicketStatus(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      setIsEditing(false);
      setCloseModalOpen(false);
      setResolutionRemarks("");
      setSupportType("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });
  const saveResolutionNotesMutation = useMutation({
    mutationFn: (actionTaken) => updateTicketStatus(id, { actionTaken }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });
  const reopenMutation = useMutation({
    mutationFn: (reason) => reopenTicket(id, reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
      setResolutionNotes("");
      await refetchTicket();
      setReopenModalOpen(false);
      setReopenReason("");
      setReopenSuccess("Ticket reopened successfully.");
      if (reopenSuccessTimeoutRef.current) clearTimeout(reopenSuccessTimeoutRef.current);
      reopenSuccessTimeoutRef.current = setTimeout(() => {
        setReopenSuccess("");
        reopenSuccessTimeoutRef.current = null;
      }, 3000);
    },
  });
  const messageMutation = useMutation({
    mutationFn: ({ text, isInternal }) => sendMessage(id, text, isInternal),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
      queryClient.invalidateQueries({ queryKey: ["recentMessages"] });
      setMessageText("");
      setIsInternalNote(false);
    },
  });
  const { mutate: markMessagesReadMutation } = useMutation({
    mutationFn: markMessagesRead,
  });

  useEffect(() => {
    if (chatOpen && ticket?.assignment?.assignedTo) markMessagesReadMutation(id);
  }, [chatOpen, id, markMessagesReadMutation, ticket?.assignment?.assignedTo]);
  const attachmentMutation = useMutation({
    mutationFn: (files) => addTicketAttachment(id, files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      setAttachmentFiles([]);
    },
  });

  if (isLoading || techniciansLoading) return <p className="text-text-secondary">Loading ticket...</p>;
  if (isError || techniciansError || !ticket) {
    return (
      <div>
        <p className="text-text-secondary">Ticket not found.</p>
        <Link to="/tickets" className="text-brand-purple text-sm">← Back to tickets</Link>
      </div>
    );
  }

  const { ticketInfo, companyInfo, userInfo, productInfo, feedback } = ticket;
  const editableStatusOptions = statusOptionsByCurrentStatus[ticketInfo.status] || [ticketInfo.status];
  const issueTitle = ticketInfo.issueReported || "";
  const issueDescription = ticket.description || "";
  const isEmailTicket = String(ticket.source || "").toLowerCase() === "email";
  const canEdit = role === "admin";

  function openCompanyTickets() {
    if (!companyInfo?.companyId) return;
    window.open(`/admin/companies/${companyInfo.companyId}/tickets`, "_blank", "noopener,noreferrer");
  }
  const isAssignedTechnician = ticket.assignment.assignedToId
    ? String(ticket.assignment.assignedToId) === String(userId)
    : ticket.assignment.assignedTo === technicianName;
  const canClose = role === "admin" || (role === "it_staff" && isAssignedTechnician);
  const hasAssignedTechnician = Boolean(ticket.assignment.assignedTo);
  const isResolutionReadOnly = ["Closed", "Cancelled"].includes(ticketInfo.status);
  const canEditResolution = hasAssignedTechnician && !isResolutionReadOnly && canClose;
  const hasReadOnlyResolution = hasAssignedTechnician
    && isResolutionReadOnly
    && Boolean(ticket.assignment.actionTaken?.trim());
  const canShowResolutionCard = canEditResolution || hasReadOnlyResolution;
  const isClosedTicket = ticketInfo.status === "Closed";
  const showReopenedBanner = ticket.reopenCount > 0
    && !["Closed", "Cancelled"].includes(ticketInfo.status)
    && (role === "admin" || role === "client" || (role === "it_staff" && isAssignedTechnician));
  const canManageAttachments = role === "admin" || (role === "it_staff" && isAssignedTechnician);
  const chatActive = Boolean(ticket.assignment.assignedTo);
  const slaBadge = getSlaBadge(ticket);
  const chatForbidden = messagesQuery.error?.response?.status === 403;
  const chatReadOnly = ticketInfo.status === "Closed";
  const roleLabels = {
    client: "Client",
    it_staff: "Technician",
    admin: "Admin",
  };

  function handleSave() {
    const updates = { assignedTo };
    if (status !== "Closed") updates.status = status;
    saveMutation.mutate(updates);
  }

  function handleSaveResolutionNotes() {
    saveResolutionNotesMutation.mutate(resolutionNotes);
  }

  function handleOpenChat() {
    setChatOpen(true);
  }

  function handleEditClick() {
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    setIsEditing(true);
    setHighlightManage(true);
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightManage(false);
      highlightTimeoutRef.current = null;
    }, 2000);
    requestAnimationFrame(() => {
      manageSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      statusSelectRef.current?.focus({ preventScroll: true });
    });
  }

  function handleCloseTicket() {
    setResolutionRemarks(resolutionNotes);
    setSupportType("");
    setCloseModalOpen(true);
  }

  function handleOpenReopenModal() {
    reopenMutation.reset();
    setReopenReason("");
    setReopenModalOpen(true);
  }

  function handleReopenSubmit(event) {
    event.preventDefault();
    const reason = reopenReason.trim();
    if (reason.length < 5 || reason.length > 500 || reopenMutation.isPending) return;
    reopenMutation.mutate(reason);
  }

  function handleCancelClose() {
    setCloseModalOpen(false);
    setResolutionRemarks("");
    setSupportType("");
  }

  function handleConfirmClose() {
    const remarks = resolutionRemarks.trim();
    if (!remarks || !supportType || saveMutation.isPending) return;
    saveMutation.mutate({
      status: "Closed",
      assignedTo: ticket.assignment.assignedTo,
      actionTaken: remarks,
      supportType,
    });
  }

  function handleSendMessage(e) {
    e.preventDefault();
    const text = messageText.trim();
    if (!text || messageMutation.isPending) return;
    messageMutation.mutate({ text, isInternal: isInternalNote });
  }

  function handleAttachmentChange(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    attachmentMutation.mutate(files);
    e.target.value = "";
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-text-secondary">Ticket #{ticket.ticketNumber || ticket._id}</p>
          <h2 className="text-xl font-semibold text-text-primary">Ticket Detail</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ticket.reopenCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
              Reopened
            </span>
          )}
          {role === "admin" && (
            <button
              type="button"
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exportMutation.isPending ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Downloading...
                </>
              ) : (
                "Download"
              )}
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenChat}
            disabled={!chatActive}
            title={!chatActive ? "Chat will be available once this ticket is assigned to a technician." : "Open chat"}
            className="rounded-lg bg-brand-blue px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            Chat
          </button>
          {canEdit && !isEditing && (
            <button
              type="button"
              onClick={handleEditClick}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-purple px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              <Pencil size={15} />
              Edit
            </button>
          )}
        </div>
      </div>

      {showReopenedBanner && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This ticket was reopened on {ticket.reopenedAt ? new Date(ticket.reopenedAt).toLocaleString() : "an unknown date"}
          {ticket.reopenedBy?.name ? ` by ${ticket.reopenedBy.name}` : " by an unknown user"}.
          {ticket.canShowReopenReason && ticket.reopenReason && ` Reason: ${ticket.reopenReason}`}
        </div>
      )}

      {exportError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {exportError}
        </div>
      )}
      {reopenSuccess && (
        <p role="status" className="mb-4 text-sm text-status-closed">{reopenSuccess}</p>
      )}

      <section className="mb-4 rounded-xl border border-surface-border border-l-4 border-l-orange-500 bg-surface-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <AlertCircle size={18} className="text-orange-600" />
          <h3 className="text-sm font-semibold text-text-primary">Issue raised</h3>
        </div>
        <h4 className="text-base font-semibold text-text-primary">{issueTitle || "—"}</h4>
        {issueDescription && issueDescription !== issueTitle && (
          <p className="mt-3 whitespace-pre-wrap rounded-lg bg-surface-muted p-3 text-sm text-text-secondary">
            {issueDescription}
          </p>
        )}
      </section>

      <Section title="Ticket info" icon={ClipboardList} accent="purple" gridClassName="grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <Field tile label="Status" value={<Badge label={status} colorClass={statusColors[status]} />} />
        <Field tile label="Priority" value={<Badge label={ticketInfo.priority} colorClass={priorityColors[ticketInfo.priority]} />} />
        <Field tile label="SLA" value={slaBadge ? <Badge label={slaBadge.label} colorClass={slaBadge.className} /> : "—"} />
        <Field tile label="Call type" value={ticketInfo.callType} />
        <Field tile label="Support type" value={ticketInfo.supportType} />
        <Field tile label="Logged date" value={new Date(ticketInfo.callLoggedDate).toLocaleDateString()} />
        <Field tile label="Logged time" value={ticketInfo.callLoggedTime} />
      </Section>

      <Section title="Company info" icon={Building2} accent="blue" gridClassName="grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <Field tile label="Company name">
          <button
            type="button"
            onClick={openCompanyTickets}
            className="mt-0.5 text-sm font-medium text-brand-purple hover:underline"
          >
            {companyInfo.companyName || "—"}
          </button>
        </Field>
        <Field tile label="Department" value={companyInfo.department} />
        <Field tile label="Location" value={companyInfo.location} />
        <Field tile label="Address" value={companyInfo.address} />
        <Field tile label="Contact person" value={companyInfo.contactPerson} />
        <Field tile label="Contact number" value={companyInfo.contactNumber} />
      </Section>

      <Section title="User info" icon={UserRound} accent="green" gridClassName="grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <Field tile label="User name" value={userInfo.userName} />
        <Field tile label="User number" value={userInfo.userNumber} />
        <Field tile label="User email" value={userInfo.userEmail} />
        <Field tile label="User address" value={userInfo.userAddress} />
      </Section>

      <Section title="Product info" icon={Package} accent="amber" gridClassName="grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <Field tile label="Product name" value={productInfo.productName} />
        {!isEmailTicket && <Field tile label="Description" value={productInfo.productDescription} />}
        <Field tile label="Model" value={productInfo.productModel} />
        <Field tile label="Serial number" value={productInfo.productSerialNumber} />
      </Section>

      {ticket.attachments?.length > 0 && (
        <div className="bg-surface-card border border-surface-border rounded-xl p-5 mb-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-sm font-semibold text-text-primary">Attachments</h3>
            {canManageAttachments && !chatReadOnly && (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-surface-border bg-surface-page px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-page/80">
                + Add attachment
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.txt,.log"
                  onChange={handleAttachmentChange}
                  className="hidden"
                />
              </label>
            )}
          </div>
          <div className="space-y-2">
            {ticket.attachments.map((attachment) => (
              <a
                key={`${attachment.url}-${attachment.filename}`}
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-page px-3 py-2 text-sm text-brand-purple hover:bg-surface-page/80"
              >
                <span aria-hidden="true">📎</span>
                <span className="truncate" title={attachment.filename}>{attachment.filename}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {role !== "client" && (
        <div
          ref={manageSectionRef}
          className={`bg-surface-card border border-surface-border rounded-xl p-5 mb-4 ${highlightManage ? "ring-2 ring-brand-purple bg-brand-purple/5 transition-shadow" : ""}`}
        >
          <h3 className="text-sm font-semibold text-text-primary mb-4">
            {canEdit ? "Manage ticket" : "Ticket management (view only)"}
          </h3>

          {canEdit && isEditing ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-text-secondary">Status</label>
                  <select
                    ref={statusSelectRef}
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    disabled={["Closed", "Cancelled"].includes(ticketInfo.status)}
                    className={`${inputClass} mt-1 disabled:cursor-not-allowed disabled:bg-surface-page disabled:text-text-secondary disabled:opacity-70`}
                  >
                    {editableStatusOptions.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-text-secondary">Assign to</label>
                  <select
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    disabled={!['Assigned', 'Re-Assigned'].includes(status)}
                    className={`${inputClass} mt-1 disabled:cursor-not-allowed disabled:bg-surface-page disabled:text-text-secondary disabled:opacity-70`}
                  >
                    <option value="">-- Unassigned --</option>
                    {technicians.map((t) => (
                      <option key={t._id} value={t.name}>
                        {t.role === "admin" ? `${t.name}${String(t._id) === String(userId) ? " (You)" : " - Team Lead"}` : t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saveMutation.isPending || (["Assigned", "Re-Assigned"].includes(status) && !assignedTo.trim())}
                  className="bg-brand-purple text-white px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {saveMutation.isPending ? "Saving..." : "Save changes"}
                </button>
                {saved && <span className="text-sm text-status-closed">✓ Saved</span>}
                {saveMutation.isError && <span className="text-sm text-status-critical">Save failed — try again</span>}
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Field label="Status" value={status} />
                <Field label="Assigned to" value={assignedTo || "Unassigned"} />
              </div>

            </>
          )}

        </div>
      )}

      {canShowResolutionCard && (
        <div className="bg-surface-card border border-surface-border rounded-xl p-5 mb-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Resolution</h3>
          {canEditResolution ? (
            <>
              <p className="mb-3 text-sm text-text-secondary">
                Describe how the issue was resolved, then close the ticket
              </p>
              <label className="block text-xs text-text-secondary">
                Action taken
                <textarea
                  value={resolutionNotes}
                  onChange={(event) => setResolutionNotes(event.target.value)}
                  rows={3}
                  className={`${inputClass} mt-1`}
                  placeholder="Notes on what was done to resolve this"
                />
              </label>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveResolutionNotes}
                  disabled={saveResolutionNotesMutation.isPending}
                  className="border border-surface-border bg-surface-page px-4 py-2 text-sm font-medium text-text-primary rounded-lg hover:bg-surface-page/80 transition-colors disabled:opacity-50"
                >
                  {saveResolutionNotesMutation.isPending ? "Saving..." : "Save notes"}
                </button>
                <button
                  type="button"
                  onClick={handleCloseTicket}
                  disabled={saveMutation.isPending}
                  className="bg-status-critical text-white px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  Close Ticket
                </button>
                {saved && <span className="text-sm text-status-closed">✓ Saved</span>}
                {saveResolutionNotesMutation.isError && (
                  <span className="text-sm text-status-critical">Save failed — try again</span>
                )}
                {saveMutation.isError && <span className="text-sm text-status-critical">Save failed — try again</span>}
              </div>
            </>
          ) : (
            <>
              <p className="whitespace-pre-wrap text-sm text-text-secondary">
                {ticket.assignment.actionTaken}
              </p>
              {isClosedTicket && role !== "it_staff" && ticket.canReopen === true && (
                <button
                  type="button"
                  onClick={handleOpenReopenModal}
                  className="mt-4 bg-brand-purple text-white px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Reopen ticket
                </button>
              )}
              {isClosedTicket && role === "client" && ticket.canReopen !== true && (
                <Link
                  to="/raise-ticket"
                  state={{
                    followUpTicket: {
                      ticketNumber: ticket.ticketNumber || ticket._id,
                      issueTitle: ticketInfo.issueReported,
                      productInfo: {
                        productName: productInfo?.productName || "",
                        productDescription: productInfo?.productDescription || "",
                        productModel: productInfo?.productModel || "",
                        productSerialNumber: productInfo?.productSerialNumber || "",
                        warrantyStatus: productInfo?.warrantyStatus || "",
                      },
                    },
                  }}
                  className="mt-4 inline-block text-sm font-medium text-brand-purple hover:underline"
                >
                  Raise a follow-up ticket
                </Link>
              )}
            </>
          )}
          {ticket.reopenHistory?.length > 0 && (
            <details className="mt-5 border-t border-surface-border pt-4">
              <summary className="cursor-pointer text-sm font-medium text-text-primary">
                Reopen history ({ticket.reopenHistory.length})
              </summary>
              <ol className="mt-3 space-y-4">
                {ticket.reopenHistory.map((entry, index) => (
                  <li key={`${entry.reopenedAt}-${index}`} className="border-l border-surface-border pl-4">
                    <p className="text-sm font-medium text-text-primary">
                      {new Date(entry.reopenedAt).toLocaleString()} by {entry.reopenedBy?.name || entry.reopenedBy?.email || "Unknown user"}
                    </p>
                    <p className="mt-1 text-sm text-text-secondary">Reason: {entry.reason}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">
                      Previous resolution: {entry.previousActionTaken || "—"}
                    </p>
                    {entry.previousSupportType && (
                      <p className="mt-1 text-xs text-text-secondary">Previous support type: {entry.previousSupportType}</p>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}

      {feedback && (
        <Section title="Feedback">
          <Field label="Rating" value={`${feedback.rating} / 5`} />
          <Field label="Comment" value={feedback.comment} />
        </Section>
      )}

      {chatOpen && chatActive && !chatForbidden && (
        <div ref={chatContainerRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-surface-card p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">Conversation</h3>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
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
                            {message.isInternal && (
                              <span className={isOwnMessage ? "text-white/70" : "text-status-critical"}>Internal note</span>
                            )}
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

            {chatReadOnly ? (
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
                    className={`${inputClass} flex-1`}
                  />
                  <button
                    type="submit"
                    disabled={!messageText.trim() || messageMutation.isPending}
                    className="bg-brand-purple text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {messageMutation.isPending ? "Sending..." : "Send"}
                  </button>
                </form>

                {role !== "client" && (
                  <label className="mt-2 inline-flex items-center gap-2 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      checked={isInternalNote}
                      onChange={(event) => setIsInternalNote(event.target.checked)}
                      className="h-4 w-4 accent-brand-purple"
                    />
                    Internal note
                  </label>
                )}

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

      {role === "client" && ticketInfo.status === "Closed" && feedback?.rating == null && (
        <div className="bg-surface-card border border-surface-border rounded-xl p-5 mb-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Share your feedback</h3>
          <FeedbackForm
            ticketId={id}
          />
        </div>
      )}

      {closeModalOpen && (
        <CloseTicketModal
          resolutionRemarks={resolutionRemarks}
          setResolutionRemarks={setResolutionRemarks}
          supportType={supportType}
          setSupportType={setSupportType}
          onCancel={handleCancelClose}
          onConfirm={handleConfirmClose}
          isPending={saveMutation.isPending}
        />
      )}
      {reopenModalOpen && (
        <ReopenTicketModal
          reason={reopenReason}
          setReason={setReopenReason}
          error={reopenMutation.error?.response?.data?.error || (reopenMutation.isError ? "Couldn't reopen this ticket. Try again." : "")}
          onCancel={() => setReopenModalOpen(false)}
          onConfirm={handleReopenSubmit}
          isPending={reopenMutation.isPending}
        />
      )}
    </div>
  );
}