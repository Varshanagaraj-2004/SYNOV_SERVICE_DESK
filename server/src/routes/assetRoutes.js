const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { schemas, validate } = require('../middleware/validate');
const { getAssets, getAssetById, createAsset, updateAsset, deleteAsset } = require('../controllers/assetController');

const router = express.Router();

function restrictStaffAssetUpdates(req, res, next) {
	if (req.user.role !== 'it_staff') return next();
	const allowedFields = new Set(['status', 'location', 'assignedTo']);
	if (Object.keys(req.body || {}).some((field) => !allowedFields.has(field))) {
		return res.status(403).json({ error: 'IT staff may only update status, location, and assignee' });
	}
	return next();
}

router.get('/', requireAuth, getAssets);
router.post('/', requireAuth, requireRole('admin'), validate(schemas.createAsset), createAsset);
router.patch('/:id', requireAuth, requireRole('admin', 'it_staff'), restrictStaffAssetUpdates, validate(schemas.updateAsset), updateAsset);
router.delete('/:id', requireAuth, requireRole('admin'), deleteAsset);
router.get('/:id', requireAuth, getAssetById);

module.exports = router;