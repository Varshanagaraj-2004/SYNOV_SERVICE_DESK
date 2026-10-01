const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const user = await User.findById(decoded.id).select('role companyId name passwordChangedAt active isCompanyAdmin').lean();
    if (!user || user.active === false) return res.status(401).json({ error: 'User no longer exists or is inactive' });
    if (user.passwordChangedAt) {
      const changedAtSeconds = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
      if (!Number.isFinite(decoded.iat) || decoded.iat < changedAtSeconds) {
        return res.status(401).json({ error: 'Password changed; please sign in again' });
      }
    }

    req.user = {
      id: String(user._id),
      role: user.role,
      isCompanyAdmin: user.isCompanyAdmin === true,
      companyId: user.companyId || null,
      name: user.name,
    };
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
