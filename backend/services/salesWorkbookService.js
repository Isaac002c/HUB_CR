const ExcelJS = require('exceljs');
const {
  FIXED_COMMISSION_PERCENTAGE,
  FIXED_COMMISSION_THRESHOLD,
  SUPERVISOR_PERSONAL_PERCENTAGE,
} = require('../config/commissionPolicy');

const COLORS = {
  wine: '751518',
  wineLight: 'A83F6B',
  wineBorder: '7F294D',
  white: 'FFFFFF',
  text: '1E293B',
  muted: '64748B',
  border: 'CBD5E1',
  soft: 'F8FAFC',
  green: '38E61D',
  greenText: '063B13',
  yellow: 'FFF200',
  yellowText: '3F3A00',
  red: 'EF1717',
};

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const PAYMENT_LABELS = {
  a_vista: 'À vista', pix: 'PIX', cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito', boleto: 'Boleto', dinheiro: 'Dinheiro',
  transferencia: 'Transferência', outro: 'Outro',
};

const CLOSING_LABELS = { presencial: 'Presencial', remoto: 'Remoto', outro: 'Outro' };

const GENERAL_COLUMNS = [
  ['Data', 13], ['Cliente', 30], ['Serviço', 23], ['Valor pago', 17],
  ['Parcela', 12], ['Percentual', 14], ['Comissão', 17],
  ['Forma de pagamento', 23], ['Forma de fechamento', 23], ['Consultor', 25],
];

const INDIVIDUAL_COLUMNS = GENERAL_COLUMNS.slice(0, -1);

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value) {
  if (!value) return null;
  const normalized = String(value).substring(0, 10);
  const [year, month, day] = normalized.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0);
}

function installmentLabel(sale) {
  return sale.installment_total ? `${sale.installment_number || 1}/${sale.installment_total}` : '';
}

