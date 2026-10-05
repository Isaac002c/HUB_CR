const assert = require('assert');
const fs = require('fs');
const {
  TEMPLATE_CATALOG, buildAgreementPdf, buildPowerOfAttorneyPdf, currencyToWords, parseAmount, FOOTER_EMAIL,
  COMPANY_SIGNATURE_PATH,
  formatDate, formatCPF, formatCNH, formatPhone, sentence,
  SNE_CLAUSE_TITLE, SNE_CLAUSE_TEXT,
} = require('../services/generatedDocumentService');

(async () => {
  assert.strictEqual(parseAmount('1.250,50'), 1250.5);
  assert.strictEqual(currencyToWords(700), 'setecentos reais');
  assert.strictEqual(currencyToWords(1250.5), 'mil, duzentos e cinquenta reais e cinquenta centavos');
  assert.strictEqual(formatDate('1960-08-18'), '18/08/1960');
  assert.strictEqual(formatDate(new Date('1960-08-18T00:00:00.000Z')), '18/08/1960');
  assert.strictEqual(formatDate('Thu Aug 18 1960 00:00:00 GMT+0000 (Coordinated Universal Time)'), '18/08/1960');
  assert.strictEqual(formatCPF('60984791787'), '609.847.917-87');
  assert.strictEqual(formatCNH('01422474810'), '01422474810');
  assert.strictEqual(formatPhone('21970283297'), '(21) 97028-3297');
  assert.strictEqual(sentence('À vista no ato da contratação..'), 'À vista no ato da contratação.');
  assert.strictEqual(FOOTER_EMAIL, 'contato@crrecursos.com.br');
  assert(fs.existsSync(COMPANY_SIGNATURE_PATH), 'A assinatura institucional deve acompanhar o gerador de contratos.');
  assert(SNE_CLAUSE_TITLE.includes('SNE'));
  assert(SNE_CLAUSE_TEXT.includes('Sistema de Notificação Eletrônica'));
  assert.strictEqual(TEMPLATE_CATALOG.find((item) => item.id === 'contrato_suspensao')?.include_sne_clause, undefined);
  assert.strictEqual(TEMPLATE_CATALOG.find((item) => item.id === 'contrato_multa')?.include_sne_clause, true);
  assert.strictEqual(TEMPLATE_CATALOG.find((item) => item.id === 'contrato_suspensao_hibrido')?.include_sne_clause, true);
  assert.strictEqual(TEMPLATE_CATALOG.find((item) => item.id === 'procuracao')?.available, true);

  const template = TEMPLATE_CATALOG.find((item) => item.id === 'contrato_suspensao');
  const pdf = await buildAgreementPdf({
    client: {
      name: 'Cliente de Validação', cpf: '12345678901', cnh: '01234567890',
      birth_date: '1990-05-20', first_cnh: '2010-03-10', phone: '(21) 99999-9999',
      email: 'cliente@example.com', address: 'Rua de Teste, 100 - Rio de Janeiro/RJ',
    },
    template,
    contractObject: 'Assessoria e acompanhamento de processo administrativo de suspensão.',
    amount: 1250.5,
    paymentTerms: 'Entrada de R$ 500,00 e saldo em 3 parcelas.',
    issuedAt: new Date('2026-08-27T15:00:00-03:00'),
  });

  assert(Buffer.isBuffer(pdf));
  assert(pdf.subarray(0, 4).equals(Buffer.from('%PDF')));
  assert(pdf.length > 10000);

  const powerOfAttorney = await buildPowerOfAttorneyPdf({
    client: {
      name: 'Cliente de Validação', cpf: '12345678901', cnh: '01234567890',
      birth_date: '1990-05-20', first_cnh: '2010-03-10', phone: '(21) 99999-9999',
      address: 'Rua de Teste, 100 - Rio de Janeiro/RJ',
    },
    template: TEMPLATE_CATALOG.find((item) => item.id === 'procuracao'),
    issuedAt: new Date('2026-08-31T15:00:00-03:00'),
  });
  assert(Buffer.isBuffer(powerOfAttorney));
  assert(powerOfAttorney.subarray(0, 4).equals(Buffer.from('%PDF')));
  assert(powerOfAttorney.length > 8000);
  console.log('generatedDocuments.test.js: OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
