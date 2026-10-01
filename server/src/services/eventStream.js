const jwt = require('jsonwebtoken');
const User = require('../models/User');

const clientsByUser = new Map();

function addClient(userId, res) {
  const clients = clientsByUser.get(userId) || new Set();
  clients.add(res);
  clientsByUser.set(userId, clients);

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': keep-alive\n\n');
  }, 25_000);

  res.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
    if (clients.size === 0) clientsByUser.delete(userId);
  });
}

function publishToUsers(userIds, type, data) {
  const event = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const id of new Set(userIds.filter(Boolean).map(String))) {
    const clients = clientsByUser.get(id);
    if (!clients) continue;
    for (const res of clients) {
      if (!res.writableEnded) res.write(event);
    }
  }
}

async function handleSseConnection(req, res) {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) return res.status(401).json({ error: 'SSE token is required' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired SSE token' });
  }
  if (decoded.purpose !== 'sse' || !decoded.id) {
    return res.status(401).json({ error: 'Invalid SSE token' });
  }

  const user = await User.findById(decoded.id).select('active passwordChangedAt').lean();
  if (!user || user.active === false) return res.status(401).json({ error: 'User is unavailable' });
  if (user.passwordChangedAt) {
    const changedAtSeconds = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
    if (!Number.isFinite(decoded.iat) || decoded.iat < changedAtSeconds) {
      return res.status(401).json({ error: 'Password changed; request a new SSE token' });
    }
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write('retry: 5000\n: connected\n\n');
  addClient(String(user._id), res);
}

module.exports = { handleSseConnection, publishToUsers };