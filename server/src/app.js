require('dotenv').config();
require('./utils/checkSecrets')(process.env.JWT_SECRET);

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
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
app.set('trust proxy', 1);
const extraAllowedOrigins = new Set((process.env.CORS_ORIGINS || '')
	.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean)
	.map((origin) => {
		try {
			return new URL(origin).origin;
		} catch {
			return '';
		}
	})
	.filter(Boolean));

function isLocalNetworkOrigin(origin) {
	if (!origin) return false;

	try {
		const url = new URL(origin);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

		const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
		if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
			return true;
		}

		if (net.isIP(hostname) === 4) {
			const [first, second] = hostname.split('.').map(Number);
			return first === 10
				|| first === 127
				|| (first === 169 && second === 254)
				|| (first === 172 && second >= 16 && second <= 31)
				|| (first === 192 && second === 168);
		}

		if (net.isIP(hostname) === 6) {
			return hostname === '::1'
				|| /^f[cd]/i.test(hostname)
				|| /^fe[89ab]/i.test(hostname);
		}
	} catch {
		return false;
	}

	return false;
}

app.use(helmet());
app.use((req, res, next) => {
	const origin = req.get('origin');
	if (!origin) return next();

	let normalizedOrigin;
	try {
		normalizedOrigin = new URL(origin).origin;
	} catch {
		return next();
	}

	const allowed = isLocalNetworkOrigin(normalizedOrigin) || extraAllowedOrigins.has(normalizedOrigin);
	return cors({ origin: allowed ? normalizedOrigin : false })(req, res, next);
});
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

app.use('/api', (req, res) => res.status(404).json({ error: 'Route not found' }));

const clientDistPath = path.resolve(__dirname, '../../client/dist');
const clientIndexPath = path.join(clientDistPath, 'index.html');
if (fs.existsSync(clientIndexPath)) {
	app.use(express.static(clientDistPath));
	app.get(/^\/(?!api(?:\/|$)).*/, (req, res, next) => {
		if (!req.accepts('html')) return next();
		return res.sendFile(clientIndexPath, (error) => {
			if (error) next(error);
		});
	});
}

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