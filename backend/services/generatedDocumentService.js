const PDFDocument = require('pdfkit');
const path = require('path');

const FOOTER_EMAIL = 'contato@crrecursos.com.br';
const COMPANY_SIGNATURE_PATH = path.join(__dirname, '..', 'assets', 'camila-rodrigues-signature.png');

const TEMPLATE_CATALOG = [
  { id: 'contrato_suspensao', label: 'Contrato - Processo de Suspensão', available: true, document_kind: 'contract', requires_contract_fields: true },
  { id: 'contrato_suspensao_hibrido', label: 'Contrato - Processo de Suspensão Híbrido', available: true, document_kind: 'contract', requires_contract_fields: true, include_sne_clause: true },
  { id: 'contrato_multa', label: 'Contrato - Multa', available: true, document_kind: 'contract', requires_contract_fields: true, include_sne_clause: true },
  { id: 'contrato_crci', label: 'Contrato - CRCI', available: true, document_kind: 'contract', requires_contract_fields: true },
  { id: 'contrato_cassacao', label: 'Contrato - Cassação', available: true, document_kind: 'contract', requires_contract_fields: true },
  { id: 'contrato_real_infrator', label: 'Contrato - Real Infrator', available: true, document_kind: 'contract', requires_contract_fields: true },
  { id: 'procuracao', label: 'Procuração', available: true, document_kind: 'power_of_attorney', requires_contract_fields: false },
];

const SNE_CLAUSE_TITLE = 'DO PAGAMENTO DA MULTA PELO CONTRATANTE POR MEIO DO SNE';
const SNE_CLAUSE_TEXT = 'Caso o CONTRATANTE realize o pagamento da(s) multa(s) objeto deste contrato por meio do Sistema de Notificação Eletrônica – SNE, após a assinatura deste instrumento, a CONTRATADA ficará desobrigada de prosseguir com os serviços contratados, uma vez que a opção pelo pagamento com desconto pelo SNE implica a impossibilidade de apresentação do respectivo recurso administrativo, não cabendo à CONTRATADA a restituição dos valores já pagos.';

const UNIT = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const TEN_TO_NINETEEN = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function underThousand(value) {
  const number = Math.trunc(value);
  if (!number) return '';
  if (number === 100) return 'cem';
  const pieces = [];
  const hundreds = Math.trunc(number / 100);
  const rest = number % 100;
  if (hundreds) pieces.push(HUNDREDS[hundreds]);
  if (rest) {
    let belowHundred = '';
    if (rest < 10) belowHundred = UNIT[rest];
    else if (rest < 20) belowHundred = TEN_TO_NINETEEN[rest - 10];
    else {
      const tens = Math.trunc(rest / 10);
      const units = rest % 10;
      belowHundred = TENS[tens] + (units ? ` e ${UNIT[units]}` : '');
    }
    pieces.push(belowHundred);
  }
  return pieces.join(' e ');
}

function integerToWords(value) {
  const number = Math.trunc(value);
  if (number === 0) return 'zero';
  const groups = [
    { size: 1_000_000_000, singular: 'bilhão', plural: 'bilhões' },
    { size: 1_000_000, singular: 'milhão', plural: 'milhões' },
    { size: 1_000, singular: 'mil', plural: 'mil' },
  ];
  let remainder = number;
  const parts = [];
  for (const group of groups) {
    const count = Math.trunc(remainder / group.size);
    if (!count) continue;
    if (group.size === 1_000 && count === 1) parts.push('mil');
    else parts.push(`${underThousand(count)} ${count === 1 ? group.singular : group.plural}`);
    remainder %= group.size;
  }
  if (remainder) parts.push(underThousand(remainder));
  return parts.join(remainder > 0 && remainder < 100 ? ' e ' : ', ');
}

function currencyToWords(value) {
  const centsTotal = Math.round(Number(value) * 100);
  const reais = Math.trunc(centsTotal / 100);
  const cents = Math.abs(centsTotal % 100);
  const parts = [`${integerToWords(reais)} ${reais === 1 ? 'real' : 'reais'}`];
  if (cents) parts.push(`${integerToWords(cents)} ${cents === 1 ? 'centavo' : 'centavos'}`);
  return parts.join(' e ');
}

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
}