function safeSheetName(value, usedNames) {
  const base = String(value || 'Consultor').replace(/[\\/*?:[\]]/g, '-').trim().substring(0, 31) || 'Consultor';
  let name = base;
  let suffix = 2;
  while (usedNames.has(name.toLowerCase())) {
    const addition = ` ${suffix++}`;
    name = `${base.substring(0, 31 - addition.length)}${addition}`;
  }
  usedNames.add(name.toLowerCase());
  return name;
}

function styleCellBorder(cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: COLORS.border } },
    left: { style: 'thin', color: { argb: COLORS.border } },
    bottom: { style: 'thin', color: { argb: COLORS.border } },
    right: { style: 'thin', color: { argb: COLORS.border } },
  };
}

function configureSheet(worksheet, { title, subtitle, sales, target, includeConsultant }) {
  const columns = includeConsultant ? GENERAL_COLUMNS : INDIVIDUAL_COLUMNS;
  const columnCount = columns.length;
  worksheet.properties.tabColor = { argb: COLORS.wine };
  worksheet.views = [{ state: 'frozen', ySplit: 3, showGridLines: false, zoomScale: 85 }];
  worksheet.pageSetup = {
    orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    paperSize: 9, margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };

  columns.forEach(([, width], index) => { worksheet.getColumn(index + 1).width = width; });

  worksheet.mergeCells(1, 1, 1, columnCount);
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.wine } };
  titleCell.font = { name: 'Aptos Display', bold: true, color: { argb: COLORS.white }, size: 15 };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(1).height = 30;

  worksheet.mergeCells(2, 1, 2, columnCount);
  const subtitleCell = worksheet.getCell(2, 1);
  subtitleCell.value = subtitle;
  subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F7EDEF' } };
  subtitleCell.font = { name: 'Aptos', italic: true, color: { argb: COLORS.muted }, size: 10 };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(2).height = 21;

  const headerRow = worksheet.getRow(3);
  columns.forEach(([label], index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = label.toUpperCase();
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.wineLight } };
    cell.font = { name: 'Aptos', bold: true, color: { argb: COLORS.white }, size: 10 };
    cell.alignment = { horizontal: index === 3 || index === 5 || index === 6 ? 'right' : 'left', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.wineBorder } },
      left: { style: 'thin', color: { argb: COLORS.wineBorder } },
      bottom: { style: 'thin', color: { argb: COLORS.wineBorder } },
      right: { style: 'thin', color: { argb: COLORS.wineBorder } },
    };
  });
  headerRow.height = 24;

  const orderedSales = [...sales].sort((a, b) => String(a.closed_at || '').localeCompare(String(b.closed_at || '')));
  orderedSales.forEach((sale, saleIndex) => {
    const rowNumber = 4 + saleIndex;
    const values = [
      dateValue(sale.closed_at),
      sale.customer_display_name || sale.customer_name || sale.client_name || sale.company_name || '',
      sale.service_display_name || sale.service_name || sale.description || '',
      number(sale.amount),
      installmentLabel(sale),
      number(sale.commission_percentage) / 100,
      number(sale.commission_amount),
      PAYMENT_LABELS[sale.payment_method] || sale.payment_method || '',
      CLOSING_LABELS[sale.closing_method] || sale.closing_method || '',
    ];
    if (includeConsultant) values.push(sale.seller_name || '');
    const row = worksheet.getRow(rowNumber);
    row.values = values;
    row.height = 22;
  });

  const minimumInputRows = 15;
  const lastInputRow = 3 + Math.max(orderedSales.length, minimumInputRows);
  for (let rowNumber = 4; rowNumber <= lastInputRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.height = row.height || 22;
    for (let column = 1; column <= columnCount; column += 1) {
      const cell = row.getCell(column);
      cell.font = { name: 'Aptos', size: 10, color: { argb: COLORS.text } };
      cell.alignment = { vertical: 'middle', horizontal: [4, 6, 7].includes(column) ? 'right' : 'left' };
      styleCellBorder(cell);
    }
    row.getCell(1).numFmt = 'dd/mm/yyyy';
    row.getCell(4).numFmt = '"R$" #,##0.00';
    row.getCell(6).numFmt = '0.00%';
    row.getCell(7).numFmt = '"R$" #,##0.00';
  }

  const totalRowNumber = lastInputRow + 1;
  const targetRowNumber = totalRowNumber + 1;
  const remainingRowNumber = targetRowNumber + 1;

  worksheet.mergeCells(totalRowNumber, 1, totalRowNumber, 3);
  worksheet.mergeCells(targetRowNumber, 1, targetRowNumber, 3);
  worksheet.mergeCells(remainingRowNumber, 1, remainingRowNumber, 3);

  const totalRow = worksheet.getRow(totalRowNumber);
  totalRow.getCell(1).value = 'TOTAL DO MÊS';
  totalRow.getCell(4).value = { formula: `SUM(D4:D${lastInputRow})` };
  totalRow.getCell(7).value = { formula: `SUM(G4:G${lastInputRow})` };
  for (let column = 1; column <= columnCount; column += 1) {
    const cell = totalRow.getCell(column);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.wineLight } };
    cell.font = { name: 'Aptos', bold: true, color: { argb: COLORS.white }, size: 10 };
    styleCellBorder(cell);
  }
  [4, 7].forEach((column) => {
    const cell = totalRow.getCell(column);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.green } };
    cell.font = { name: 'Aptos', bold: true, color: { argb: COLORS.greenText }, size: 10 };
    cell.numFmt = '"R$" #,##0.00';
    cell.alignment = { horizontal: 'right' };
  });
  totalRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };

  const targetRow = worksheet.getRow(targetRowNumber);
  targetRow.getCell(1).value = includeConsultant ? 'META GERAL' : 'META INDIVIDUAL';
  targetRow.getCell(4).value = number(target);
  const remainingRow = worksheet.getRow(remainingRowNumber);
  remainingRow.getCell(1).value = 'FALTA PARA A META';
  remainingRow.getCell(4).value = { formula: `MAX(D${targetRowNumber}-D${totalRowNumber},0)` };

  [targetRow, remainingRow].forEach((row) => {
    for (let column = 1; column <= columnCount; column += 1) {
      const cell = row.getCell(column);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.soft } };
      cell.font = { name: 'Aptos', bold: true, color: { argb: COLORS.muted }, size: 10 };
      styleCellBorder(cell);
    }
    row.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(4).numFmt = '"R$" #,##0.00';
    row.getCell(4).alignment = { horizontal: 'right' };
  });

  targetRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.yellow } };
  targetRow.getCell(4).font = { name: 'Aptos', bold: true, color: { argb: COLORS.yellowText }, size: 10 };
  remainingRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: number(target) <= orderedSales.reduce((sum, sale) => sum + number(sale.amount), 0) ? COLORS.green : COLORS.red } };
  remainingRow.getCell(4).font = { name: 'Aptos', bold: true, color: { argb: COLORS.white }, size: 10 };

  worksheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: columnCount } };
  worksheet.pageSetup.printArea = `A1:${worksheet.getColumn(columnCount).letter}${remainingRowNumber}`;
  worksheet.headerFooter.oddFooter = '&LCR Recursos&C&P de &N&RExportado pelo sistema';
}

async function buildSalesWorkbook({ sales = [], consultants = [], period = {}, generalTarget = null, generatedAt = new Date() }) {
  const month = Math.min(Math.max(Number(period.month) || generatedAt.getMonth() + 1, 1), 12);
  const year = Number(period.year) || generatedAt.getFullYear();
  const periodLabel = `${MONTHS[month - 1]} de ${year}`;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Telun';
  workbook.lastModifiedBy = 'Sistema CR Recursos';
  workbook.company = 'CR Recursos';
  workbook.subject = `Quadro mensal de vendas — ${periodLabel}`;
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  workbook.calcProperties.fullCalcOnLoad = true;

  const usedNames = new Set();
  const activeConsultants = consultants.filter((consultant) =>
    ['seller', 'supervisor'].includes(String(consultant.role || '').toLowerCase())
    && consultant.is_active !== false
  );
  const resolvedGeneralTarget = generalTarget === null
    ? activeConsultants.reduce((sum, consultant) => sum + number(consultant.monthly_sales_target), 0)
    : number(generalTarget);
  const generalSheet = workbook.addWorksheet(safeSheetName('FATURAMENTO', usedNames));
  configureSheet(generalSheet, {
    title: `CR RECURSOS — FATURAMENTO — ${periodLabel.toUpperCase()}`,
    subtitle: 'Visão geral do mês · os valores são provenientes do sistema',
    sales,
    target: resolvedGeneralTarget,
    includeConsultant: true,
  });

  activeConsultants.forEach((consultant) => {
    const consultantSales = sales.filter((sale) => sale.seller_id === consultant.id);
    const isSupervisor = String(consultant.role || '').toLowerCase() === 'supervisor';
    const commissionPercentage = number(consultant.commission_percentage ?? (isSupervisor ? SUPERVISOR_PERSONAL_PERCENTAGE : FIXED_COMMISSION_PERCENTAGE));
    const commissionThreshold = number(consultant.commission_threshold ?? FIXED_COMMISSION_THRESHOLD);
    const worksheet = workbook.addWorksheet(safeSheetName(consultant.name, usedNames));
    configureSheet(worksheet, {
      title: `CR RECURSOS — ${String(consultant.name || 'CONSULTOR').toUpperCase()} — ${periodLabel.toUpperCase()}`,
      subtitle: isSupervisor
        ? `Meta pessoal: R$ ${number(consultant.monthly_sales_target).toFixed(2)} · Comissão pessoal: ${SUPERVISOR_PERSONAL_PERCENTAGE.toFixed(2)}% sobre o valor integral`
        : commissionThreshold === 0
          ? `Meta: R$ ${number(consultant.monthly_sales_target).toFixed(2)} · Comissão: ${commissionPercentage.toFixed(2)}% sobre o valor integral, desde a 1ª venda`
          : `Meta: R$ ${number(consultant.monthly_sales_target).toFixed(2)} · Comissão fixa: ${commissionPercentage.toFixed(2)}% sobre o excedente de R$ ${commissionThreshold.toFixed(2)}`,
      sales: consultantSales,
      target: consultant.monthly_sales_target,
      includeConsultant: false,
    });
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function salesWorkbookFilename(period = {}) {
  const month = String(Number(period.month) || new Date().getMonth() + 1).padStart(2, '0');
  const year = Number(period.year) || new Date().getFullYear();
  return `CR-Recursos-Vendas-${year}-${month}.xlsx`;
}

module.exports = { buildSalesWorkbook, salesWorkbookFilename, safeSheetName };
