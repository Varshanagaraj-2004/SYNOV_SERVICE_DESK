const ExcelJS = require('exceljs');
const Ticket = require('../models/Ticket');

const BRAND_PURPLE = 'FF7B3F9E';
const HEADER_TEXT = 'FFFFFFFF';
const BAND_FILL = 'FFF5F6FA';
const BORDER_COLOR = 'FFE5E7EB';

const STATUS_COLORS = {
  'New': 'FF0EA5E9',
  'Un-Assigned': 'FF64748B',
  'Assigned': 'FF2563EB',
  'Closed': 'FF16A34A',
  'Cancelled': 'FF9CA3AF',
  'Re-Assigned': 'FF7C3AED',
};
const PRIORITY_COLORS = {
  Critical: 'FFDC2626',
  High: 'FFEA580C',
  Medium: 'FFD97706',
  Low: 'FF6B7280',
};

const thinBorder = { style: 'thin', color: { argb: BORDER_COLOR } };
const allBorders = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
const MAX_REPORT_ROWS = 5000;

function parseUtcDate(value, endOfDay = false) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

async function getTopCompanies(req, res) {
  const month = Number(req.query.month || new Date().getMonth() + 1);
  const year = Number(req.query.year || new Date().getFullYear());

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'month must be an integer between 1 and 12' });
  }

  if (!Number.isInteger(year) || year < 2000) {
    return res.status(400).json({ error: 'year must be a valid 4-digit integer' });
  }

  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);

  const topCompanies = await Ticket.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: '$companyInfo.companyId',
        ticketCount: { $sum: 1 },
      },
    },
    {
      $sort: { ticketCount: -1, _id: 1 },
    },
    {
      $limit: 5,
    },
    {
      $lookup: {
        from: 'companies',
        localField: '_id',
        foreignField: '_id',
        as: 'companyDetails',
      },
    },
    {
      $project: {
        _id: 0,
        companyId: '$_id',
        companyName: {
          $ifNull: [
            { $arrayElemAt: ['$companyDetails.companyName', 0] },
            'Unknown Company',
          ],
        },
        ticketCount: 1,
      },
    },
  ]);

  res.json(topCompanies);
}

