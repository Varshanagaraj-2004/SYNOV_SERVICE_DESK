const ExcelJS = require('exceljs');

function formatDate(value) {
  if (!value) return 'N/A';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatHours(value) {
  if (!value || Number.isNaN(Number(value))) return '0h';
  const hours = Number(value);
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
}

function getStatus(ticket) {
  return String(ticket?.ticketInfo?.status || ticket?.status || '').trim();
}

function getResolutionMinutes(ticket) {
  if (!ticket || !ticket.resolvedAt || !ticket.createdAt) return null;
  const createdAt = ticket.createdAt instanceof Date ? ticket.createdAt : new Date(ticket.createdAt);
  const resolvedAt = ticket.resolvedAt instanceof Date ? ticket.resolvedAt : new Date(ticket.resolvedAt);
  if (Number.isNaN(createdAt.getTime()) || Number.isNaN(resolvedAt.getTime())) return null;
  return Math.max(0, (resolvedAt - createdAt) / (1000 * 60));
}

function buildSummaryStats(company, tickets = []) {
  const totalTickets = tickets.length;
  const openTickets = tickets.filter((ticket) => getStatus(ticket) !== 'Closed').length;
  const closedTickets = tickets.filter((ticket) => getStatus(ticket) === 'Closed').length;

  const closedResolutionMinutes = tickets
    .filter((ticket) => getStatus(ticket) === 'Closed')
    .map(getResolutionMinutes)
    .filter((minutes) => minutes !== null && Number.isFinite(minutes));

  const avgResolutionHours = closedResolutionMinutes.length
    ? closedResolutionMinutes.reduce((sum, minutes) => sum + minutes, 0) / closedResolutionMinutes.length / 60
    : 0;

  return {
    companyName: company?.companyName || 'Company',
    totalTickets,
    openTickets,
    closedTickets,
    avgResolutionHours,
  };
}

function applyBadgeStyle(cell, options = {}) {
  const {
    label = false,
    value = false,
    topBorder = true,
    bottomBorder = true,
    leftBorder = true,
    rightBorder = true,
  } = options;

  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF4F9' } };
  cell.border = {
    top: topBorder ? { style: 'thin', color: { argb: 'FFB7C9D7' } } : undefined,
    left: leftBorder ? { style: 'thin', color: { argb: 'FFB7C9D7' } } : undefined,
    bottom: bottomBorder ? { style: 'thin', color: { argb: 'FFB7C9D7' } } : undefined,
    right: rightBorder ? { style: 'thin', color: { argb: 'FFB7C9D7' } } : undefined,
  };

  if (label) {
    cell.font = { bold: true, size: 9, color: { argb: 'FF6B7280' } };
  }

  if (value) {
    cell.font = { bold: true, size: 16, color: { argb: 'FF1F4E79' } };
  }
}

function applySectionHeader(sheet, rowNumber, title) {
  const cell = sheet.getCell(rowNumber, 1);
  cell.value = title;
  cell.font = { bold: true, size: 10, color: { argb: 'FF1F4E79' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2F8' } };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFB7C9D7' } },
    left: { style: 'thin', color: { argb: 'FFB7C9D7' } },
    bottom: { style: 'thin', color: { argb: 'FFB7C9D7' } },
    right: { style: 'thin', color: { argb: 'FFB7C9D7' } },
  };
  cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  sheet.mergeCells(rowNumber, 1, rowNumber, 6);
}

function applyTableHeader(cell) {
  cell.font = { bold: true, size: 10, color: { argb: 'FF1F2937' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7ECF3' } };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };
}

function generateCompanyReport(company, tickets = []) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Synov Service Desk';
  workbook.created = new Date();
  workbook.modified = new Date();

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.sheetView = { showGridLines: false };
  summarySheet.columns = [
    { width: 23 },
    { width: 29 },
    { width: 24 },
    { width: 24 },
    { width: 24 },
    { width: 30 },
  ];

  const titleCell = summarySheet.getCell('A1');
  titleCell.value = 'COMPANY TICKET REPORT';
  titleCell.font = { bold: true, size: 22, color: { argb: 'FF1F4E79' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  summarySheet.mergeCells('A1:F1');

  const subtitleText = `${company?.companyName || 'Company'}  |  Exported: ${new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })}`;
  const subtitleCell = summarySheet.getCell('A2');
  subtitleCell.value = subtitleText;
  subtitleCell.font = { bold: true, size: 10, color: { argb: 'FF374151' } };
  subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  summarySheet.mergeCells('A2:F2');

  const stats = buildSummaryStats(company, tickets);
  const badgeLabels = ['TOTAL TICKETS', 'OPEN', 'CLOSED', 'AVG RESOLUTION'];
  const badgeValues = [
    String(stats.totalTickets),
    String(stats.openTickets),
    String(stats.closedTickets),
    formatHours(stats.avgResolutionHours),
  ];

  badgeLabels.forEach((label, index) => {
    const cell = summarySheet.getCell(4, index + 1);
    cell.value = label;
    applyBadgeStyle(cell, {
      label: true,
      topBorder: true,
      leftBorder: index === 0,
      rightBorder: index === badgeLabels.length - 1,
      bottomBorder: false,
    });
  });

  badgeValues.forEach((value, index) => {
    const cell = summarySheet.getCell(5, index + 1);
    cell.value = value;
    applyBadgeStyle(cell, {
      value: true,
      topBorder: false,
      leftBorder: index === 0,
      rightBorder: index === badgeValues.length - 1,
      bottomBorder: true,
    });
  });

  summarySheet.getRow(4).height = 18;
  summarySheet.getRow(5).height = 28;

  const detailSheet = workbook.addWorksheet('Ticket List');
  detailSheet.sheetView = { showGridLines: false };
  detailSheet.columns = [
    { width: 16 },
    { width: 14 },
    { width: 18 },
    { width: 14 },
    { width: 18 },
    { width: 28 },
    { width: 42 },
    { width: 22 },
    { width: 18 },
  ];

  const ticketHeaders = ['Ticket #', 'Priority', 'Status', 'Reopened', 'Source', 'Company', 'Issue Reported', 'Assigned To', 'Logged On'];
  ticketHeaders.forEach((header, index) => {
    const cell = detailSheet.getCell(1, index + 1);
    cell.value = header;
    applyTableHeader(cell);
  });
  detailSheet.getRow(1).height = 24;

  tickets.forEach((ticket, index) => {
    const rowNumber = index + 2;
    const row = detailSheet.getRow(rowNumber);
    const values = [
      ticket.ticketNumber || ticket._id || 'N/A',
      ticket.ticketInfo?.priority || 'N/A',
      ticket.ticketInfo?.status || 'N/A',
      ticket.reopenCount > 0 ? `Yes (${ticket.reopenCount})` : 'No',
      String(ticket.source || 'Portal'),
      ticket.companyInfo?.companyName || company?.companyName || 'N/A',
      ticket.ticketInfo?.issueReported || 'N/A',
      ticket.assignment?.assignedTo || 'Unassigned',
      ticket.ticketInfo?.callLoggedDate ? formatDate(ticket.ticketInfo.callLoggedDate) : 'N/A',
    ];

    values.forEach((value, colIndex) => {
      const cell = row.getCell(colIndex + 1);
      cell.value = value;
      cell.alignment = { vertical: 'top', wrapText: true, horizontal: 'left' };
      cell.font = { size: 9, color: { argb: 'FF1F2937' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
      if (rowNumber % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
    });
  });

  return workbook;
}

module.exports = {
  generateCompanyReport,
};
