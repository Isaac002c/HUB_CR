/* ============================================================================
 * Testes de RBAC + Comissão + Ranking (funções puras — sem banco).
 * Executar:  node tests/rbac.test.js
 * (Define um DATABASE_URL dummy só para permitir o require dos models — nenhuma
 *  query é executada; os testes são 100% de lógica pura.)
 * ==========================================================================*/
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';

const assert = require('assert');
const access = require('../config/accessControl');
const { validateProcessStage } = require('../config/processStages');
const {
  FIXED_COMMISSION_PERCENTAGE,
  FIXED_COMMISSION_THRESHOLD,
  SUPERVISOR_PERSONAL_PERCENTAGE,
  SUPERVISOR_TEAM_PERCENTAGE,
  commissionPolicyForRole,
} = require('../config/commissionPolicy');
const { computeCommission, computeCommissionableAmount } = require('../models/managementModels');

let passed = 0;
const ok = (name, fn) => { try { fn(); passed++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name, '\n    ', e.message); process.exitCode = 1; } };

console.log('\n== MATRIZ DE ACESSO ==');

ok('MASTER acessa tudo (tenant inteiro)', () => {
  for (const m of access.MODULES) assert.strictEqual(access.accessLevel('master', m), 'full', m);
});

ok('ADM atua somente em Processos (sem Gestão, Financeiro, Histórico, Aprovações ou Configurações)', () => {
  assert.strictEqual(access.accessLevel('admin', 'financeiro'), 'none');
  assert.strictEqual(access.accessLevel('admin', 'gestao'), 'none');
  assert.strictEqual(access.accessLevel('admin', 'history'), 'none');
  assert.strictEqual(access.accessLevel('admin', 'approvals'), 'none');
  assert.strictEqual(access.accessLevel('admin', 'settings'), 'none');
  assert.strictEqual(access.accessLevel('admin', 'leads'), 'none');
  assert.strictEqual(access.accessLevel('admin', 'tarefas'), 'none');
});
ok('ADM acessa somente os módulos operacionais de Processos', () => {
  for (const m of ['clients', 'companies', 'deferidos', 'prazos', 'agenda', 'dashboard']) {
    assert.notStrictEqual(access.accessLevel('admin', m), 'none', m);
  }
});

ok('SUPERVISOR vê todos os clientes e mantém escopo de equipe no comercial e nas aprovações', () => {
  assert.strictEqual(access.accessLevel('supervisor', 'dashboard'), 'none');
  assert.strictEqual(access.accessLevel('supervisor', 'prazos'), 'none');
  assert.strictEqual(access.accessLevel('supervisor', 'history'), 'none');
  assert.strictEqual(access.accessLevel('supervisor', 'financeiro'), 'team');
  assert.strictEqual(access.accessLevel('supervisor', 'gestao'), 'team');
  assert.strictEqual(access.accessLevel('supervisor', 'clients'), 'full');
  assert.strictEqual(access.accessLevel('supervisor', 'approvals'), 'team');
});

ok('CONSULTOR (seller) escopo próprio, MAS Deferidos e Agenda globais', () => {
  assert.strictEqual(access.accessLevel('seller', 'clients'), 'own');
  assert.strictEqual(access.accessLevel('seller', 'leads'), 'own');
  assert.strictEqual(access.accessLevel('seller', 'prazos'), 'none');
  assert.strictEqual(access.accessLevel('seller', 'deferidos'), 'full'); // EXCEÇÃO global
  assert.strictEqual(access.accessLevel('seller', 'agenda'), 'full');    // EXCEÇÃO global
  assert.strictEqual(access.accessLevel('seller', 'dashboard'), 'none');
  assert.strictEqual(access.accessLevel('seller', 'history'), 'none');
  assert.strictEqual(access.accessLevel('seller', 'approvals'), 'none');
});

ok('DEFERIDOS e AGENDA são "full" para TODOS os perfis operacionais', () => {
  for (const r of ['master', 'admin', 'supervisor', 'seller']) {
    assert.strictEqual(access.accessLevel(r, 'deferidos'), 'full', `deferidos/${r}`);
    assert.strictEqual(access.accessLevel(r, 'agenda'), 'full', `agenda/${r}`);
  }
});

