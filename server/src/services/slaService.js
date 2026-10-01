const logger = require('../utils/logger');
const cron = require('node-cron');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const { slaAlertEmail } = require('./emailService');

let isRunning = false;

async function getAssignedTechnicianEmail(ticket) {
  const assignment = ticket.assignment || {};
  const query = assignment.assignedToId
    ? { _id: assignment.assignedToId, role: { $in: ['it_staff', 'admin'] }, active: { $ne: false } }
    : assignment.assignedTo
      ? { name: assignment.assignedTo, role: { $in: ['it_staff', 'admin'] }, active: { $ne: false } }
      : null;
  if (!query) return null;
  const technician = await User.findOne(query).select('email');
  return technician?.email || null;
}

async function deliverSlaAlert(ticket, breached) {
  const sent = await slaAlertEmail({
    ticket,
    technicianEmail: await getAssignedTechnicianEmail(ticket),
    breached,
  });
  if (!sent) return false;

  if (breached) ticket.slaBreachedSent = true;
  else ticket.slaWarningSent = true;
  await ticket.save();
  return true;
}

async function runSlaAlerts(now = new Date()) {
  if (isRunning) return;
  isRunning = true;
  try {
    const warningCutoff = new Date(now.getTime() + 30 * 60 * 1000);
    const openTicketFilter = { 'ticketInfo.status': { $nin: ['Closed', 'Cancelled'] } };
    const [warningTickets, breachedTickets] = await Promise.all([
      Ticket.find({
        ...openTicketFilter,
        slaDueAt: { $gt: now, $lte: warningCutoff },
        slaWarningSent: { $ne: true },
      }),
      Ticket.find({
        ...openTicketFilter,
        slaDueAt: { $lte: now },
        slaBreachedSent: { $ne: true },
      }),
    ]);

    for (const ticket of warningTickets) {
      try {
        await deliverSlaAlert(ticket, false);
      } catch (error) {
        logger.error(`Failed to send SLA warning for ticket ${ticket._id}:`, error.stack || error);
      }
    }
    for (const ticket of breachedTickets) {
      try {
        await deliverSlaAlert(ticket, true);
      } catch (error) {
        logger.error(`Failed to send SLA breach alert for ticket ${ticket._id}:`, error.stack || error);
      }
    }
  } catch (error) {
    logger.error('SLA monitoring run failed:', error.stack || error);
  } finally {
    isRunning = false;
  }
}

function startSlaMonitoring() {
  const schedule = cron.schedule('*/10 * * * *', () => runSlaAlerts());
  schedule.start();
  return schedule;
}

module.exports = { runSlaAlerts, startSlaMonitoring };