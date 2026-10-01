const mongoose = require('mongoose');
const Company = require('../models/Company');
const Ticket = require('../models/Ticket');
const { generateCompanyReport } = require('../utils/companyExcelExporter');
const { parsePagination } = require('../utils/pagination');

async function getCompanies(req, res) {
  const pagination = parsePagination(req.query, 10);
  if (pagination.error) return res.status(400).json({ error: pagination.error });

  const filters = [];
  if (req.user.role === 'client') filters.push({ _id: req.user.companyId || null });
  if (req.query.status) filters.push({ status: req.query.status });
  if (req.query.q) {
    if (typeof req.query.q !== 'string') return res.status(400).json({ error: 'q must be a string' });
    const escapedQuery = req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const search = new RegExp(escapedQuery, 'i');
    filters.push({ $or: [{ companyName: search }, { contactPerson: search }, { crmId: search }] });
  }
  const filter = filters.length > 1 ? { $and: filters } : filters[0] || {};
  const total = await Company.countDocuments(filter);
  const pages = Math.ceil(total / pagination.limit);
  const page = Math.min(pagination.page, Math.max(pages, 1));
  const items = await Company.find(filter)
    .sort({ companyName: 1 })
    .skip((page - 1) * pagination.limit)
    .limit(pagination.limit)
    .lean();
  res.json({ items, total, page, pages });
}

async function getCompanyById(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid company ID' });
  }

  const company = await Company.findById(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  if (
    req.user.role === 'client'
    && (!req.user.companyId || String(company._id) !== String(req.user.companyId))
  ) {
    return res.status(403).json({ error: 'You do not have access to this company' });
  }
  res.json(company);
}

async function getCompanyTickets(req, res) {
  const { companyId } = req.params;
  const { status, from, to, startDate, endDate } = req.query;

  const normalizedCompanyId = mongoose.Types.ObjectId.isValid(companyId)
    ? new mongoose.Types.ObjectId(companyId)
    : companyId;

  const filter = { 'companyInfo.companyId': normalizedCompanyId };

  if (status) {
    filter['ticketInfo.status'] = status;
  }

  if (from || startDate || to || endDate) {
    filter.createdAt = {};

    const lowerBound = from || startDate;
    const upperBound = to || endDate;

    if (lowerBound) {
      const parsedFrom = new Date(lowerBound);
      if (Number.isNaN(parsedFrom.getTime())) {
        return res.status(400).json({ error: 'Invalid from/startDate value' });
      }
      filter.createdAt.$gte = parsedFrom;
    }

    if (upperBound) {
      const parsedTo = new Date(upperBound);
      if (Number.isNaN(parsedTo.getTime())) {
        return res.status(400).json({ error: 'Invalid to/endDate value' });
      }
      parsedTo.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = parsedTo;
    }
  }

  const tickets = await Ticket.find(filter)
    .populate({
      path: 'requester',
      model: 'User',
      select: 'name email',
    })
    .sort({ createdAt: -1 })
    .lean();

  const payload = tickets.map((ticket) => ({
    _id: ticket._id,
    ticketNumber: ticket.ticketNumber,
    requesterName: ticket.requester?.name || 'Unknown',
    requesterEmail: ticket.requester?.email || null,
    status: ticket.ticketInfo?.status || 'N/A',
    priority: ticket.ticketInfo?.priority || 'N/A',
    category: ticket.ticketInfo?.supportType || ticket.ticketInfo?.callType || 'N/A',
    assignedAgent: ticket.assignment?.assignedTo || 'Unassigned',
    createdAt: ticket.createdAt,
  }));

  res.json(payload);
}

async function exportCompanyTickets(req, res) {
  const { companyId } = req.params;
  const normalizedCompanyId = mongoose.Types.ObjectId.isValid(companyId)
    ? new mongoose.Types.ObjectId(companyId)
    : companyId;

  const company = await Company.findById(normalizedCompanyId).lean();
  if (!company) {
    return res.status(404).json({ error: 'Company not found' });
  }
  const tickets = await Ticket.find({ 'companyInfo.companyId': normalizedCompanyId }).sort({ createdAt: -1 }).lean();
  const workbook = generateCompanyReport(company, tickets);
  const safeCompanyName = (company.companyName || 'company').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'company';
  const filename = `${safeCompanyName}-tickets-report.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { getCompanies, getCompanyById, getCompanyTickets, exportCompanyTickets };