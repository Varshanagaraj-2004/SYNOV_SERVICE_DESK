const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getContacts } = require('../controllers/companyContactController');

const router = express.Router();

router.get('/', requireAuth, requireRole('client', 'admin'), getContacts);

module.exports = router;