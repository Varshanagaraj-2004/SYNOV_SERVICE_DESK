const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { schemas, validate } = require('../middleware/validate');
const {
  getStaff,
  createStaff,
  updateStaff,
  deactivateStaff,
} = require('../controllers/staffController');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', getStaff);
router.post('/', validate(schemas.createStaff), createStaff);
router.patch('/:id', validate(schemas.updateStaff), updateStaff);
router.delete('/:id', deactivateStaff);

module.exports = router;