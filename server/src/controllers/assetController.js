const mongoose = require('mongoose');
const Asset = require('../models/Assets');
const Company = require('../models/Company');
const { parsePagination } = require('../utils/pagination');

async function validateSerialNumber(companyId, serialNumber, excludeId) {
  const filter = { companyId, serialNumber };
  if (excludeId) filter._id = { $ne: excludeId };
  return Asset.exists(filter);
}

// GET /api/assets — scoped by role: client sees only their own company's
// assets, IT staff/admin see everything (so they can look anything up
// without contacting the CRM team directly).
async function getAssets(req, res) {
  const pagination = parsePagination(req.query, 10);
  if (pagination.error) return res.status(400).json({ error: pagination.error });

  const { role, companyId } = req.user;
  const filters = [];

  if (role === 'client') {
    filters.push({ companyId });
  }
  if (req.query.companyId) {
    if (!mongoose.isValidObjectId(req.query.companyId)) return res.status(400).json({ error: 'Invalid companyId' });
    filters.push({ companyId: new mongoose.Types.ObjectId(req.query.companyId) });
  }
  if (req.query.status) filters.push({ status: req.query.status });
  if (req.query.q) {
    if (typeof req.query.q !== 'string') return res.status(400).json({ error: 'q must be a string' });
    const escapedQuery = req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const search = new RegExp(escapedQuery, 'i');
    filters.push({
      $or: [
        { crmId: search },
        { assetName: search },
        { serialNumber: search },
        { model: search },
        { company: search },
        { assignedTo: search },
      ],
    });
  }
  const filter = filters.length > 1 ? { $and: filters } : filters[0] || {};

  const total = await Asset.countDocuments(filter);
  const pages = Math.ceil(total / pagination.limit);
  const page = Math.min(pagination.page, Math.max(pages, 1));
  const items = await Asset.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * pagination.limit)
    .limit(pagination.limit)
    .exec();
  res.json({ items, total, page, pages });
}

async function createAsset(req, res) {
  const company = await Company.findById(req.body.companyId).select('companyName');
  if (!company) return res.status(400).json({ error: 'Company not found' });
  if (await validateSerialNumber(company._id, req.body.serialNumber)) {
    return res.status(409).json({ error: 'An asset with this serial number already exists for this company' });
  }

  const asset = await Asset.create({
    ...req.body,
    companyId: company._id,
    company: company.companyName,
  });
  res.status(201).json(asset);
}

async function updateAsset(req, res) {
  const staffAllowedFields = new Set(['status', 'location', 'assignedTo']);
  if (req.user.role === 'it_staff' && Object.keys(req.body).some((field) => !staffAllowedFields.has(field))) {
    return res.status(403).json({ error: 'IT staff may only update status, location, and assignee' });
  }
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid asset ID' });

  const asset = await Asset.findById(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  const nextCompanyId = req.body.companyId || asset.companyId;
  const nextSerialNumber = req.body.serialNumber || asset.serialNumber;
  if (await validateSerialNumber(nextCompanyId, nextSerialNumber, asset._id)) {
    return res.status(409).json({ error: 'An asset with this serial number already exists for this company' });
  }

  if (req.body.companyId) {
    const company = await Company.findById(req.body.companyId).select('companyName');
    if (!company) return res.status(400).json({ error: 'Company not found' });
    asset.companyId = company._id;
    asset.company = company.companyName;
  }
  for (const [field, value] of Object.entries(req.body)) {
    if (field !== 'companyId' && field !== 'company') asset[field] = value;
  }
  await asset.save();
  res.json(asset);
}

async function deleteAsset(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid asset ID' });
  const asset = await Asset.findByIdAndDelete(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  res.json({ success: true });
}

// GET /api/assets/:id
async function getAssetById(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid asset ID' });
  }

  const asset = await Asset.findById(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  if (
    req.user.role === 'client'
    && (!req.user.companyId || !asset.companyId || String(asset.companyId) !== String(req.user.companyId))
  ) {
    return res.status(403).json({ error: 'You do not have access to this asset' });
  }
  res.json(asset);
}

module.exports = { getAssets, getAssetById, createAsset, updateAsset, deleteAsset };