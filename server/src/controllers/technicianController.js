const User = require('../models/User');

async function getTechnicians(req, res) {
  const assignable = req.user.role === 'admin' && req.query.assignable === 'true';
  const projection = assignable
    ? '_id name email designation role'
    : req.user.role === 'client' ? '_id name' : '_id name email designation';
  const role = assignable ? { $in: ['it_staff', 'admin'] } : 'it_staff';
  const technicians = await User.find({ role, active: { $ne: false } })
    .select(projection)
    .sort({ name: 1 });
  res.json(technicians);
}

module.exports = { getTechnicians };