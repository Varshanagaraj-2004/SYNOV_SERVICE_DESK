const express = require('express');
const { ipKeyGenerator, rateLimit } = require('express-rate-limit');
const { login, changePassword, forgotPassword, resetPassword, createSseToken } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { schemas, validate } = require('../middleware/validate');

const router = express.Router();

const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 10,
	keyGenerator: (req) => {
		const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
		return `${ipKeyGenerator(req.ip)}:${email}`;
	},
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: 'Too many login attempts. Try again later.' },
});

const passwordResetLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 5,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: 'Too many password reset attempts. Try again later.' },
});

router.post('/login', loginLimiter, validate(schemas.login), login);
router.post('/forgot-password', passwordResetLimiter, validate(schemas.forgotPassword), forgotPassword);
router.post('/reset-password', passwordResetLimiter, validate(schemas.resetPassword), resetPassword);
router.post('/sse-token', requireAuth, createSseToken);
router.patch('/change-password', requireAuth, validate(schemas.changePassword), changePassword);

module.exports = router;
