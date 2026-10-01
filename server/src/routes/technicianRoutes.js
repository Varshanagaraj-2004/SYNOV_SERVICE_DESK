const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getTechnicians } = require('../controllers/technicianController');

const router = express.Router();

router.get('/', requireAuth, requireRole('admin', 'it_staff', 'client'), getTechnicians);

module.exports = router;