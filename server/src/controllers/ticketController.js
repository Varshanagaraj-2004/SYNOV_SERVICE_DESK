const logger = require('../utils/logger');
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const Message = require('../models/Message');
const TicketActivity = require('../models/TicketActivity');
const User = require('../models/User');
const Company = require('../models/Company');
const { canAccessTicket: userCanAccessTicket, getAssignedTicketFilter } = require('../utils/access');
const { createTicketWithRetry } = require('../utils/ticketNumber');
const { generateTicketExcel } = require('../utils/ticketExcelExporter');
const {
  ticketRaisedClientEmail,
  ticketRaisedInternalEmail,
  ticketAssignedTechnicianEmail,
  ticketReopenedTechnicianEmail,
  ticketClosedClientEmail,
} = require('../services/emailService');
const deleteUploadedFiles = require('../utils/deleteUploadedFiles');
const { parsePagination } = require('../utils/pagination');
const { publishTicketEvent } = require('../services/ticketEventService');

const ALLOWED_STATUS_TRANSITIONS = {
  New: ['Assigned', 'Cancelled'],
  'Un-Assigned': ['Assigned', 'Cancelled'],
  Assigned: ['Re-Assigned', 'Closed', 'Cancelled'],
  'Re-Assigned': ['Assigned', 'Closed', 'Cancelled'],
  Closed: [],
};

function getReopenWindowDays() {
  if (!process.env.REOPEN_WINDOW_DAYS) return 7;
  const days = Number(process.env.REOPEN_WINDOW_DAYS);
  return Number.isFinite(days) && days >= 0 ? days : 7;
}

function isWithinReopenWindow(ticket, now = Date.now()) {
  const closedAt = ticket.resolvedAt || ticket.updatedAt;
  if (!closedAt) return false;
  const age = now - new Date(closedAt).getTime();
  return age >= 0 && age <= getReopenWindowDays() * 24 * 60 * 60 * 1000;
}

function canReopenTicket(user, ticket) {
  if (ticket.ticketInfo?.status !== 'Closed') return false;
  if (user.role === 'admin') return true;
  return user.role === 'client'
    && userCanAccessTicket(user, ticket)
    && isWithinReopenWindow(ticket);
}

function logTicketActivity({ ticketId, actorId = null, actorName, actorRole, type, from, to, note = '' }) {
  return TicketActivity.create({ ticketId, actorId, actorName, actorRole, type, from, to, note });
}

function parseMultipartTicketBody(body = {}) {
  const parsed = { ...body };
  ['ticketInfo', 'companyInfo', 'userInfo', 'productInfo', 'assignment', 'feedback'].forEach((field) => {
    if (typeof parsed[field] === 'string') {
      try {
        parsed[field] = JSON.parse(parsed[field]);
      } catch {
        // Keep the original string if it is not valid JSON.
      }
    }
  });

  return parsed;
}

function pickFields(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(fields
    .filter((field) => Object.hasOwn(value, field))
    .map((field) => [field, value[field]]));
}

function calculateSlaDueAt(priority, fromDate = new Date()) {
  const slaHoursByPriority = {
    Critical: 4,
    High: 8,
    Medium: 24,
    Low: 72,
  };

  const hours = slaHoursByPriority[priority] ?? 24;
  const dueAt = new Date(fromDate.getTime());
  dueAt.setHours(dueAt.getHours() + hours);
  return dueAt;
}

async function canAccessTicket(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ error: 'Invalid ticket ID' });
    return null;
  }

  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return null;
  }

  if (!userCanAccessTicket(req.user, ticket)) {
    res.status(403).json({ error: 'You do not have access to this ticket' });
    return null;
  }

  return ticket;
}

