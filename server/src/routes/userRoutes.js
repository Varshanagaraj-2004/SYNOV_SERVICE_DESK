const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { createClientUser, updateClientUser, deleteClientUser, verifyClientUser } = require('../controllers/userController');
const { schemas, validate } = require('../middleware/validate');

const router = express.Router();

router.post('/', requireAuth, requireRole('admin', 'client'), validate(schemas.createClientUser), createClientUser);
router.patch('/:id/verify', requireAuth, requireRole('admin'), verifyClientUser);
router.patch('/:id', requireAuth, requireRole('admin', 'client'), validate(schemas.updateClientUser), updateClientUser);
router.delete('/:id', requireAuth, requireRole('admin', 'client'), deleteClientUser);

module.exports = router;
