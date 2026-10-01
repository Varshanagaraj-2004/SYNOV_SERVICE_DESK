const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { exportTicketsReport, getTopCompanies } = require('../controllers/reportController');

const router = express.Router();

router.get('/tickets/export', requireAuth, requireRole('admin'), exportTicketsReport);
router.get('/top-companies', requireAuth, requireRole('admin'), getTopCompanies);

module.exports = router;
