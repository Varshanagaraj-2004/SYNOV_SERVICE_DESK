const logger = require('../utils/logger');
const nodemailer = require('nodemailer');

let transporterPromise = null;

if ((process.env.SMTP_HOST || '').toLowerCase().includes('imap') || Number(process.env.SMTP_PORT) === 993) {
  logger.warn('SMTP configuration appears to use IMAP settings; check SMTP_HOST and SMTP_PORT.');
}

if (process.env.EMAIL_TRANSPORT !== 'stub'
  && !(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)) {
  logger.warn('SMTP is not configured; outgoing email will use the Ethereal test transport.');
}

function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = (async () => {
      if (process.env.EMAIL_TRANSPORT === 'stub') {
        return nodemailer.createTransport({ jsonTransport: true });
      }

      if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        return nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: Number(process.env.SMTP_PORT) === 465,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
      }

      if (process.env.ETHEREAL_USER && process.env.ETHEREAL_PASS) {
        return nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: { user: process.env.ETHEREAL_USER, pass: process.env.ETHEREAL_PASS },
        });
      }

      const testAccount = await nodemailer.createTestAccount();
      logger.info('Ethereal test inbox configured');
      return nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
    })();
  }
  return transporterPromise;
}

function getRecipients(value) {
  return (value || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function getClientRecipients(ticket, requesterEmail) {
  return [...new Set([
    requesterEmail,
    ticket.userInfo?.userEmail,
    ticket.companyInfo?.contactEmail,
  ]
    .filter(Boolean)
    .map((email) => String(email).trim().toLowerCase())
    .filter(Boolean))];
}

function getFrontendUrl(req) {
  const origin = req?.get?.('origin') || req?.headers?.origin;
  if (origin) {
    try {
      const parsedOrigin = new URL(origin);
      if (parsedOrigin.protocol === 'http:' || parsedOrigin.protocol === 'https:') {
        return parsedOrigin.origin;
      }
    } catch {
      // Use the Host header or configured fallback if Origin is invalid.
    }
  }

  const host = req?.get?.('host') || req?.headers?.host;
  if (host) {
    const protocol = req.protocol === 'https' ? 'https:' : 'http:';
    try {
      return new URL(`${protocol}//${host}`).origin;
    } catch {
      // Use the configured fallback if Host is invalid.
    }
  }

  if (req) {
    throw new Error('Unable to build an email link without a valid request Origin or Host header.');
  }

  return (process.env.FRONTEND_URL || '').split(',')[0].trim().replace(/\/+$/, '');
}

function getTicketUrl(ticketId, req) {
  return `${getFrontendUrl(req)}/tickets/${ticketId}`;
}

async function sendEmail({ to, subject, text, html, quiet = false }) {
  const recipients = Array.isArray(to) ? to : [to];
  const validRecipients = recipients.filter(Boolean);
  if (!validRecipients.length) {
    if (!quiet) logger.warn(`Email skipped for "${subject}": no recipient address provided.`);
    return false;
  }

  try {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: validRecipients,
      subject,
      text,
      html,
    });
    if (!quiet) logger.info(`Email sent - "${subject}" to ${validRecipients.join(', ')}`);
    return true;
  } catch (error) {
    if (!quiet) logger.error({ err: error }, 'Email delivery failed');
    return false;
  }
}

async function slaAlertEmail({ ticket, technicianEmail, breached }) {
  const recipients = [...new Set([
    ...getRecipients(process.env.IT_TEAM_EMAIL),
    technicianEmail,
  ].filter(Boolean))];
  const ticketId = ticket.ticketNumber || ticket._id.toString();
  const alertType = breached ? 'SLA breached' : 'SLA warning';
  const detail = breached
    ? `The SLA deadline passed at ${new Date(ticket.slaDueAt).toLocaleString()}.`
    : `The SLA deadline is ${new Date(ticket.slaDueAt).toLocaleString()}.`;
  const ticketUrl = getTicketUrl(ticket._id);
  return sendEmail({
    to: recipients,
    subject: `${alertType}: Ticket #${ticketId}`,
    text: `${alertType} for Ticket #${ticketId}.\n\nIssue: ${ticket.ticketInfo.issueReported}\nCompany: ${ticket.companyInfo?.companyName || 'Unknown'}\n${detail}\n\nView ticket: ${ticketUrl}`,
    html: `<p><strong>${alertType}</strong> for Ticket #${ticketId}.</p><p><strong>Issue:</strong> ${ticket.ticketInfo.issueReported}<br><strong>Company:</strong> ${ticket.companyInfo?.companyName || 'Unknown'}<br>${detail}</p><p><a href="${ticketUrl}">View ticket</a></p>`,
  });
}

async function ticketRaisedClientEmail(ticket, requesterEmail) {
  const ticketId = ticket.ticketNumber || ticket._id.toString();
  const issue = ticket.ticketInfo.issueReported;
  const status = ticket.ticketInfo.status;
  const recipients = getClientRecipients(ticket, requesterEmail);
  if (!recipients.length) {
    logger.warn('Ticket confirmation email skipped: no recipient address provided.');
    return false;
  }
  return sendEmail({
    to: recipients,
    subject: `Ticket #${ticketId} logged successfully`,
    text: `Your support ticket #${ticketId} has been logged.\n\nIssue: ${issue}\nCurrent status: ${status}`,
    html: `<p>Your support ticket <strong>#${ticketId}</strong> has been logged.</p><p><strong>Issue:</strong> ${issue}</p><p><strong>Current status:</strong> ${status}</p>`,
  });
}