async function requireChatEnabled(ticket, res) {
  if (['Closed', 'Cancelled'].includes(ticket.ticketInfo?.status)) {
    res.status(400).json({ error: 'Chat is unavailable for closed or cancelled tickets' });
    return false;
  }

  const assignment = ticket.assignment || {};
  const technicianQuery = assignment.assignedToId
    ? { _id: assignment.assignedToId, role: { $in: ['it_staff', 'admin'] }, active: { $ne: false } }
    : assignment.assignedTo
      ? { name: assignment.assignedTo, role: { $in: ['it_staff', 'admin'] }, active: { $ne: false } }
      : null;
  const technician = technicianQuery
    ? await User.findOne(technicianQuery).select('_id')
    : null;

  if (!technician) {
    res.status(400).json({ error: 'Chat is unavailable until an assigned technician exists' });
    return false;
  }

  return true;
}

async function getMessages(req, res) {
  const ticket = await canAccessTicket(req, res);
  if (!ticket) return;

  const filter = { ticketId: ticket._id };
  if (req.user.role === 'client') filter.isInternal = { $ne: true };
  const messages = await Message.find(filter).sort({ createdAt: 1 });
  res.json(messages);
}

async function markMessagesRead(req, res) {
  const ticket = await canAccessTicket(req, res);
  if (!ticket) return;

  const filter = {
    ticketId: ticket._id,
    senderId: { $ne: req.user.id },
    readBy: { $ne: req.user.id },
  };
  if (req.user.role === 'client') filter.isInternal = { $ne: true };
  const result = await Message.updateMany(filter, { $addToSet: { readBy: req.user.id } });
  res.json({ success: true, modifiedCount: result.modifiedCount });
}

async function getTicketActivity(req, res) {
  const ticket = await canAccessTicket(req, res);
  if (!ticket) return;
  const activity = await TicketActivity.find({ ticketId: ticket._id }).sort({ createdAt: 1 });
  res.json(activity);
}

async function getRecentMessages(req, res) {
  const { role, companyId, id: userId } = req.user;
  let ticketFilter = {};
  if (role === 'client') ticketFilter = { 'companyInfo.companyId': companyId };
  else if (role === 'it_staff') ticketFilter = getAssignedTicketFilter(req.user);

  const ticketIds = await Ticket.find(ticketFilter).distinct('_id');

  let visibleTicketIds = ticketIds;
  if (role === 'admin') {
    // Admin can technically view every ticket, but should only be
    // NOTIFIED about conversations they've personally taken part in —
    // not every client<->technician exchange in the system.
    visibleTicketIds = await Message.find({ senderId: userId }).distinct('ticketId');
  }

  const messageFilter = {
    ticketId: { $in: visibleTicketIds },
    senderId: { $ne: new mongoose.Types.ObjectId(userId) },
    readBy: { $ne: new mongoose.Types.ObjectId(userId) },
  };
  if (role === 'client') messageFilter.isInternal = { $ne: true };
  const messages = await Message.aggregate([
    { $match: messageFilter },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$ticketId',
        unreadCount: { $sum: 1 },
        createdAt: { $first: '$createdAt' },
      },
    },
    { $sort: { createdAt: -1 } },
    { $limit: 30 },
    {
      $lookup: {
        from: Ticket.collection.name,
        localField: '_id',
        foreignField: '_id',
        as: 'ticket',
      },
    },
    { $unwind: { path: '$ticket', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        ticketId: '$_id',
        ticketNumber: { $ifNull: ['$ticket.ticketNumber', ''] },
        companyName: { $ifNull: ['$ticket.companyInfo.companyName', 'Unknown company'] },
        unreadCount: 1,
        createdAt: 1,
      },
    },
  ]);

  res.json(messages);
}

