const Counter = require('../models/Counter');
const Ticket = require('../models/Ticket');

async function getNextTicketNumber() {
  const counter = await Counter.findOneAndUpdate(
    { _id: 'ticket' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return `SY${String(counter.seq).padStart(4, '0')}`;
}

async function createTicketWithRetry(ticketData) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const ticketNumber = await getNextTicketNumber();
      return await Ticket.create({ ...ticketData, ticketNumber });
    } catch (error) {
      if (error.code !== 11000 || attempt === 1) throw error;
    }
  }
}

module.exports = { getNextTicketNumber, createTicketWithRetry };