function formatDate(value) {
  if (!value) return 'não informado';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getUTCDate()).padStart(2, '0')}/${String(value.getUTCMonth() + 1).padStart(2, '0')}/${value.getUTCFullYear()}`;
  }
  const text = String(value).trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return `${String(parsed.getUTCDate()).padStart(2, '0')}/${String(parsed.getUTCMonth() + 1).padStart(2, '0')}/${parsed.getUTCFullYear()}`;
  }
  return text;
}

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function formatCPF(value) {
  const digits = digitsOnly(value);
  if (digits.length !== 11) return clean(value);
  return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
}

function formatCNH(value) {
  const digits = digitsOnly(value);
  return digits.length === 11 ? digits : clean(value);
}

function formatPhone(value) {
  const digits = digitsOnly(value);
  if (digits.length === 11) return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (digits.length === 10) return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  return clean(value);
}

function sentence(value) {
  return `${clean(value).replace(/[.;:\s]+$/g, '')}.`;
}

function emissionDate(date = new Date()) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric',
  }).format(date);
}

function clean(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || 'não informado';
}

function ensureSpace(doc, requiredHeight) {
  // Reserva técnica: o PDFKit considera lineGap/paragraphGap de forma um pouco
  // diferente ao quebrar texto justificado. Esta folga evita uma página nova
  // automática sem o cabeçalho institucional.
  const contentBottom = Math.min(doc.page.height - doc.page.margins.bottom - 28, 660);
  if (doc.y + requiredHeight <= contentBottom) return;
  if (process.env.DEBUG_GENERATED_PDF === '1') console.log('[generated-pdf] page break', { y: doc.y, requiredHeight, contentBottom });
  doc.addPage();
  addPageHeader(doc, doc._crTemplateLabel);
  if (process.env.DEBUG_GENERATED_PDF === '1') console.log('[generated-pdf] header ready', { y: doc.y, x: doc.x });
}

function addBody(doc, text, options = {}) {
  const textOptions = {
    align: options.align || 'justify',
    lineGap: options.lineGap ?? 2.6,
    paragraphGap: options.paragraphGap ?? 7,
  };
  const font = options.bold ? 'Helvetica-Bold' : 'Helvetica';
  const size = options.size || 9.3;
  doc.font(font).fontSize(size);
  ensureSpace(doc, doc.heightOfString(text, textOptions) + textOptions.paragraphGap + 2);
  doc.font(font).fontSize(size).fillColor('#1f2937').text(text, textOptions);
}

function addRichBody(doc, segments, options = {}) {
  const textOptions = {
    align: options.align || 'justify',
    lineGap: options.lineGap ?? 2.6,
    paragraphGap: options.paragraphGap ?? 7,
  };
  const size = options.size || 9.3;
  const normalized = segments
    .map((segment) => ({ text: String(segment?.text || ''), bold: segment?.bold === true }))
    .filter((segment) => segment.text);
  const plainText = normalized.map((segment) => segment.text).join('');
  doc.font('Helvetica').fontSize(size);
  ensureSpace(doc, doc.heightOfString(plainText, textOptions) + textOptions.paragraphGap + 4);
  normalized.forEach((segment, index) => {
    const last = index === normalized.length - 1;
    doc.font(segment.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(size)
      .fillColor('#1f2937')
      .text(segment.text, {
        ...textOptions,
        continued: !last,
        paragraphGap: last ? textOptions.paragraphGap : 0,
      });
  });
}

function addSection(doc, text) {
  ensureSpace(doc, 42);
  doc.moveDown(0.4)
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor('#751518')
    .text(text, { align: 'left', paragraphGap: 7 });
}

function addPageHeader(doc, templateLabel) {
  const logoPath = path.join(__dirname, '..', 'assets', 'cr-recursos-mark.png');
  try { doc.image(logoPath, 69, 14, { width: 78, height: 27, fit: [78, 27], align: 'center' }); } catch {}
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#751518')
    .text('CR RECURSOS', 52, 42, { align: 'center', width: 112, lineBreak: false });
  doc.font('Helvetica').fontSize(5.6).fillColor('#64748b')
    .text('ASSESSORIA DE TRÂNSITO', 52, 54, { align: 'center', width: 112, characterSpacing: 0.55, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(8.2).fillColor('#751518')
    .text(templateLabel.toUpperCase(), 205, 30, { align: 'right', width: 338, lineBreak: false });
  doc.moveTo(52, 69).lineTo(543, 69).lineWidth(0.7).strokeColor('#d7b8ba').stroke();
  doc.x = 52;
  doc.y = 84;
}

function decoratePageFooters(doc) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const originalBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.moveTo(52, 786).lineTo(543, 786).lineWidth(0.5).strokeColor('#d7b8ba').stroke();
    doc.font('Helvetica').fontSize(6.8).fillColor('#64748b')
      .text(`${FOOTER_EMAIL} | (21) 3977-4331 | (21) 9 7546-1065`, 52, 795, { width: 410, lineBreak: false })
      .text('Estrada do Monteiro, nº 20, Loja E - Campo Grande/RJ - CEP 23045-830', 52, 806, { width: 410, lineBreak: false });
    doc.text(`Página ${index - range.start + 1} de ${range.count}`, 463, 800, { width: 80, align: 'right', lineBreak: false });
    doc.page.margins.bottom = originalBottomMargin;
  }
}

function buildAgreementPdf({ client, template, contractObject, amount, paymentTerms, issuedAt = new Date() }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: 'A4', margins: { top: 78, right: 52, bottom: 66, left: 52 }, bufferPages: true,
      info: {
        Title: `${template.label} - ${clean(client.name)}`,
        Author: 'CR Recursos - Assessoria de Trânsito Ltda',
        Subject: 'Contrato de prestação de serviço e assessoria',
        Creator: 'Sistema CR Recursos',
      },
    });
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    doc._crTemplateLabel = template.label;
    addPageHeader(doc, template.label);

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827')
      .text('CONTRATO DE PRESTAÇÃO DE SERVIÇO E ASSESSORIA', { align: 'center' });
    doc.font('Helvetica').fontSize(8).fillColor('#751518')
      .text(template.label.toUpperCase(), { align: 'center', paragraphGap: 15 });

    addRichBody(doc, [
      { text: 'Pelo presente instrumento particular de contrato de prestação de serviços e assessoria de legislação de trânsito, de um lado ' },
      { text: 'CR RECURSOS - ASSESSORIA DE TRÂNSITO LTDA', bold: true },
      { text: ', CNPJ 61.189.715/0001-29, com endereço comercial à Estrada do Monteiro nº 20, Loja E - Campo Grande/RJ, CEP 23045-830, representada pela sócia-administradora Camila Rodrigues Pereira, inscrita no CPF 154.783.487-08, Advogada e Especialista em Direito de Trânsito, sob a OAB/RJ nº 274.380, denominada CONTRATADA.' },
    ]);

    addRichBody(doc, [
      { text: 'Do outro lado ' },
      { text: clean(client.name).toUpperCase(), bold: true },
      { text: `, portador(a) do CPF ${formatCPF(client.cpf)}; data de nascimento ${formatDate(client.birth_date)}; CNH nº ${formatCNH(client.cnh)}; primeira habilitação ${formatDate(client.first_cnh)}; telefone ${formatPhone(client.phone)}; residente e domiciliado(a) à ${clean(client.address)}; e-mail ${clean(client.email)}, denominado(a) CONTRATANTE.` },
    ]);

    addBody(doc, 'As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Prestação de Serviços e Assessoria, que será regido pelas cláusulas seguintes e pelas condições descritas no presente.');

    addSection(doc, 'I - DO OBJETO DO CONTRATO');
    addRichBody(doc, [
      { text: 'Cláusula 1ª. O presente contrato tem como OBJETO a prestação, pela CONTRATADA, de serviço de assessoria ao CONTRATANTE, inerente ao seguinte serviço: ' },
      { text: sentence(contractObject), bold: true },
    ]);
    addBody(doc, 'Parágrafo único. O acompanhamento dos processos poderá ser realizado através do site do órgão de trânsito competente.');

    addSection(doc, 'DAS OBRIGAÇÕES DA CONTRATADA');
    addBody(doc, 'Cláusula 2ª. A CONTRATADA se obriga a acompanhar todos os atos relacionados com o serviço de assessoria descrito na Cláusula 1ª, executando as tarefas necessárias para a solução de problemas, de forma preventiva, paliativa ou decisória, nos moldes dos parágrafos seguintes.');
    addBody(doc, '§1º. A CONTRATADA se obriga a utilizar técnicas condizentes com o serviço de assessoria a ser prestado, utilizando todos os esforços para a sua consecução.');
    addBody(doc, '§2º. A CONTRATADA utilizará todo o seu corpo técnico para a realização de pesquisa e desenvolvimento na área assessorada, bem como para a solução e prevenção de eventuais problemas, nomeando um responsável para a administração das atividades.');

    addSection(doc, 'DAS OBRIGAÇÕES DO CONTRATANTE');
    addBody(doc, 'Cláusula 3ª. O CONTRATANTE se obriga a apresentar à CONTRATADA eventuais documentos necessários ou assinaturas para o bom e fiel cumprimento do presente contrato de assessoria, sempre que solicitado.');
    addBody(doc, '§1º. O CONTRATANTE se responsabiliza pelas informações e dados pessoais, número de telefone, endereço de e-mail e documentos fornecidos à CONTRATADA, pois através de algum desses meios a CONTRATADA solicitará informações ou documentos relacionados ao presente contrato para a execução do serviço e assessoria.');
    addBody(doc, '§2º. O CONTRATANTE se obriga a informar e encaminhar à CONTRATADA, quando do recebimento, cópia de todas as notificações, inclusive do resultado do processo.');

    addSection(doc, 'II - DA REMUNERAÇÃO - DOS HONORÁRIOS');
    addRichBody(doc, [
      { text: 'Cláusula 4ª. O CONTRATANTE pagará à CONTRATADA, em remuneração pelos serviços contratados, o valor de ' },
      { text: `${formatBRL(amount)} (${currencyToWords(amount).toUpperCase()})`, bold: true },
      { text: ', a ser pago da seguinte forma: ' },
      { text: sentence(paymentTerms), bold: true },
    ]);
    addBody(doc, '§1º. O valor montante é por todo o processo administrativo do objeto do contrato.');
    addBody(doc, '§2º. Em caso de inadimplência, a CONTRATADA fica desobrigada a prosseguir com o processo e todos os atos relacionados ao presente contrato.');

    addSection(doc, 'CONDIÇÕES GERAIS');
    addBody(doc, 'Cláusula 5ª. O presente contrato passa a valer a partir da assinatura pelas partes e da comprovação de pagamento.');

    if (template.include_sne_clause) {
      addSection(doc, SNE_CLAUSE_TITLE);
      addBody(doc, SNE_CLAUSE_TEXT);
    }

    addSection(doc, 'DO FORO');
    addBody(doc, 'Cláusula 6ª. Elegem as partes o foro de Campo Grande/RJ para dirimir quaisquer dúvidas advindas da execução do presente contrato.');
    addBody(doc, 'Assim, por estarem de acordo, mandaram datilografar o presente instrumento particular, o qual foi lido e achado de acordo, que tem força de título executivo extrajudicial, conforme preconiza o Art. 585 do CPC. Por estarem assim justos e contratados, firmam o presente instrumento em duas vias de igual teor.');

    // A data, as duas linhas de assinatura e as identificações ocupam cerca de
    // 105 pt. Reservar 115 pt evita órfãs sem empurrar apenas as assinaturas
    // para uma terceira página praticamente vazia.
    ensureSpace(doc, 115);
    doc.moveDown(1.1);
    addBody(doc, `Rio de Janeiro, ${emissionDate(issuedAt)}.`, { align: 'center', paragraphGap: 30 });

    const signatureY = doc.y + 34;
    const leftX = 58;
    const rightX = 318;
    const lineWidth = 220;
    const companySignatureWidth = 125;
    doc.image(
      COMPANY_SIGNATURE_PATH,
      rightX + ((lineWidth - companySignatureWidth) / 2),
      signatureY - 28,
      { width: companySignatureWidth },
    );
    doc.moveTo(leftX, signatureY).lineTo(leftX + lineWidth, signatureY).strokeColor('#475569').lineWidth(0.7).stroke();
    doc.moveTo(rightX, signatureY).lineTo(rightX + lineWidth, signatureY).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111827')
      .text(clean(client.name).toUpperCase(), leftX, signatureY + 7, { width: lineWidth, align: 'center' })
      .text('CAMILA RODRIGUES PEREIRA', rightX, signatureY + 7, { width: lineWidth, align: 'center' });
    doc.font('Helvetica').fontSize(7.3).fillColor('#64748b')
      .text(`CONTRATANTE - CPF ${formatCPF(client.cpf)}`, leftX, signatureY + 20, { width: lineWidth, align: 'center' })
      .text('CR RECURSOS - CONTRATADA', rightX, signatureY + 20, { width: lineWidth, align: 'center' });

    decoratePageFooters(doc);
    doc.end();
  });
}

function buildPowerOfAttorneyPdf({ client, template, issuedAt = new Date() }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: 'A4', margins: { top: 78, right: 66, bottom: 66, left: 66 }, bufferPages: true,
      info: {
        Title: `Procuração - ${clean(client.name)}`,
        Author: 'CR Recursos - Assessoria de Trânsito Ltda',
        Subject: 'Procuração para atuação administrativa em matéria de trânsito',
        Creator: 'Sistema CR Recursos',
      },
    });
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    doc._crTemplateLabel = template.label;
    addPageHeader(doc, template.label);
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#111827')
      .text('PROCURAÇÃO', { align: 'center', paragraphGap: 28 });

    addRichBody(doc, [
      { text: 'OUTORGANTE: ', bold: true },
      { text: clean(client.name).toUpperCase(), bold: true },
      { text: `, portador(a) do CPF: ${formatCPF(client.cpf)}; Data de Nascimento: ${formatDate(client.birth_date)}; CNH nº ${formatCNH(client.cnh)}, Primeira Habilitação: ${formatDate(client.first_cnh)}; Telefone: ${formatPhone(client.phone)}; residente e domiciliado(a) à ${clean(client.address)}.` },
    ], { size: 10.8, paragraphGap: 18 });

    addRichBody(doc, [
      { text: 'OUTORGADO: ', bold: true },
      { text: 'CAMILA RODRIGUES PEREIRA', bold: true },
      { text: ', brasileira, Advogada e Especialista em Direito de Trânsito, devidamente inscrita na OAB/RJ nº 274.380, e-mail: contato@crrecursos.com.br, com domicilio profissional à Estrada do Monteiro, nº 20, Sala E, Campo Grande /RJ – CEP: 23045-830, Tel.: (21) 97546-1065 e (21) 3977-4331.' },
    ], { size: 10.8, paragraphGap: 18 });

    addSection(doc, 'PODERES');
    addBody(doc, 'Por este instrumento particular de procuração, nomeio e constituo meu procurador e outorgado, concedendo-lhe os poderes da cláusula judicial e extrajudicial, para foro em geral, podendo portanto promover quaisquer medidas administrativas, em qualquer instância, assinar termo, bem como interpor petições e recursos administrativos junto aos órgãos e entidades de trânsito do Estado do Rio de Janeiro e SMTR (Secretaria Municipal de Transportes), DETRAN/RJ, DER (Departamento de Estradas de Rodagem), PRF (Policia Rodoviária Federal), DNIT (Departamento Nacional de Infraestrutura de Transportes), ANTT (Agência Nacional de Transportes Terrestres), podendo agir em conjunto ou separadamente, em especial defesa de autuação, recurso de infração de trânsito, atuar em processos de suspensão do direito de dirigir ou cassação de CNH, praticar ainda, todos e quaisquer atos necessários e convenientes ao bom e fiel desemprenho deste mandato.', { size: 10.8, paragraphGap: 24 });

    ensureSpace(doc, 120);
    addBody(doc, `Rio de Janeiro, ${emissionDate(issuedAt)}.`, { align: 'center', size: 10.8, paragraphGap: 34 });
    const signatureY = doc.y + 38;
    const lineX = 152;
    const lineWidth = 292;
    doc.moveTo(lineX, signatureY).lineTo(lineX + lineWidth, signatureY).strokeColor('#475569').lineWidth(0.7).stroke();
    doc.font('Helvetica-Bold').fontSize(8.8).fillColor('#111827')
      .text(clean(client.name).toUpperCase(), lineX, signatureY + 8, { width: lineWidth, align: 'center' });
    doc.font('Helvetica').fontSize(7.5).fillColor('#64748b')
      .text(`OUTORGANTE - CPF ${formatCPF(client.cpf)}`, lineX, signatureY + 22, { width: lineWidth, align: 'center' });

    decoratePageFooters(doc);
    doc.end();
  });
}

function parseAmount(value) {
  if (typeof value === 'number') return value;
  const normalized = String(value || '').trim().replace(/\./g, '').replace(',', '.');
  return Number(normalized);
}

module.exports = {
  FOOTER_EMAIL,
  COMPANY_SIGNATURE_PATH,
  TEMPLATE_CATALOG,
  buildAgreementPdf,
  buildPowerOfAttorneyPdf,
  parseAmount,
  currencyToWords,
  formatDate,
  formatCPF,
  formatCNH,
  formatPhone,
  sentence,
  SNE_CLAUSE_TITLE,
  SNE_CLAUSE_TEXT,
};