async function postMessage(req, res) {
  const ticket = await canAccessTicket(req, res);
  if (!ticket) return;
  if (!await requireChatEnabled(ticket, res)) return;

  const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (!text) {
    return res.status(400).json({ error: 'Message text is required' });
  }
  const isInternal = req.body.isInternal === true;
  if (isInternal && !['admin', 'it_staff'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only staff can post internal notes' });
  }

  const message = await Message.create({
    ticketId: ticket._id,
    senderId: req.user.id,
    senderName: req.user.name,
    senderRole: req.user.role,
    text,
    isInternal,
  });
  res.status(201).json(message);

  void publishTicketEvent(ticket, 'message', {
    message: {
      _id: String(message._id),
      senderId: String(message.senderId),
      senderName: message.senderName,
      senderRole: message.senderRole,
      text: message.text,
      createdAt: message.createdAt,
      isInternal,
    },
  }, { includeCompanyClients: !isInternal }).catch((error) => {
    logger.error('Failed to publish ticket message event:', error.stack || error);
  });

  if (isInternal) return;
}

// GET /api/tickets — scoped by the logged-in user's role.
// Mirrors the frontend's getVisibleTickets() logic exactly, so the
// server enforces the same rule the UI was only simulating before.
function parseTicketDate(value, endOfDay = false) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCHours(23, 59, 59, 999);
  return date;
}

function buildTicketFilter(req) {
  const { role, companyId } = req.user;
  const filters = [];

  if (role === 'client') {
    filters.push({ 'companyInfo.companyId': companyId });
  } else if (role === 'it_staff') {
    filters.push(getAssignedTicketFilter(req.user));
  }

  if (req.query.companyId) {
    if (!mongoose.isValidObjectId(req.query.companyId)) return { error: 'Invalid companyId' };
    filters.push({ 'companyInfo.companyId': new mongoose.Types.ObjectId(req.query.companyId) });
  }
  if (req.query.status) filters.push({ 'ticketInfo.status': req.query.status });
  if (req.query.priority) filters.push({ 'ticketInfo.priority': req.query.priority });
  if (req.query.reopened === 'true') {
    filters.push({
      reopenCount: { $gt: 0 },
      'ticketInfo.status': { $nin: ['Closed', 'Cancelled'] },
    });
  }
  if (req.query.source) {
    const source = String(req.query.source).toLowerCase();
    if (source === 'email') filters.push({ source: { $in: ['email', 'mail'] } });
    else if (source === 'api') filters.push({ source: { $in: ['api', 'rest', 'integration'] } });
    else if (source === 'portal') filters.push({ source: { $nin: ['email', 'mail', 'api', 'rest', 'integration'] } });
    else filters.push({ source: req.query.source });
  }
  if (req.query.slaBreached === 'true') {
    filters.push({
      'ticketInfo.status': { $nin: ['Closed', 'Cancelled'] },
      slaDueAt: { $lte: new Date() },
    });
  }
  if (req.query.q) {
    if (typeof req.query.q !== 'string') return { error: 'q must be a string' };
    const escapedQuery = req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const search = new RegExp(escapedQuery, 'i');
    filters.push({ $or: [{ ticketNumber: search }, { 'ticketInfo.issueReported': search }] });
  }

  if (req.query.from || req.query.to) {
    const dateFilter = {};
    if (req.query.from) {
      const from = parseTicketDate(req.query.from);
      if (!from) return { error: 'Invalid from date' };
      dateFilter.$gte = from;
    }
    if (req.query.to) {
      const to = parseTicketDate(req.query.to, true);
      if (!to) return { error: 'Invalid to date' };
      dateFilter.$lte = to;
    }
    if (dateFilter.$gte && dateFilter.$lte && dateFilter.$gte > dateFilter.$lte) {
      return { error: 'from must be on or before to' };
    }
    filters.push({ createdAt: dateFilter });
  }

  return { filter: filters.length > 1 ? { $and: filters } : filters[0] || {} };
}

async function getTickets(req, res) {
  const pagination = parsePagination(req.query, 10);
  if (pagination.error) return res.status(400).json({ error: pagination.error });
  const { filter, error } = buildTicketFilter(req);
  if (error) return res.status(400).json({ error });

  const total = await Ticket.countDocuments(filter);
  const pages = Math.ceil(total / pagination.limit);
  const page = Math.min(pagination.page, Math.max(pages, 1));
  const items = await Ticket.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * pagination.limit)
    .limit(pagination.limit)
    .populate('reopenedBy', 'name')
    .lean();

  res.json({ items, total, page, pages });
}

