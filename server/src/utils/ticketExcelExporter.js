const ExcelJS = require('exceljs');

function toText(value, fallback = 'N/A') {
  if (value === null || value === undefined || value === '') return fallback;
  if (Array.isArray(value)) return value.filter(Boolean).join(', ') || fallback;
  if (typeof value === 'object') {
    if (value.companyName) return value.companyName;
    if (value.name && value.email) return `${value.name} (${value.email})`;
    if (value.name) return value.name;
    if (value.email) return value.email;
    return JSON.stringify(value);
  }
  return String(value);
}

function formatDateTime(value) {
  if (!value) return 'N/A';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function formatShortDate(value) {
  if (!value) return 'N/A';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatTimeOnly(value) {
  if (!value) return 'N/A';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function styleCell(cell, overrides = {}) {
  Object.assign(cell, {
    alignment: { vertical: 'top', wrapText: true, ...overrides.alignment },
    font: { color: { argb: 'FF1F2937' }, ...overrides.font },
    fill: overrides.fill || undefined,
    border: overrides.border || {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    },
    numFmt: overrides.numFmt || undefined,
  });
}

function applySectionHeader(sheet, rowNumber, label) {
  const cell = sheet.getCell(rowNumber, 1);
  cell.value = label;
  cell.font = { bold: true, size: 10, color: { argb: 'FF1F4E79' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEAF2F8' },
  };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFB7C9D7' } },
    left: { style: 'thin', color: { argb: 'FFB7C9D7' } },
    bottom: { style: 'thin', color: { argb: 'FFB7C9D7' } },
    right: { style: 'thin', color: { argb: 'FFB7C9D7' } },
  };
  sheet.mergeCells(rowNumber, 1, rowNumber, 4);
  cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
}

function flattenTicket(ticket) {
  return {
    ticketId: ticket.ticketId || ticket.ticketNumber || ticket._id || 'N/A',
    subject: ticket.subject || ticket.ticketInfo?.issueReported || ticket.description || 'N/A',
    status: ticket.status || ticket.ticketInfo?.status || 'N/A',
    priority: ticket.priority || ticket.ticketInfo?.priority || 'N/A',
    category: ticket.category || ticket.ticketInfo?.callType || ticket.ticketInfo?.supportType || 'N/A',
    requestor: ticket.requester?.name || ticket.userInfo?.userName || 'N/A',
    requesterEmail: ticket.requester?.email || ticket.userInfo?.userEmail || 'N/A',
    company: ticket.company?.companyName || ticket.companyInfo?.companyName || 'N/A',
    department: ticket.companyInfo?.department || ticket.company?.department || 'N/A',
    assignedTo: ticket.assignedAgent?.name || ticket.assignment?.assignedTo || 'Unassigned',
    createdOn: formatDateTime(ticket.createdAt || ticket.ticketInfo?.callLoggedDate),
    lastUpdated: formatDateTime(ticket.updatedAt || ticket.updatedAt),
    channel: ticket.source || 'Portal',
    supportType: ticket.ticketInfo?.supportType || ticket.ticketInfo?.callType || 'N/A',
    location: ticket.userInfo?.userAddress || ticket.companyInfo?.address || ticket.companyInfo?.location || 'N/A',
    issueDescription: ticket.description || ticket.ticketInfo?.issueDescription || ticket.ticketInfo?.issueReported || 'N/A',
    callType: ticket.ticketInfo?.callType || 'N/A',
    loggedDate: formatShortDate(ticket.ticketInfo?.callLoggedDate || ticket.createdAt),
    loggedTime: formatTimeOnly(ticket.ticketInfo?.callLoggedDate || ticket.createdAt),
    slaDueAt: ticket.slaDueAt ? formatDateTime(ticket.slaDueAt) : 'N/A',
    dueDate: ticket.slaDueAt ? formatDateTime(ticket.slaDueAt) : 'N/A',
  };
}

function getClientMessages(ticket) {
  const history = Array.isArray(ticket.commentHistory) ? ticket.commentHistory : [];
  const directMessages = Array.isArray(ticket.messages) ? ticket.messages : [];

  const collected = [...history, ...directMessages]
    .filter((entry) => {
      const meta = entry?.author || entry?.sender || {};
      const isClient = entry?.isClient || entry?.isCustomer || entry?.senderRole === 'client' || meta.role === 'client';
      return isClient || /client|customer/i.test(String(entry?.author?.name || entry?.senderName || ''));
    })
    .map((entry) => ({
      timestamp: entry?.createdAt || entry?.timestamp || entry?.sentAt,
      author: entry?.author?.name || entry?.senderName || entry?.sender || 'Customer',
      message: entry?.message || entry?.text || entry?.content || '',
    }))
    .filter((entry) => entry.message);

  return collected;
}

function generateTicketExcel(ticket = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Synov Service Desk';
  workbook.created = new Date();
  workbook.modified = new Date();

  const exportSheet = workbook.addWorksheet('Ticket Export');
  exportSheet.sheetView = { showGridLines: false };
  exportSheet.columns = [
    { width: 23 },
    { width: 29 },
    { width: 24 },
    { width: 43 },
  ];

  const titleText = 'SERVICE TICKET';
  const titleCell = exportSheet.getCell('A1');
  titleCell.value = titleText;
  titleCell.font = { bold: true, size: 22, color: { argb: 'FF1F4E79' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  exportSheet.mergeCells('A1:D1');

  const exportDate = formatDateTime(new Date());
  const metaRow = exportSheet.getCell('A2');
  metaRow.value = `Ticket #${toText(ticket.ticketId || ticket.ticketNumber || ticket._id, 'N/A')}  |  Exported: ${exportDate}`;
  metaRow.font = { bold: true, size: 10, color: { argb: 'FF374151' } };
  metaRow.alignment = { horizontal: 'center', vertical: 'middle' };
  exportSheet.mergeCells('A2:D2');

  const statusValue = toText(ticket.status || ticket.ticketInfo?.status, 'N/A');
  const priorityValue = toText(ticket.priority || ticket.ticketInfo?.priority, 'N/A');
  const categoryValue = toText(ticket.category || ticket.ticketInfo?.supportType || ticket.ticketInfo?.callType, 'N/A');
  const slaValue = toText(ticket.slaDueAt ? formatDateTime(ticket.slaDueAt) : ticket.dueDate || ticket.ticketInfo?.dueDate, 'N/A');

  const statusCell = exportSheet.getCell('A4');
  statusCell.value = `STATUS\n${statusValue}`;
  statusCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  statusCell.font = { bold: true, size: 10, color: { argb: 'FF1F2937' } };
  statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF4F9' } };
  statusCell.border = { top: { style: 'thin', color: { argb: 'FFB7C9D7' } }, left: { style: 'thin', color: { argb: 'FFB7C9D7' } }, bottom: { style: 'thin', color: { argb: 'FFB7C9D7' } }, right: { style: 'thin', color: { argb: 'FFB7C9D7' } } };

  const priorityCell = exportSheet.getCell('B4');
  priorityCell.value = `PRIORITY\n${priorityValue}`;
  priorityCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  priorityCell.font = { bold: true, size: 10, color: { argb: 'FF1F2937' } };
  priorityCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF4F9' } };
  priorityCell.border = statusCell.border;

  const categoryCell = exportSheet.getCell('C4');
  categoryCell.value = `CATEGORY\n${categoryValue}`;
  categoryCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  categoryCell.font = { bold: true, size: 10, color: { argb: 'FF1F2937' } };
  categoryCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF4F9' } };
  categoryCell.border = statusCell.border;

  const slaCell = exportSheet.getCell('D4');
  slaCell.value = `SLA / DUE DATE\n${slaValue}`;
  slaCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  slaCell.font = { bold: true, size: 10, color: { argb: 'FF1F2937' } };
  slaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF4F9' } };
  slaCell.border = statusCell.border;

  exportSheet.getRow(4).height = 42;

  let currentRow = 6;
  applySectionHeader(exportSheet, currentRow, 'TICKET SUMMARY');
  currentRow += 1;

  const summaryRows = [
    ['Subject / Issue Reported', ticket.subject || ticket.ticketInfo?.issueReported || ticket.description || 'N/A'],
    ['Requester', `${ticket.requester?.name || ticket.userInfo?.userName || 'N/A'}${ticket.requester?.email || ticket.userInfo?.userEmail ? ` (${ticket.requester?.email || ticket.userInfo?.userEmail})` : ''}`],
    ['Customer / Company + Department', `${ticket.company?.companyName || ticket.companyInfo?.companyName || 'N/A'}${ticket.companyInfo?.department ? ` / ${ticket.companyInfo.department}` : ''}`],
    ['Assigned To', ticket.assignedAgent?.name || ticket.assignment?.assignedTo || 'Unassigned'],
    ['Created On', formatDateTime(ticket.createdAt || ticket.ticketInfo?.callLoggedDate)],
    ['Last Updated', formatDateTime(ticket.updatedAt)],
    ['Channel / Support Type', ticket.source || ticket.ticketInfo?.supportType || ticket.ticketInfo?.callType || 'Portal'],
    ['Location / Address', ticket.userInfo?.userAddress || ticket.companyInfo?.address || ticket.companyInfo?.location || 'N/A'],
  ];

  summaryRows.forEach(([label, value]) => {
    const labelCell = exportSheet.getCell(currentRow, 1);
    labelCell.value = label;
    labelCell.font = { bold: true, size: 10, color: { argb: 'FF6B7280' } };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F6F9' } };
    labelCell.alignment = { vertical: 'top', wrapText: true, horizontal: 'left' };
    labelCell.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };

    const valueCell = exportSheet.getCell(currentRow, 2);
    valueCell.value = value;
    valueCell.font = { size: 10, color: { argb: 'FF1F2937' } };
    valueCell.alignment = { vertical: 'top', wrapText: true, horizontal: 'left' };
    valueCell.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
    exportSheet.mergeCells(currentRow, 2, currentRow, 4);
    currentRow += 1;
  });

  currentRow += 1;
  applySectionHeader(exportSheet, currentRow, 'ISSUE DESCRIPTION');
  currentRow += 1;
  const descriptionValue = toText(ticket.description || ticket.ticketInfo?.issueDescription || ticket.ticketInfo?.issueReported, 'N/A');
  const descriptionCell = exportSheet.getCell(currentRow, 1);
  descriptionCell.value = descriptionValue;
  descriptionCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  descriptionCell.font = { size: 10, color: { argb: 'FF1F2937' } };
  descriptionCell.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  exportSheet.mergeCells(currentRow, 1, currentRow, 4);
  exportSheet.getRow(currentRow).height = 96;
  currentRow += 1;

  applySectionHeader(exportSheet, currentRow, 'CLASSIFICATION & SLA');
  currentRow += 1;
  const classificationRows = [
    ['Category', ticket.category || ticket.ticketInfo?.supportType || ticket.ticketInfo?.callType || 'N/A'],
    ['Priority', ticket.priority || ticket.ticketInfo?.priority || 'N/A'],
    ['Call Type', ticket.ticketInfo?.callType || 'N/A'],
    ['Logged Date', formatShortDate(ticket.ticketInfo?.callLoggedDate || ticket.createdAt)],
    ['Logged Time', formatTimeOnly(ticket.ticketInfo?.callLoggedDate || ticket.createdAt)],
    ['SLA / Due Date', ticket.slaDueAt ? formatDateTime(ticket.slaDueAt) : 'N/A'],
  ];

  classificationRows.forEach(([label, value]) => {
    const labelCell = exportSheet.getCell(currentRow, 1);
    labelCell.value = label;
    labelCell.font = { bold: true, size: 10, color: { argb: 'FF6B7280' } };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F6F9' } };
    labelCell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
    labelCell.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };

    const valueCell = exportSheet.getCell(currentRow, 2);
    valueCell.value = value;
    valueCell.font = { size: 10, color: { argb: 'FF1F2937' } };
    valueCell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
    valueCell.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
    exportSheet.mergeCells(currentRow, 2, currentRow, 4);
    currentRow += 1;
  });

  const activityRows = Array.isArray(ticket.commentHistory) ? ticket.commentHistory : [];
  if (activityRows.length > 0) {
    currentRow += 1;
    applySectionHeader(exportSheet, currentRow, 'TICKET ACTIVITY');
    currentRow += 1;

    const headers = ['Date & Time', 'User / Agent', 'Activity', 'Details'];
    headers.forEach((header, index) => {
      const cell = exportSheet.getCell(currentRow, index + 1);
      cell.value = header;
      cell.font = { bold: true, size: 10, color: { argb: 'FF1F2937' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7ECF3' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
    });
    currentRow += 1;

    activityRows.forEach((entry) => {
      const cells = [
        formatDateTime(entry.createdAt || entry.timestamp || entry.time),
        entry.author?.name || entry.senderName || 'System',
        entry.activity || entry.type || 'Update',
        entry.message || entry.text || entry.details || 'No details provided',
      ];

      cells.forEach((value, index) => {
        const cell = exportSheet.getCell(currentRow, index + 1);
        cell.value = value;
        cell.font = { size: 9, color: { argb: 'FF1F2937' } };
        cell.alignment = { vertical: 'top', wrapText: true, horizontal: 'left' };
        cell.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
      });
      currentRow += 1;
    });
  }

  const customerMessages = getClientMessages(ticket);
  if (customerMessages.length > 0) {
    currentRow += 1;
    applySectionHeader(exportSheet, currentRow, 'CUSTOMER COMMUNICATION');
    currentRow += 1;

    customerMessages.forEach((entry) => {
      const tsCell = exportSheet.getCell(currentRow, 1);
      tsCell.value = formatDateTime(entry.timestamp);
      tsCell.font = { bold: true, size: 9, color: { argb: 'FF374151' } };
      tsCell.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
      const authorCell = exportSheet.getCell(currentRow, 2);
      authorCell.value = entry.author || 'Customer';
      authorCell.font = { italic: true, size: 9, color: { argb: 'FF374151' } };
      authorCell.border = tsCell.border;
      exportSheet.mergeCells(currentRow, 1, currentRow, 2);
      exportSheet.mergeCells(currentRow, 3, currentRow, 4);
      const messageCell = exportSheet.getCell(currentRow + 1, 1);
      messageCell.value = `“${entry.message}”`;
      messageCell.font = { italic: true, size: 9, color: { argb: 'FF4B5563' } };
      messageCell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
      messageCell.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
      exportSheet.mergeCells(currentRow + 1, 1, currentRow + 1, 4);
      currentRow += 2;
    });
  }

  const attachments = Array.isArray(ticket.attachments) ? ticket.attachments : [];
  if (attachments.length > 0) {
    currentRow += 1;
    applySectionHeader(exportSheet, currentRow, 'ATTACHMENTS');
    currentRow += 1;

    const attachmentHeaders = ['File Name', 'Type', 'Uploaded By'];
    attachmentHeaders.forEach((header, index) => {
      const cell = exportSheet.getCell(currentRow, index + 1);
      cell.value = header;
      cell.font = { bold: true, size: 10, color: { argb: 'FF1F2937' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7ECF3' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
    });
    currentRow += 1;

    attachments.forEach((attachment) => {
      const fileName = attachment.filename || attachment.name || 'Untitled attachment';
      const fileType = attachment.type || fileName.split('.').pop() || 'Unknown';
      const uploadedBy = attachment.uploadedBy || ticket.userInfo?.userName || 'System';
      const values = [fileName, fileType, uploadedBy];
      values.forEach((value, index) => {
        const cell = exportSheet.getCell(currentRow, index + 1);
        cell.value = value;
        cell.font = { size: 9, color: { argb: 'FF1F2937' } };
        cell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
        cell.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
      });
      currentRow += 1;
    });
  }

  const footerRow = Math.max(currentRow + 2, 40);
  const footerCell = exportSheet.getCell(footerRow, 1);
  footerCell.value = 'Generated by Synov Service Desk • This spreadsheet is a snapshot of ticket information at export time.';
  footerCell.font = { italic: true, size: 9, color: { argb: 'FF6B7280' } };
  footerCell.alignment = { horizontal: 'center', vertical: 'middle' };
  exportSheet.mergeCells(`${String.fromCharCode(65)}${footerRow}:D${footerRow}`);

  exportSheet.getRow(1).height = 30;
  exportSheet.getRow(2).height = 24;
  exportSheet.getRow(4).height = 42;

  const rawDataSheet = workbook.addWorksheet('Ticket Data');
  rawDataSheet.columns = [{ width: 30 }, { width: 100 }];
  rawDataSheet.getCell('A1').value = 'Field';
  rawDataSheet.getCell('B1').value = 'Value';
  rawDataSheet.getCell('A1').font = { bold: true, color: { argb: 'FF1F4E79' } };
  rawDataSheet.getCell('B1').font = { bold: true, color: { argb: 'FF1F4E79' } };
  rawDataSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2F8' } };
  rawDataSheet.getCell('B1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2F8' } };
  rawDataSheet.getCell('A1').border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  rawDataSheet.getCell('B1').border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };

  const flattened = flattenTicket(ticket);
  const dataEntries = Object.entries(flattened)
    .filter(([, value]) => value !== null && value !== undefined && value !== 'N/A' && value !== '');

  dataEntries.forEach(([field, value], index) => {
    const row = rawDataSheet.getRow(index + 2);
    row.getCell(1).value = field;
    row.getCell(2).value = toText(value, 'N/A');
    row.getCell(1).font = { bold: true, color: { argb: 'FF374151' } };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(1).border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
    row.getCell(2).border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  });

  return workbook;
}

module.exports = {
  generateTicketExcel,
};