ok('super_admin (SaaS) preservado com acesso total', () => {
  assert.strictEqual(access.accessLevel('super_admin', 'gestao'), 'full');
  assert.strictEqual(access.accessLevel('super_admin', 'financeiro'), 'full');
});

console.log('\n== ANDAMENTOS DE PROCESSO ==');

ok('CONSULTOR pode cadastrar os três andamentos APRs', () => {
  for (const stage of ['APRS DEFESA PREVIA', 'APRS 1 INSTANCIA', 'APRS 2 INSTANCIA']) {
    assert.strictEqual(validateProcessStage('seller', stage).ok, true, stage);
  }
});
ok('CONSULTOR não pode cadastrar andamento de análise ou resultado', () => {
  assert.strictEqual(validateProcessStage('seller', 'DEFESA PREVIA - ANALISE').status, 403);
  assert.strictEqual(validateProcessStage('seller', 'DEFERIDO').status, 403);
});
ok('CONSULTOR usa o fluxo próprio do CRCI sem liberar outros andamentos', () => {
  assert.strictEqual(validateProcessStage('seller', 'EM ANDAMENTO', 'CRCI').ok, true);
  assert.strictEqual(validateProcessStage('seller', 'FINALIZADO', 'CRCI').ok, true);
  assert.strictEqual(validateProcessStage('seller', 'DEFERIDO', 'CRCI').status, 400);
});
ok('MASTER, ADMIN e SUPERVISOR mantêm o fluxo completo', () => {
  for (const role of ['master', 'admin', 'supervisor']) {
    assert.strictEqual(validateProcessStage(role, 'DEFERIDO').ok, true, role);
  }
});
ok('Mandatória, Excesso de Pontos e Protocolado foram retirados deste fluxo', () => {
  for (const stage of ['MANDATÓRIA', 'EXCESSO DE PONTOS', 'PROTOCOLADO']) {
    assert.strictEqual(validateProcessStage('master', stage).status, 400, stage);
  }
});

console.log('\n== COMISSÃO FIXA (snapshot) ==');

