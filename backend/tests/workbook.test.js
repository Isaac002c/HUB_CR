const assert = require('assert');
const ExcelJS = require('exceljs');
const { buildSalesWorkbook, salesWorkbookFilename, safeSheetName } = require('../services/salesWorkbookService');

async function main() {
  const consultants = [{
    id: 'seller-1', name: 'Ana Luiza', role: 'seller', is_active: true,
    monthly_sales_target: 10000, commission_threshold: 7500, commission_percentage: 10,
  }, {
    id: 'supervisor-1', name: 'Supervisora', role: 'supervisor', is_active: true,
    monthly_sales_target: 12000, commission_threshold: 0, commission_percentage: 10,
  }, {
    id: 'marketing-1', name: 'Larissa Marketing', role: 'seller', is_active: true,
    monthly_sales_target: 0, commission_threshold: 0, commission_percentage: 5,
  }];
  const sales = [
    {
      id: 'sale-1', seller_id: 'seller-1', seller_name: 'Ana Luiza', closed_at: '2026-08-13',
      customer_name: 'Cliente A', service_name: 'Suspensão', amount: 7000,
      commission_percentage: 10, commission_amount: 0, payment_method: 'pix', closing_method: 'remoto',
    },
    {
      id: 'sale-2', seller_id: 'seller-1', seller_name: 'Ana Luiza', closed_at: '2026-08-14',
      customer_name: 'Cliente B', service_name: 'Multa', amount: 1000,
      installment_number: 1, installment_total: 2, commission_percentage: 10, commission_amount: 50,
      payment_method: 'boleto', closing_method: 'presencial',
    },
    {
      id: 'sale-3', seller_id: 'supervisor-1', seller_name: 'Supervisora', closed_at: '2026-08-15',
      customer_name: 'Cliente C', service_name: 'Recurso', amount: 8000,
      commission_percentage: 10, commission_amount: 800, payment_method: 'pix', closing_method: 'remoto',
    },
    {
      id: 'sale-4', seller_id: 'marketing-1', seller_name: 'Larissa Marketing', closed_at: '2026-08-16',
      customer_name: 'Cliente D', service_name: 'Multa', amount: 1000,
      commission_percentage: 5, commission_amount: 50, payment_method: 'pix', closing_method: 'remoto',
    },
  ];

  const buffer = await buildSalesWorkbook({ sales, consultants, period: { month: 8, year: 2026 }, generalTarget: 50000 });
  assert(buffer.length > 5000, 'arquivo XLSX deve conter dados e estilos');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  assert.deepStrictEqual(workbook.worksheets.map((sheet) => sheet.name), ['FATURAMENTO', 'Ana Luiza', 'Supervisora', 'Larissa Marketing']);

  const general = workbook.getWorksheet('FATURAMENTO');
  assert(String(general.getCell('A1').value).includes('AGOSTO DE 2026'));
  assert.strictEqual(general.getCell('B4').value, 'Cliente A');
  assert.strictEqual(general.getCell('D4').value, 7000);
  assert.strictEqual(general.getCell('F4').value, 0.1);
  assert.strictEqual(general.getCell('J4').value, 'Ana Luiza');
  assert.strictEqual(general.getCell('D19').value.formula, 'SUM(D4:D18)');
  assert.strictEqual(general.getCell('G19').value.formula, 'SUM(G4:G18)');
  assert.strictEqual(general.getCell('D20').value, 50000);
  assert.strictEqual(general.getCell('D21').value.formula, 'MAX(D20-D19,0)');
  assert.strictEqual(general.getCell('D19').fill.fgColor.argb, '38E61D');
  assert.strictEqual(general.getCell('D20').fill.fgColor.argb, 'FFF200');
  assert.strictEqual(general.getCell('D21').fill.fgColor.argb, 'EF1717');

  const individual = workbook.getWorksheet('Ana Luiza');
  assert(String(individual.getCell('A2').value).includes('Comissão fixa: 10.00%'));
  assert.strictEqual(individual.getCell('E5').value, '1/2');
  assert.strictEqual(individual.getCell('G5').value, 50);
  assert.strictEqual(individual.getCell('D20').value, 10000);

  const supervisor = workbook.getWorksheet('Supervisora');
  assert(String(supervisor.getCell('A2').value).includes('Comissão pessoal: 10.00% sobre o valor integral'));
  assert.strictEqual(supervisor.getCell('D4').value, 8000);
  assert.strictEqual(supervisor.getCell('G4').value, 800);
  assert.strictEqual(supervisor.getCell('D20').value, 12000);

  const marketing = workbook.getWorksheet('Larissa Marketing');
  assert(String(marketing.getCell('A2').value).includes('Comissão: 5.00% sobre o valor integral, desde a 1ª venda'));
  assert.strictEqual(marketing.getCell('F4').value, 0.05);
  assert.strictEqual(marketing.getCell('G4').value, 50);

  const used = new Set();
  assert.strictEqual(safeSheetName('Ana/Luiza', used), 'Ana-Luiza');
  assert.strictEqual(safeSheetName('Ana/Luiza', used), 'Ana-Luiza 2');
  assert.strictEqual(salesWorkbookFilename({ month: 8, year: 2026 }), 'CR-Recursos-Vendas-2026-08.xlsx');

  console.log('✓ Workbook de vendas: exportação geral, consultor e supervisão validada');
}

main().catch((error) => {
  console.error('✗ Workbook de vendas:', error);
  process.exit(1);
});