async function getTicketStats(req, res) {
  const { filter, error } = buildTicketFilter({ ...req, query: { ...req.query, status: undefined, priority: undefined, source: undefined, q: undefined, from: undefined, to: undefined, reopened: undefined } });
  if (error) return res.status(400).json({ error });

  const openStatuses = { 'ticketInfo.status': { $nin: ['Closed', 'Cancelled'] } };
  const [total, statusRows, priorityRows, slaBreached, unassigned, reopened] = await Promise.all([
    Ticket.countDocuments(filter),
    Ticket.aggregate([{ $match: filter }, { $group: { _id: '$ticketInfo.status', count: { $sum: 1 } } }]),
    Ticket.aggregate([{ $match: filter }, { $group: { _id: '$ticketInfo.priority', count: { $sum: 1 } } }]),
    Ticket.countDocuments({ $and: [filter, openStatuses, { slaDueAt: { $lte: new Date() } }] }),
    Ticket.countDocuments({ $and: [filter, { 'ticketInfo.status': 'Un-Assigned' }] }),
    Ticket.countDocuments({
      $and: [filter, { reopenCount: { $gt: 0 } }, openStatuses],
    }),
  ]);

  res.json({
    total,
    byStatus: Object.fromEntries(statusRows.map(({ _id, count }) => [_id || 'Unknown', count])),
    byPriority: Object.fromEntries(priorityRows.map(({ _id, count }) => [_id || 'Unknown', count])),
    slaBreached,
    unassigned,
    reopened,
  });
}