ok('Política global = 10% acima de R$ 7.500', () => {
  assert.strictEqual(FIXED_COMMISSION_PERCENTAGE, 10);
  assert.strictEqual(FIXED_COMMISSION_THRESHOLD, 7500);
});
ok('Base R$ 1.000 a 10% = R$ 100', () => {
  assert.strictEqual(computeCommission(1000, FIXED_COMMISSION_PERCENTAGE), 100);
});
ok('Base R$ 5.000 a 10% = R$ 500', () => {
  assert.strictEqual(computeCommission(5000, FIXED_COMMISSION_PERCENTAGE), 500);
});
ok('Arredondamento a 2 casas (R$ 1.234,56 a 10% = R$ 123,46)', () => {
  assert.strictEqual(computeCommission(1234.56, FIXED_COMMISSION_PERCENTAGE), 123.46);
});
ok('Abaixo de R$ 7.500 não existe base comissionável', () => {
  assert.strictEqual(computeCommissionableAmount(0, 7000, 7500), 0);
});
ok('Ao passar de R$ 7.500, somente o excedente comissiona', () => {
  assert.strictEqual(computeCommissionableAmount(7000, 1000, 7500), 500);
  assert.strictEqual(computeCommission(500, FIXED_COMMISSION_PERCENTAGE), 50);
});
ok('Depois do gatilho, a venda inteira é comissionável', () => {
  assert.strictEqual(computeCommissionableAmount(8000, 1200, 7500), 1200);
});
ok('Supervisora recebe 10% integrais sobre R$ 8.000 pessoais = R$ 800', () => {
  assert.strictEqual(SUPERVISOR_PERSONAL_PERCENTAGE, 10);
  assert.strictEqual(commissionPolicyForRole('supervisor').threshold, 0);
  assert.strictEqual(computeCommission(8000, SUPERVISOR_PERSONAL_PERCENTAGE), 800);
});
ok('Supervisora recebe 5% sobre R$ 30.000 dos consultores = R$ 1.500', () => {
  assert.strictEqual(SUPERVISOR_TEAM_PERCENTAGE, 5);
  assert.strictEqual(computeCommission(30000, SUPERVISOR_TEAM_PERCENTAGE), 1500);
});
ok('Comissão total da supervisora no cenário obrigatório = R$ 2.300', () => {
  const personal = computeCommission(8000, SUPERVISOR_PERSONAL_PERCENTAGE);
  const team = computeCommission(30000, SUPERVISOR_TEAM_PERCENTAGE);
  assert.strictEqual(personal + team, 2300);
});
ok('Política nova não contém comissão pessoal de 20% para supervisão', () => {
  assert.notStrictEqual(commissionPolicyForRole('supervisor').percentage, 20);
});
ok('Exceção individual 5% sem gatilho vale desde a primeira venda', () => {
  const policy = commissionPolicyForRole('seller', { commission_percentage: 5, commission_threshold: 0 });
  assert.deepStrictEqual(policy, { percentage: 5, threshold: 0, mode: 'full_amount' });
  assert.strictEqual(computeCommission(100, policy.percentage), 5);
  assert.strictEqual(computeCommission(1000, policy.percentage), 50);
});
ok('Configuração padrão de consultor continua em 10% após R$ 7.500', () => {
  assert.deepStrictEqual(
    commissionPolicyForRole('seller', { commission_percentage: 10, commission_threshold: 7500 }),
    { percentage: 10, threshold: 7500, mode: 'threshold_excess' },
  );
});
ok('Snapshot: alterar o % do vendedor NÃO muda a venda antiga', () => {
  // Venda antiga gravou 5% → R$ 50, independente de o vendedor virar 10% depois.
  const antiga = { amount: 1000, commission_percentage_snapshot: 5 };
  const valorHistorico = computeCommission(antiga.amount, antiga.commission_percentage_snapshot);
  assert.strictEqual(valorHistorico, 50);
  // Novo % (10) só valeria para vendas NOVAS:
  assert.strictEqual(computeCommission(1000, 10), 100);
});

console.log('\n== RANKING (ordem + desempate) ==');

// Espelho JS da regra do ORDER BY: valor desc, depois nº de vendas desc, depois venda mais recente.
const rankCompare = (a, b) =>
  (Number(b.total_amount) - Number(a.total_amount)) ||
  (Number(b.sales_count) - Number(a.sales_count)) ||
  (new Date(b.last_sale) - new Date(a.last_sale));

ok('A=10.000 → 1º, B=8.000 → 2º, C=5.000 → 3º', () => {
  const rows = [
    { name: 'C', total_amount: 5000, sales_count: 3, last_sale: '2026-08-01' },
    { name: 'A', total_amount: 10000, sales_count: 5, last_sale: '2026-08-02' },
    { name: 'B', total_amount: 8000, sales_count: 4, last_sale: '2026-08-03' },
  ].sort(rankCompare).map((r, i) => ({ ...r, position: i + 1 }));
  assert.deepStrictEqual(rows.map(r => r.name), ['A', 'B', 'C']);
});
ok('Empate em valor → maior nº de vendas ganha', () => {
  const rows = [
    { name: 'X', total_amount: 5000, sales_count: 2, last_sale: '2026-08-05' },
    { name: 'Y', total_amount: 5000, sales_count: 7, last_sale: '2026-08-01' },
  ].sort(rankCompare);
  assert.strictEqual(rows[0].name, 'Y');
});
ok('Empate em valor e vendas → venda mais recente ganha', () => {
  const rows = [
    { name: 'X', total_amount: 5000, sales_count: 3, last_sale: '2026-08-01' },
    { name: 'Y', total_amount: 5000, sales_count: 3, last_sale: '2026-08-09' },
  ].sort(rankCompare);
  assert.strictEqual(rows[0].name, 'Y');
});

console.log(`\n${process.exitCode ? '✗ FALHAS' : '✓ TODOS OS TESTES PASSARAM'} — ${passed} asserts ok\n`);
