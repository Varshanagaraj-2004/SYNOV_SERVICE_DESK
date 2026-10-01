const { z } = require('zod');
const deleteUploadedFiles = require('../utils/deleteUploadedFiles');

const priorities = ['Critical', 'High', 'Medium', 'Low'];
const statuses = ['New', 'Un-Assigned', 'Assigned', 'Closed', 'Cancelled', 'Re-Assigned'];
const assetStatuses = ['In Use', 'In Storage', 'Under Repair', 'Retired'];
const optionalText = (max = 5000) => z.string().max(max).optional();
const optionalCrmId = z.preprocess((value) => (value === '' ? undefined : value), z.string().max(100).optional());
const passwordSchema = z.string().min(8).max(128)
  .regex(/[A-Za-z]/, 'New password must include a letter')
  .regex(/\d/, 'New password must include a number');

const schemas = {
  login: z.object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(128),
  }),
  forgotPassword: z.object({ email: z.string().trim().email().max(254) }),
  resetPassword: z.object({
    token: z.string().regex(/^[a-f0-9]{64}$/i, 'Reset token is invalid'),
    newPassword: passwordSchema,
  }),
  changePassword: z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  }),
  createTicket: z.object({
    ticketInfo: z.object({
      callLoggedDate: optionalText(40),
      callLoggedTime: optionalText(20),
      priority: z.enum(priorities),
      status: z.enum(statuses).optional(),
      callType: optionalText(120),
      issueReported: z.string().trim().min(1).max(5000),
      supportType: optionalText(120),
    }),
    companyInfo: z.object({
      companyId: z.string().optional(),
      companyName: optionalText(200),
      department: optionalText(200),
      address: optionalText(1000),
      location: optionalText(200),
      contactPerson: optionalText(200),
      contactNumber: optionalText(50),
      contactEmail: z.union([z.string().email().max(254), z.literal('')]).optional(),
    }),
    userInfo: z.object({
      userName: optionalText(200),
      userNumber: optionalText(50),
      userEmail: z.union([z.string().email().max(254), z.literal('')]).optional(),
      userAddress: optionalText(1000),
    }).optional(),
    productInfo: z.object({
      productName: optionalText(200),
      productDescription: optionalText(2000),
      productModel: optionalText(200),
      productSerialNumber: optionalText(200),
      warrantyStatus: optionalText(120),
    }).optional(),
    project: optionalText(200),
    description: optionalText(5000),
    assignment: z.object({ assignedTo: optionalText(200) }).optional(),
    feedback: z.null().optional(),
  }),
  updateTicketStatus: z.object({
    status: z.enum(statuses).optional(),
    assignedTo: optionalText(200),
    actionTaken: optionalText(5000),
    supportType: optionalText(120),
    priority: z.enum(priorities).optional(),
  }).refine((body) => Object.keys(body).length > 0, 'At least one ticket field is required'),
  reopenTicket: z.object({
    reason: z.string().trim().min(5, 'Reopen reason must be at least 5 characters').max(500, 'Reopen reason must be at most 500 characters'),
  }),
  postMessage: z.object({
    text: z.string().trim().min(1).max(5000),
    isInternal: z.boolean().optional(),
  }),
  submitFeedback: z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(1000).optional().default(''),
  }),
  createClientUser: z.object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(254),
    companyId: z.string().optional(),
    department: optionalText(200),
    phone: optionalText(50),
    address: optionalText(1000),
  }),
  updateClientUser: z.object({
    name: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email().max(254).optional(),
    department: optionalText(200),
    phone: optionalText(50),
    address: optionalText(1000),
    isCompanyAdmin: z.boolean().optional(),
  }).refine((body) => Object.keys(body).length > 0, 'At least one user field is required'),
  createStaff: z.object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(254),
    designation: z.string().trim().max(200).default(''),
    role: z.enum(['it_staff', 'admin']),
  }),
  updateStaff: z.object({
    name: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email().max(254).optional(),
    designation: z.string().trim().max(200).optional(),
    role: z.enum(['it_staff', 'admin']).optional(),
  }).refine((body) => Object.keys(body).length > 0, 'At least one staff field is required'),
  createAsset: z.object({
    crmId: optionalCrmId,
    assetName: z.string().trim().min(1).max(300),
    type: optionalText(120),
    configuration: optionalText(2000),
    model: optionalText(200),
    serialNumber: z.string().trim().min(1).max(200),
    companyId: z.string().regex(/^[a-f\d]{24}$/i, 'companyId must be a valid ID'),
    assignedTo: optionalText(200),
    location: optionalText(200),
    purchaseDate: z.coerce.date().nullable().optional(),
    warrantyExpiry: z.coerce.date().nullable().optional(),
    status: z.enum(assetStatuses).optional(),
  }),
  updateAsset: z.object({
    crmId: optionalCrmId,
    assetName: z.string().trim().min(1).max(300).optional(),
    type: optionalText(120),
    configuration: optionalText(2000),
    model: optionalText(200),
    serialNumber: z.string().trim().min(1).max(200).optional(),
    companyId: z.string().regex(/^[a-f\d]{24}$/i, 'companyId must be a valid ID').optional(),
    assignedTo: optionalText(200),
    location: optionalText(200),
    purchaseDate: z.coerce.date().nullable().optional(),
    warrantyExpiry: z.coerce.date().nullable().optional(),
    status: z.enum(assetStatuses).optional(),
  }).refine((body) => Object.keys(body).length > 0, 'At least one asset field is required'),
};

const multipartJsonFields = ['ticketInfo', 'companyInfo', 'userInfo', 'productInfo', 'assignment', 'feedback'];

function containsDollarKey(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, nested]) => key.startsWith('$') || containsDollarKey(nested));
}

function parseMultipartJson(body) {
  const parsed = { ...body };
  for (const field of multipartJsonFields) {
    if (typeof parsed[field] !== 'string') continue;
    try {
      parsed[field] = JSON.parse(parsed[field]);
    } catch {
      return { error: `${field} must contain valid JSON` };
    }
  }
  return { body: parsed };
}

async function rejectDollarKeys(req, res, next) {
  if (containsDollarKey(req.body)) {
    await deleteUploadedFiles(req.files);
    return res.status(400).json({ error: 'Request body keys cannot start with "$"' });
  }
  return next();
}

function validate(schema, { multipartJson = false } = {}) {
  return async (req, res, next) => {
    let body = req.body || {};
    if (multipartJson) {
      const parsed = parseMultipartJson(body);
      if (parsed.error) {
        await deleteUploadedFiles(req.files);
        return res.status(400).json({ error: parsed.error });
      }
      body = parsed.body;
    }

    if (containsDollarKey(body)) {
      await deleteUploadedFiles(req.files);
      return res.status(400).json({ error: 'Request body keys cannot start with "$"' });
    }

    const result = schema.safeParse(body);
    if (!result.success) {
      await deleteUploadedFiles(req.files);
      const messages = result.error.issues.map((issue) => {
        const field = issue.path.length ? issue.path.join('.') : 'body';
        return `${field}: ${issue.message}`;
      });
      return res.status(400).json({ error: messages.join('; ') });
    }

    req.body = result.data;
    return next();
  };
}

module.exports = { rejectDollarKeys, schemas, validate };