async function exportTicketExcel(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid ticket ID' });
  }

  const ticket = await Ticket.findById(req.params.id)
    .populate({
      path: 'companyInfo.companyId',
      model: 'Company',
      select: 'companyName contactPerson contactEmail contactNumber address location',
    })
    .lean();

  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  const history = await Message.find({ ticketId: ticket._id }).sort({ createdAt: 1 }).lean();

  const assignedAgentName = ticket.assignment?.assignedTo
    ? await User.findOne({ name: ticket.assignment.assignedTo, role: { $in: ['it_staff', 'admin'] }, active: { $ne: false } }).select('name email').lean()
    : null;

  const enrichedTicket = {
    ...ticket,
    ticketId: ticket.ticketNumber || String(ticket._id),
    subject: ticket.ticketInfo?.issueReported || ticket.subject || 'N/A',
    status: ticket.ticketInfo?.status || 'N/A',
    priority: ticket.ticketInfo?.priority || 'N/A',
    category: ticket.ticketInfo?.callType || 'N/A',
    requester: {
      name: ticket.userInfo?.userName || ticket.userInfo?.contactPerson || 'Unknown',
      email: ticket.userInfo?.userEmail || '',
    },
    company: {
      companyName: ticket.companyInfo?.companyName || ticket.companyInfo?.companyId?.companyName || 'N/A',
    },
    assignedAgent: {
      name: assignedAgentName?.name || ticket.assignment?.assignedTo || 'Unassigned',
      email: assignedAgentName?.email || '',
    },
    commentHistory: history.map((entry) => ({
      timestamp: entry.createdAt,
      author: { name: entry.senderName },
      message: entry.text,
    })),
  };

  const workbook = generateTicketExcel(enrichedTicket);
  const fileTicketId = ticket.ticketNumber || String(ticket._id);
  const filename = `ticket-${fileTicketId}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

// GET /api/tickets/:id
async function getTicketById(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid ticket ID' });
  }

  const ticket = await Ticket.findById(req.params.id)
    .populate('reopenedBy', 'name email role')
    .populate('reopenHistory.reopenedBy', 'name email role');
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  if (!userCanAccessTicket(req.user, ticket)) {
    return res.status(403).json({ error: 'You do not have access to this ticket' });
  }
  const ticketData = ticket.toObject();
  const canShowReopenReason = req.user.role !== 'client' || ticket.reopenedBy?.role === 'client';
  if (req.user.role === 'client') {
    if (!canShowReopenReason) ticketData.reopenReason = '';
    ticketData.reopenHistory = ticketData.reopenHistory.map((entry) => (
      entry.reopenedBy?.role === 'client' ? entry : { ...entry, reason: '' }
    ));
  }
  res.json({
    ...ticketData,
    canReopen: canReopenTicket(req.user, ticket),
    canShowReopenReason,
  });
}

// POST /api/tickets — Raise Ticket form
async function createTicket(req, res) {
  let ticketCreated = false;
  try {
    ticketCreated = await createTicketRequest(req, res) === true;
  } finally {
    if (!ticketCreated && !req.ticketAttachmentsSaved) await deleteUploadedFiles(req.files);
  }
}

async function createTicketRequest(req, res) {
  const parsedBody = parseMultipartTicketBody(req.body || {});
  const role = req.user.role;
  if (role !== 'client' && role !== 'admin') {
    return res.status(403).json({ error: 'Only clients and admins can create tickets' });
  }

  const requestedCompanyId = role === 'client'
    ? req.user.companyId
    : parsedBody.companyInfo?.companyId;
  if (!mongoose.isValidObjectId(requestedCompanyId)) {
    return res.status(400).json({ error: 'A valid company is required' });
  }

  const company = await Company.findById(requestedCompanyId).select('companyName');
  if (!company) return res.status(404).json({ error: 'Company not found' });

  let assignedTo = '';
  let assignedToId = null;
  if (role === 'admin' && parsedBody.assignment?.assignedTo) {
    if (typeof parsedBody.assignment.assignedTo !== 'string') {
      return res.status(400).json({ error: 'Assigned technician must be a name' });
    }

    const requestedTechnicianName = parsedBody.assignment.assignedTo.trim();
    if (requestedTechnicianName) {
      const technician = await User.findOne({
        name: requestedTechnicianName,
        role: { $in: ['it_staff', 'admin'] },
        active: { $ne: false },
      }).select('_id name');
      if (!technician) return res.status(400).json({ error: 'Assigned technician was not found' });
      assignedTo = technician.name;
      assignedToId = technician._id;
    }
  }

  const now = new Date();
  const ticketInfo = {
    ...pickFields(parsedBody.ticketInfo, [
      'priority',
      'callLoggedTime',
      'callType',
      'issueReported',
      'supportType',
    ]),
    callLoggedDate: now,
    status: assignedTo ? 'Assigned' : 'Un-Assigned',
  };
  const ticket = await createTicketWithRetry({
    ticketInfo,
    description: typeof parsedBody.description === 'string' ? parsedBody.description : '',
    requester: req.user.id,
    source: 'web',
    companyInfo: {
      ...pickFields(parsedBody.companyInfo, [
        'department',
        'address',
        'location',
        'contactPerson',
        'contactNumber',
        'contactEmail',
      ]),
      companyId: company._id,
      companyName: company.companyName,
    },
    userInfo: pickFields(parsedBody.userInfo, ['userName', 'userNumber', 'userEmail', 'userAddress']),
    productInfo: pickFields(parsedBody.productInfo, [
      'productName',
      'productDescription',
      'productModel',
      'productSerialNumber',
      'warrantyStatus',
    ]),
    project: typeof parsedBody.project === 'string' ? parsedBody.project : '',
    assignment: {
      assignedBy: assignedTo ? req.user.name : '',
      assignedTo,
      assignedToId,
      assignedOn: assignedTo ? now : null,
      assignStatus: assignedTo ? 'Assigned' : 'Pending',
      actionTaken: '',
      accompaniedBy: '',
    },
    slaDueAt: calculateSlaDueAt(ticketInfo.priority, now),
  });

  if (req.files && req.files.length > 0) {
    ticket.attachments = req.files.map((file) => ({
      filename: file.originalname,
      url: file.path,
      uploadedAt: new Date(),
    }));
    await ticket.save();
    req.ticketAttachmentsSaved = true;
  }

  await logTicketActivity({
    ticketId: ticket._id,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    type: 'created',
    to: { status: ticket.ticketInfo.status, priority: ticket.ticketInfo.priority },
    note: ticket.ticketInfo.issueReported,
  });
  if (req.files?.length) {
    await logTicketActivity({
      ticketId: ticket._id,
      actorId: req.user.id,
      actorName: req.user.name,
      actorRole: req.user.role,
      type: 'attachment_added',
      from: 0,
      to: req.files.length,
      note: req.files.map((file) => file.originalname).join(', '),
    });
  }
  if (assignedTo) {
    await logTicketActivity({
      ticketId: ticket._id,
      actorId: req.user.id,
      actorName: req.user.name,
      actorRole: req.user.role,
      type: 'assigned',
      to: assignedTo,
      note: 'Assigned during ticket creation',
    });
  }

  const requester = await User.findById(req.user.id).select('email name');
  void ticketRaisedClientEmail(ticket, requester?.email);
  void ticketRaisedInternalEmail(ticket);
  res.status(201).json(ticket);
  return true;
}

async function addTicketAttachment(req, res) {
  const ticket = await canAccessTicket(req, res);
  if (!ticket) return;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'At least one attachment is required' });
  }
  if ((ticket.attachments?.length || 0) + req.files.length > 20) {
    return res.status(400).json({ error: 'A ticket can have no more than 20 attachments' });
  }

  const uploadedAttachments = req.files.map((file) => ({
    filename: file.originalname,
    url: file.path,
    uploadedAt: new Date(),
  }));

  ticket.attachments = [...(ticket.attachments || []), ...uploadedAttachments];
  await ticket.save();
  await logTicketActivity({
    ticketId: ticket._id,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    type: 'attachment_added',
    from: ticket.attachments.length - uploadedAttachments.length,
    to: ticket.attachments.length,
    note: uploadedAttachments.map((attachment) => attachment.filename).join(', '),
  });
  res.json(ticket);
}

// PATCH /api/tickets/:id/status — Manage Ticket panel
async function updateTicketStatus(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid ticket ID' });
  }

  const {
    status,
    assignedTo,
    actionTaken,
    supportType,
    priority,
  } = req.body;

  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  if (req.user.role === 'it_staff' && !userCanAccessTicket(req.user, ticket)) {
    return res.status(403).json({ error: 'You can only update tickets assigned to you' });
  }
  if (req.user.role === 'it_staff' && assignedTo !== undefined && assignedTo !== ticket.assignment.assignedTo) {
    return res.status(403).json({ error: 'Only an admin can reassign a ticket' });
  }

  const statusValues = Ticket.schema.path('ticketInfo.status').enumValues;
  const priorityValues = Ticket.schema.path('ticketInfo.priority').enumValues;
  if (status !== undefined && !statusValues.includes(status)) {
    return res.status(400).json({ error: 'Invalid ticket status' });
  }
  if (priority !== undefined && !priorityValues.includes(priority)) {
    return res.status(400).json({ error: 'Invalid ticket priority' });
  }

  let technician = null;
  let assignmentChanged = false;
  if (assignedTo !== undefined) {
    if (typeof assignedTo !== 'string') {
      return res.status(400).json({ error: 'Assigned technician must be a name' });
    }

    const requestedTechnicianName = assignedTo.trim();
    const currentAssignedTo = ticket.assignment?.assignedTo || '';
    if (!requestedTechnicianName && currentAssignedTo) {
      return res.status(400).json({ error: 'An assigned ticket cannot be unassigned' });
    }
    if (requestedTechnicianName) {
      technician = await User.findOne({
        name: requestedTechnicianName,
        role: { $in: ['it_staff', 'admin'] },
        active: { $ne: false },
      }).select('_id name email');
      if (!technician) return res.status(400).json({ error: 'Assigned technician was not found' });

      const currentAssignedToId = ticket.assignment?.assignedToId;
      assignmentChanged = currentAssignedToId
        ? String(currentAssignedToId) !== String(technician._id)
        : currentAssignedTo !== technician.name;
    }
  }

  const currentStatus = ticket.ticketInfo.status;
  let nextStatus = status === undefined ? currentStatus : status;
  if (assignmentChanged && (status === undefined || status === currentStatus)) {
    if (currentStatus === 'New' || currentStatus === 'Un-Assigned') {
      nextStatus = 'Assigned';
    } else if (currentStatus === 'Assigned' || currentStatus === 'Re-Assigned') {
      nextStatus = 'Re-Assigned';
    } else {
      return res.status(400).json({ error: 'Reopen the ticket before changing its assignment' });
    }
  }

  if (nextStatus !== currentStatus) {
    const allowedTransitions = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(nextStatus)) {
      return res.status(400).json({ error: `Cannot change status from ${currentStatus} to ${nextStatus}` });
    }
  }
  if ((nextStatus === 'Assigned' || nextStatus === 'Re-Assigned')
    && !(technician || ticket.assignment?.assignedToId || ticket.assignment?.assignedTo)) {
    return res.status(400).json({ error: 'Assign a technician before setting this status' });
  }
  if (status === 'Closed' && (typeof actionTaken !== 'string' || !actionTaken.trim())) {
    return res.status(400).json({ error: 'Resolution remarks are required to close a ticket' });
  }

  const wasClosed = currentStatus === 'Closed';
  const previousPriority = ticket.ticketInfo.priority;
  const previousAssignedTo = ticket.assignment?.assignedTo || '';
  if (nextStatus !== currentStatus) {
    ticket.ticketInfo.status = nextStatus;

    if (nextStatus === 'Closed' && !wasClosed) {
      ticket.resolvedAt = new Date();
    } else if (nextStatus !== 'Closed' && wasClosed) {
      ticket.resolvedAt = null;
    }
  }
  if (priority !== undefined && priority !== ticket.ticketInfo.priority) {
    ticket.ticketInfo.priority = priority;
    ticket.slaDueAt = calculateSlaDueAt(priority, ticket.createdAt || new Date());
    ticket.slaWarningSent = false;
    ticket.slaBreachedSent = false;
  }
  if (technician) {
    ticket.assignment.assignedTo = technician.name;
    ticket.assignment.assignedToId = technician._id;
    if (assignmentChanged) {
      ticket.assignment.assignedBy = req.user.name;
      ticket.assignment.assignedOn = new Date();
      ticket.assignment.assignStatus = nextStatus;
    }
  }
  if (actionTaken !== undefined) ticket.assignment.actionTaken = actionTaken;
  if (supportType !== undefined) ticket.ticketInfo.supportType = supportType;

  await ticket.save();
  const actor = { ticketId: ticket._id, actorId: req.user.id, actorName: req.user.name, actorRole: req.user.role };
  if (nextStatus !== currentStatus) {
    const reopened = currentStatus === 'Closed' && nextStatus !== 'Closed';
    await logTicketActivity({
      ...actor,
      type: reopened ? 'reopened' : 'status_changed',
      from: currentStatus,
      to: nextStatus,
      note: actionTaken || '',
    });
  }
  if (assignmentChanged && technician) {
    await logTicketActivity({
      ...actor,
      type: 'assigned',
      from: previousAssignedTo || null,
      to: technician.name,
    });
  }
  if (priority !== undefined && priority !== previousPriority) {
    await logTicketActivity({
      ...actor,
      type: 'priority_changed',
      from: previousPriority,
      to: priority,
    });
  }
  void publishTicketEvent(ticket, 'ticket_updated', {
    status: ticket.ticketInfo.status,
    priority: ticket.ticketInfo.priority,
    assignedTo: ticket.assignment?.assignedTo || null,
  }).catch((error) => {
    logger.error('Failed to publish ticket update event:', error.stack || error);
  });
  if (assignmentChanged) void ticketAssignedTechnicianEmail(ticket, technician);
  if (!wasClosed && nextStatus === 'Closed') {
    void (async () => {
      const requester = ticket.requester
        ? await User.findById(ticket.requester).select('email name')
        : null;
      return ticketClosedClientEmail(ticket, requester?.email);
    })().catch(() => {
      logger.warn('Ticket closure email skipped because the requester could not be loaded.');
    });
  }
  res.json(ticket);
}

async function reopenTicket(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid ticket ID' });
  }

  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  if (ticket.ticketInfo.status !== 'Closed') {
    return res.status(400).json({ error: 'Only closed tickets can be reopened' });
  }
  if (!['admin', 'client'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only admins or the ticket client can reopen this ticket' });
  }
  if (req.user.role === 'client' && !userCanAccessTicket(req.user, ticket)) {
    return res.status(403).json({ error: 'You can only reopen your own company tickets' });
  }

  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 5 || reason.length > 500) {
    return res.status(400).json({ error: 'Reopen reason must be between 5 and 500 characters' });
  }
  if (req.user.role === 'client' && !canReopenTicket(req.user, ticket)) {
    return res.status(403).json({ error: `Clients can reopen tickets only within ${getReopenWindowDays()} days of closure` });
  }

  const reopenedAt = new Date();
  const previousClosedAt = ticket.resolvedAt || ticket.updatedAt;
  const previousActionTaken = ticket.assignment?.actionTaken || '';
  const previousSupportType = ticket.ticketInfo.supportType || '';
  const nextStatus = ticket.assignment?.assignedTo ? 'Assigned' : 'Un-Assigned';

  ticket.reopenHistory.push({
    reopenedAt,
    reopenedBy: req.user.id,
    reason,
    previousActionTaken,
    previousSupportType,
    previousClosedAt,
  });
  ticket.reopenCount = (ticket.reopenCount || 0) + 1;
  ticket.reopenedAt = reopenedAt;
  ticket.reopenedBy = req.user.id;
  ticket.reopenReason = reason;
  ticket.ticketInfo.status = nextStatus;
  ticket.assignment.assignStatus = nextStatus;
  ticket.assignment.actionTaken = '';
  ticket.resolvedAt = null;

  await ticket.save();
  await logTicketActivity({
    ticketId: ticket._id,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    type: 'reopened',
    from: 'Closed',
    to: nextStatus,
    note: reason,
  });

  let technician = null;
  if (nextStatus === 'Assigned') {
    try {
      technician = ticket.assignment.assignedToId
        ? await User.findOne({
          _id: ticket.assignment.assignedToId,
          role: { $in: ['it_staff', 'admin'] },
          active: { $ne: false },
        }).select('name email active')
        : await User.findOne({
          name: ticket.assignment.assignedTo,
          role: { $in: ['it_staff', 'admin'] },
          active: { $ne: false },
        }).select('name email active');
    } catch {
      logger.warn('Unable to load the assigned technician for the reopen notification.');
    }
  }
  void ticketReopenedTechnicianEmail(
    ticket,
    technician?.active === false ? null : technician,
    req.user.name,
    reason
  );

  return res.json({ ...ticket.toObject(), canReopen: false });
}

async function submitFeedback(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid ticket ID' });
  }

  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  if (!userCanAccessTicket(req.user, ticket)) {
    return res.status(403).json({ error: 'You can only rate your own company\'s tickets' });
  }
  if (ticket.ticketInfo.status !== 'Closed') {
    return res.status(400).json({ error: 'Feedback can only be submitted for closed tickets' });
  }
  if (ticket.feedback?.rating !== undefined && ticket.feedback?.rating !== null) {
    return res.status(400).json({ error: 'Feedback has already been submitted' });
  }

  const { rating, comment } = req.body;
  if (typeof rating !== 'number' || !Number.isFinite(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be a number between 1 and 5' });
  }

  ticket.feedback = { rating, comment, submittedAt: new Date() };
  await ticket.save();
  await logTicketActivity({
    ticketId: ticket._id,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    type: 'feedback',
    to: rating,
    note: comment || '',
  });
  res.json(ticket);
}

module.exports = {
  getTickets,
  getTicketStats,
  getTicketById,
  exportTicketExcel,
  createTicket,
  addTicketAttachment,
  updateTicketStatus,
  reopenTicket,
  submitFeedback,
  getMessages,
  markMessagesRead,
  getTicketActivity,
  getRecentMessages,
  postMessage,
};