async function exportTicketsReport(req, res) {
  const { startDate, endDate, technician } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }
  const start = parseUtcDate(startDate);
  const end = parseUtcDate(endDate, true);
  if (!start || !end) {
    return res.status(400).json({ error: 'startDate and endDate must be valid dates in YYYY-MM-DD format' });
  }
  if (start > end) {
    return res.status(400).json({ error: 'startDate must be on or before endDate' });
  }

  const filter = { createdAt: { $gte: start, $lte: end } };
  if (technician) filter['assignment.assignedTo'] = technician;

  const matchedTickets = await Ticket.find(filter).sort({ createdAt: -1 }).limit(MAX_REPORT_ROWS + 1).lean();
  const capped = matchedTickets.length > MAX_REPORT_ROWS;
  const tickets = matchedTickets.slice(0, MAX_REPORT_ROWS);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Synov Service Desk';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Tickets', { views: [{ state: 'frozen', ySplit: 3 }] });

  const columns = [
    { header: 'Ticket #', key: 'ticketNumber', width: 12 },
    { header: 'Company', key: 'company', width: 24 },
    { header: 'Issue', key: 'issue', width: 40 },
    { header: 'Priority', key: 'priority', width: 12 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Reopened', key: 'reopened', width: 14 },
    { header: 'Assigned Technician', key: 'technician', width: 20 },
    { header: 'Support Type', key: 'supportType', width: 14 },
    { header: 'Raised On', key: 'raisedOn', width: 18 },
    { header: 'Closed On', key: 'closedOn', width: 18 },
    { header: 'Resolution Time (hrs)', key: 'resolutionHours', width: 20 },
    { header: 'Resolution Remarks', key: 'remarks', width: 40 },
    { header: 'Feedback Rating', key: 'rating', width: 16 },
  ];
  sheet.columns = columns;

  sheet.mergeCells(1, 1, 1, columns.length);
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'Synov Service Desk — Ticket Report';
  titleCell.font = { bold: true, size: 16, color: { argb: BRAND_PURPLE } };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.getRow(1).height = 28;

  sheet.mergeCells(2, 1, 2, columns.length);
  const subtitleCell = sheet.getCell('A2');
  subtitleCell.value = `${startDate} to ${endDate}${technician ? `  •  Technician: ${technician}` : ''}  •  Generated ${new Date().toLocaleString()}`;
  subtitleCell.font = { italic: true, size: 10, color: { argb: 'FF64748B' } };

  sheet.getRow(3).values = columns.map((c) => c.header);
  columns.forEach((c, i) => { sheet.getColumn(i + 1).width = c.width; });
  const headerRow = sheet.getRow(3);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PURPLE } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = allBorders;
  });
  headerRow.height = 20;
  sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: columns.length } };
  const statusColIndex = columns.findIndex((c) => c.key === 'status') + 1;
  const priorityColIndex = columns.findIndex((c) => c.key === 'priority') + 1;

  tickets.forEach((t, index) => {
    const raisedOn = t.ticketInfo?.callLoggedDate;
    const closedOn = t.resolvedAt;
    const resolutionHours = closedOn && t.createdAt
      ? Number((Math.max(0, new Date(closedOn) - new Date(t.createdAt)) / (1000 * 60 * 60)).toFixed(1))
      : '';
    const row = sheet.addRow({
      ticketNumber: t.ticketNumber || t._id.toString(),
      company: t.companyInfo?.companyName || '',
      issue: t.ticketInfo?.issueReported || '',
      priority: t.ticketInfo?.priority || '',
      status: t.ticketInfo?.status || '',
      reopened: t.reopenCount > 0 ? `Yes (${t.reopenCount})` : 'No',
      technician: t.assignment?.assignedTo || 'Unassigned',
      supportType: t.ticketInfo?.supportType || '',
      raisedOn: raisedOn ? new Date(raisedOn).toLocaleString() : '',
      closedOn: closedOn ? new Date(closedOn).toLocaleString() : '',
      resolutionHours,
      remarks: t.assignment?.actionTaken || '',
      rating: t.feedback?.rating || '',
    });
    row.eachCell((cell) => { cell.border = allBorders; cell.alignment = { vertical: 'middle', wrapText: true }; });
    if (index % 2 === 1) {
      row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND_FILL } }; });
    }
    const statusColor = STATUS_COLORS[t.ticketInfo?.status];
    if (statusColor) {
      row.getCell(statusColIndex).font = { bold: true, color: { argb: statusColor } };
    }
    const priorityColor = PRIORITY_COLORS[t.ticketInfo?.priority];
    if (priorityColor) {
      row.getCell(priorityColIndex).font = { bold: true, color: { argb: priorityColor } };
    }
  });

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.mergeCells('A1:B1');
  const summaryTitle = summarySheet.getCell('A1');
  summaryTitle.value = 'Report Summary';
  summaryTitle.font = { bold: true, size: 16, color: { argb: BRAND_PURPLE } };
  summarySheet.getRow(1).height = 26;

  summarySheet.getColumn(1).width = 30;
  summarySheet.getColumn(2).width = 20;
  summarySheet.getRow(2).values = ['Metric', 'Value'];
  summarySheet.getRow(2).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PURPLE } };
    cell.border = allBorders;
  });

  const statusCounts = {};
  const priorityCounts = {};
  const technicianCounts = {};
  let totalResolutionHours = 0;
  let resolvedCount = 0;

  tickets.forEach((t) => {
    const status = t.ticketInfo?.status || 'Unknown';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    const priority = t.ticketInfo?.priority || 'Unknown';
    priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
    const tech = t.assignment?.assignedTo || 'Unassigned';
    technicianCounts[tech] = (technicianCounts[tech] || 0) + 1;
    if (t.resolvedAt && t.createdAt) {
      totalResolutionHours += Math.max(0, new Date(t.resolvedAt) - new Date(t.createdAt)) / (1000 * 60 * 60);
      resolvedCount += 1;
    }
  });

  const addSummaryRow = (metric, value, bold = false) => {
    const row = summarySheet.addRow([metric, value]);
    row.eachCell((cell) => { cell.border = allBorders; });
    if (bold) row.eachCell((cell) => { cell.font = { bold: true }; });
  };

  addSummaryRow('Date Range', `${startDate} to ${endDate}`);
  if (technician) addSummaryRow('Technician Filter', technician);
  addSummaryRow('Total Tickets', tickets.length, true);
  if (capped) addSummaryRow('Warning', `Results capped at ${MAX_REPORT_ROWS} rows; narrow the date range to see all matches.`);
  addSummaryRow('', '');
  addSummaryRow('By Status', '', true);
  Object.entries(statusCounts).forEach(([k, v]) => addSummaryRow(k, v));
  addSummaryRow('', '');
  addSummaryRow('By Priority', '', true);
  Object.entries(priorityCounts).forEach(([k, v]) => addSummaryRow(k, v));
  addSummaryRow('', '');
  if (!technician) {
    addSummaryRow('By Technician', '', true);
    Object.entries(technicianCounts).forEach(([k, v]) => addSummaryRow(k, v));
    addSummaryRow('', '');
  }
  addSummaryRow('Avg Resolution Time (hrs)', resolvedCount ? Number((totalResolutionHours / resolvedCount).toFixed(1)) : 'N/A', true);

  const analyticsSheet = workbook.addWorksheet('Analytics');
  analyticsSheet.columns = [
    { width: 32 },
    { width: 24 },
    { width: 24 },
  ];
  analyticsSheet.mergeCells('A1:C1');
  const analyticsTitle = analyticsSheet.getCell('A1');
  analyticsTitle.value = 'Ticket Analytics';
  analyticsTitle.font = { bold: true, size: 16, color: { argb: BRAND_PURPLE } };
  analyticsSheet.getRow(1).height = 26;
  analyticsSheet.mergeCells('A2:C2');
  const analyticsSubtitle = analyticsSheet.getCell('A2');
  analyticsSubtitle.value = `${startDate} to ${endDate}${technician ? `  •  Technician: ${technician}` : ''}`;
  analyticsSubtitle.font = { italic: true, size: 10, color: { argb: 'FF64748B' } };

  let analyticsRowNumber = 4;
  const addAnalyticsSection = (title, headers, rows) => {
    analyticsSheet.mergeCells(analyticsRowNumber, 1, analyticsRowNumber, headers.length);
    const sectionTitle = analyticsSheet.getCell(analyticsRowNumber, 1);
    sectionTitle.value = title;
    sectionTitle.font = { bold: true, color: { argb: HEADER_TEXT } };
    sectionTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PURPLE } };
    analyticsRowNumber += 1;

    const headerRow = analyticsSheet.getRow(analyticsRowNumber);
    headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = header;
      cell.font = { bold: true, color: { argb: HEADER_TEXT } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PURPLE } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = allBorders;
    });
    analyticsRowNumber += 1;

    rows.forEach((values, index) => {
      const row = analyticsSheet.getRow(analyticsRowNumber);
      values.forEach((value, columnIndex) => { row.getCell(columnIndex + 1).value = value; });
      row.eachCell((cell) => { cell.border = allBorders; });
      if (index % 2 === 1) {
        row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND_FILL } }; });
      }
      analyticsRowNumber += 1;
    });
    analyticsRowNumber += 1;
  };

  const analyticsStatuses = [...new Set([...Object.keys(STATUS_COLORS), ...Object.keys(statusCounts)])];
  addAnalyticsSection('Ticket Count by Status', ['Status', 'Ticket Count'], analyticsStatuses.map((status) => [
    status,
    statusCounts[status] || 0,
  ]));

  const resolutionByPriority = new Map();
  tickets.forEach((ticket) => {
    if (ticket.ticketInfo?.status !== 'Closed' || !ticket.createdAt || !ticket.resolvedAt) return;
    const createdAt = new Date(ticket.createdAt).getTime();
    const resolvedAt = new Date(ticket.resolvedAt).getTime();
    if (!Number.isFinite(createdAt) || !Number.isFinite(resolvedAt) || resolvedAt < createdAt) return;

    const priority = ticket.ticketInfo?.priority || 'Unknown';
    const stats = resolutionByPriority.get(priority) || { totalHours: 0, count: 0 };
    stats.totalHours += (resolvedAt - createdAt) / (1000 * 60 * 60);
    stats.count += 1;
    resolutionByPriority.set(priority, stats);
  });
  const analyticsPriorities = [...new Set([...Object.keys(PRIORITY_COLORS), ...resolutionByPriority.keys()])];
  addAnalyticsSection(
    'Avg Resolution Time by Priority (hrs)',
    ['Priority', 'Closed Tickets', 'Average Hours'],
    analyticsPriorities.map((priority) => {
      const stats = resolutionByPriority.get(priority);
      return [priority, stats?.count || 0, stats ? Number((stats.totalHours / stats.count).toFixed(1)) : 'N/A'];
    }),
  );

  const technicianAnalytics = new Map();
  tickets.forEach((ticket) => {
    const name = ticket.assignment?.assignedTo?.trim();
    if (!name || name === 'Unassigned') return;
    const stats = technicianAnalytics.get(name) || { resolved: 0, csatTotal: 0, csatCount: 0 };
    if (ticket.ticketInfo?.status === 'Closed') stats.resolved += 1;
    const rating = ticket.feedback?.rating;
    if (Number.isFinite(rating)) {
      stats.csatTotal += rating;
      stats.csatCount += 1;
    }
    technicianAnalytics.set(name, stats);
  });
  const technicianRows = [...technicianAnalytics.entries()]
    .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
    .map(([name, stats]) => [
      name,
      stats.resolved,
      stats.csatCount ? Number((stats.csatTotal / stats.csatCount).toFixed(1)) : 'N/A',
    ]);
  addAnalyticsSection(
    'Tickets Resolved and Average CSAT by Technician',
    ['Technician', 'Tickets Resolved', 'Average CSAT'],
    technicianRows.length ? technicianRows : [['No technician data', 0, 'N/A']],
  );

  const safeTechnician = technician ? String(technician).replace(/[^A-Za-z0-9_-]/g, '') : '';
  const filename = `tickets-report_${startDate}_to_${endDate}${safeTechnician ? `_${safeTechnician}` : ''}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { exportTicketsReport, getTopCompanies };
