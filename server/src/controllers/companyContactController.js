const User = require('../models/User');

async function getContacts(req, res) {
  let companyId = req.user.companyId;

  if (req.user.role === 'admin') {
    if (!req.query.companyId) {
      return res.status(400).json({ error: 'companyId is required' });
    }
    companyId = req.query.companyId;
  }

  const users = await User.find({ role: 'client', companyId, active: { $ne: false } })
    .select('-passwordHash')
    .sort({ createdAt: -1 })
    .lean();

  res.json(users);
}

module.exports = { getContacts };