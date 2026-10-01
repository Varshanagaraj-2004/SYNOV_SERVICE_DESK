const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  getCompanies,
  getCompanyById,
  getCompanyTickets,
  exportCompanyTickets,
} = require('../controllers/companyController');

const router = express.Router();

router.get('/', requireAuth, getCompanies);
router.get('/:companyId/tickets/export', requireAuth, requireRole('admin', 'it_staff'), exportCompanyTickets);
router.get('/:companyId/tickets', requireAuth, requireRole('admin', 'it_staff'), getCompanyTickets);
router.get('/:id', requireAuth, getCompanyById);

module.exports = router;