const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { rejectDollarKeys, schemas, validate } = require('../middleware/validate');
const {
  getTickets,
  getTicketStats,
  getTicketById,
  getTicketActivity,
  exportTicketExcel,
  createTicket,
  addTicketAttachment,
  updateTicketStatus,
  reopenTicket,
  submitFeedback,
  getMessages,
  markMessagesRead,
  getRecentMessages,
  postMessage,
} = require('../controllers/ticketController');

const router = express.Router();

router.get('/', requireAuth, getTickets);
router.get('/stats', requireAuth, getTicketStats);
router.get('/messages/recent', requireAuth, getRecentMessages);
router.get('/:id/activity', requireAuth, getTicketActivity);
router.get('/:id/export', requireAuth, requireRole('admin'), exportTicketExcel);
router.get('/:id', requireAuth, getTicketById);
router.post('/', requireAuth, requireRole('client', 'admin'), upload.array('files', 5), validate(schemas.createTicket, { multipartJson: true }), createTicket);
router.post('/:id/attachments', requireAuth, upload.array('files', 5), rejectDollarKeys, addTicketAttachment);
router.patch('/:id/status', requireAuth, requireRole('admin', 'it_staff'), validate(schemas.updateTicketStatus), updateTicketStatus);
router.post('/:id/reopen', requireAuth, validate(schemas.reopenTicket), reopenTicket);
router.patch('/:id/feedback', requireAuth, requireRole('client'), validate(schemas.submitFeedback), submitFeedback);
router.get('/:id/messages', requireAuth, getMessages);
router.post('/:id/messages/read', requireAuth, markMessagesRead);
router.post('/:id/messages', requireAuth, validate(schemas.postMessage), postMessage);

module.exports = router;