async function ticketRaisedInternalEmail(ticket) {
  const ticketId = ticket.ticketNumber || ticket._id.toString();
  const issue = ticket.ticketInfo.issueReported;
  const status = ticket.ticketInfo.status;
  const companyName = ticket.companyInfo.companyName;
  return sendEmail({
    to: getRecipients(process.env.IT_TEAM_EMAIL),
    subject: `New ticket #${ticketId} raised — ${companyName}`,
    text: `A new support ticket has been raised.\n\nTicket: #${ticketId}\nCompany: ${companyName}\nIssue: ${issue}\nCurrent status: ${status}`,
    html: `<p>A new support ticket has been raised.</p><p><strong>Ticket:</strong> #${ticketId}</p><p><strong>Company:</strong> ${companyName}</p><p><strong>Issue:</strong> ${issue}</p><p><strong>Current status:</strong> ${status}</p>`,
  });
}

async function ticketAssignedTechnicianEmail(ticket, technician, req) {
  const ticketId = ticket.ticketNumber || ticket._id.toString();
  const ticketUrl = getTicketUrl(ticket._id, req);
  return sendEmail({
    to: technician.email,
    subject: `Ticket #${ticketId} assigned to you`,
    text: `Ticket #${ticketId} has been assigned to you.\n\nIssue: ${ticket.ticketInfo.issueReported}\nCompany: ${ticket.companyInfo.companyName}\n\nView ticket: ${ticketUrl}`,
    html: `<p>Ticket <strong>#${ticketId}</strong> has been assigned to you.</p><p><strong>Issue:</strong> ${ticket.ticketInfo.issueReported}</p><p><strong>Company:</strong> ${ticket.companyInfo.companyName}</p><p><a href="${ticketUrl}">View ticket</a></p>`,
  });
}

async function ticketReopenedTechnicianEmail(ticket, technician, actorName, reason, req) {
  const ticketId = ticket.ticketNumber || ticket._id.toString();
  const ticketUrl = getTicketUrl(ticket._id, req);
  const recipients = [...new Set([
    technician?.email,
    ...getRecipients(process.env.IT_TEAM_EMAIL),
  ].filter(Boolean).map((email) => String(email).trim().toLowerCase()))];
  if (!recipients.length) {
    logger.warn('Ticket reopen email skipped: no technician or IT team recipient configured.');
    return false;
  }
  return sendEmail({
    to: recipients,
    subject: `Ticket #${ticketId} has been reopened`,
    text: `Ticket #${ticketId} has been reopened by ${actorName}.

Reason: ${reason}

View ticket: ${ticketUrl}`,
    html: `<p>Ticket <strong>#${ticketId}</strong> has been reopened by ${escapeHtml(actorName)}.</p><p><strong>Reason:</strong> ${escapeHtml(reason)}</p><p><a href="${escapeHtml(ticketUrl)}">View ticket</a></p>`,
  });
}

async function ticketClosedClientEmail(ticket, requesterEmail, req) {
  const ticketId = ticket.ticketNumber || ticket._id.toString();
  const ticketUrl = getTicketUrl(ticket._id, req);
  return sendEmail({
    to: getClientRecipients(ticket, requesterEmail),
    subject: `Ticket #${ticketId} has been closed`,
    text: `Ticket #${ticketId} has been closed. Please share your feedback: ${ticketUrl}`,
    html: `<p>Ticket <strong>#${ticketId}</strong> has been closed.</p><p><a href="${ticketUrl}">Leave feedback</a></p>`,
  });
}

async function clientUserProvisionedEmail(user, plainPassword, loginUrl, { quiet = false } = {}) {
  const loginInstructions = loginUrl ? `\n\nLog in: ${loginUrl}` : '';
  const loginLink = loginUrl
    ? `<p><a href="${escapeHtml(loginUrl)}">Log in to Synov Service Desk</a></p>`
    : '';
  return sendEmail({
    to: user.email,
    subject: 'Your Synov Service Desk login credentials',
    text: `An account has been created for you on the Synov Service Desk.\n\nLogin email: ${user.email}\nPassword: ${plainPassword}${loginInstructions}\n\nPlease log in and keep these credentials safe.`,
    html: `<p>An account has been created for you on the Synov Service Desk.</p><p><strong>Login email:</strong> ${escapeHtml(user.email)}</p><p><strong>Password:</strong> ${escapeHtml(plainPassword)}</p>${loginLink}<p>Please log in and keep these credentials safe.</p>`,
    quiet,
  });
}

async function passwordResetEmail(user, resetUrl) {
  return sendEmail({
    to: user.email,
    subject: 'Reset your Synov Service Desk password',
    text: `We received a request to reset your password. Use this link within 30 minutes:\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>We received a request to reset your password. Use this link within 30 minutes:</p><p><a href="${resetUrl}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
  });
}

module.exports = {
  ticketRaisedClientEmail,
  ticketRaisedInternalEmail,
  ticketAssignedTechnicianEmail,
  ticketReopenedTechnicianEmail,
  ticketClosedClientEmail,
  clientUserProvisionedEmail,
  passwordResetEmail,
  slaAlertEmail,
  getFrontendUrl,
};
