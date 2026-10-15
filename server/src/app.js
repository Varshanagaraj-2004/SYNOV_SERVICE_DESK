require('dotenv').config();
require('./utils/checkSecrets')(process.env.JWT_SECRET);

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const mongoose = require('mongoose');
const { rateLimit } = require('express-rate-limit');
const authRoutes = require('./routes/authRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const companyRoutes = require('./routes/companyRoutes');
const assetRoutes = require('./routes/assetRoutes');
const technicianRoutes = require('./routes/technicianRoutes');
const companyContactRoutes = require('./routes/companyContactRoutes');
const userRoutes = require('./routes/userRoutes');
const reportRoutes = require('./routes/reportRoutes');
const staffRoutes = require('./routes/staffRoutes');
const crmRoutes = require('./routes/crmRoutes');
const { rejectDollarKeys } = require('./middleware/validate');
const { handleSseConnection } = require('./services/eventStream');
const logger = require('./utils/logger');
const pinoHttp = require('pino-http');

const app = express();
const allowedOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
	.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean);

app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(pinoHttp({
	logger: logger.pino,
	serializers: {
		req(req) {
			return { method: req.method, path: new URL(req.url, 'http://localhost').pathname };
		},
		res(res) {
			return { statusCode: res.statusCode };
		},
	},
	customSuccessObject(req, res, loggable) {
		return { ...loggable, userId: req.user?.id || null };
	},
	customErrorObject(req, res, error, loggable) {
		return { ...loggable, userId: req.user?.id || null };
	},
}));
app.use(express.json({ limit: '100kb' }));
app.use(rejectDollarKeys);
app.use('/api', rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 300,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: 'Too many requests. Try again later.' },
}));
app.get('/api/events', handleSseConnection);
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/technicians', technicianRoutes);
app.use('/api/company-contacts', companyContactRoutes);
app.use('/api/users', userRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/crm', crmRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

function errorHandler(error, req, res, next) {
	if (res.headersSent) return next(error);

	if (error.code === 'LIMIT_FILE_SIZE') {
		return res.status(400).json({ error: 'Uploaded files must be 10 MB or smaller' });
	}
	if (error.code === 'LIMIT_FILE_TYPE') {
		return res.status(400).json({ error: error.message });
	}
	if (error instanceof multer.MulterError) {
		return res.status(400).json({ error: error.message });
	}
	if (error instanceof mongoose.Error.ValidationError) {
		const messages = Object.values(error.errors).map((fieldError) => `${fieldError.path}: ${fieldError.message}`);
		return res.status(400).json({ error: messages.join('; ') });
	}
	if (error instanceof mongoose.Error.CastError || error.name === 'CastError' || error.kind === 'ObjectId') {
		return res.status(400).json({ error: `Invalid ${error.path || 'value'}` });
	}
	if (error.code === 11000) {
		return res.status(409).json({ error: 'A record with this value already exists' });
	}

	logger.error({ err: error }, 'Unhandled server error');
	return res.status(500).json({ error: 'Internal server error' });
}

app.use(errorHandler);

module.exports = app;