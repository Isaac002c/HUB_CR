# Módulo GESTÃO + Nova Matriz de Permissões (RBAC) + Ajustes de Prazos

> Evolução do Despachantes/CR Recursos CRM. Documento único cobrindo o que foi
> criado, como funciona e como aplicar em produção. As estruturas de dados existentes
> foram preservadas; os refinamentos de interface e permissão seguem multi-tenant.

## Stack (real, confirmada no código)

- **Frontend:** Next.js 16 (App Router) — SPA por abas em `/dashboard?module=…&tab=…`.
- **Backend:** Node.js + Express + PostgreSQL (`pg`, Neon). Proxy do Next (`next.config.js`) encaminha `/api/*` e `/auth/*`.
- **Auth:** JWT (`{ userId, tenantId, email, role }`). Isolamento por `WHERE tenant_id = $1` em todos os models.

---

## 1. Módulo GESTÃO

Novo módulo comercial/gerencial. Abas (subrotas do SPA em `?module=gestao&tab=…`):

| Aba | Arquivo | Descrição |
|---|---|---|
| Visão Geral (`visaogeral`) | `app/gestao/VisaoGeral.jsx` | KPIs do mês, comparação MoM, pódio TOP 3, gráfico mês a mês, classificação. |
| Colaboradores (`colaboradores`) | `app/gestao/Colaboradores.jsx` | Base cadastral, remuneração, meta individual e gestão de equipe/status, sem KPIs duplicados nem pódio. |
| Equipes (`equipes`) | `app/gestao/Equipes.jsx` | CRUD de equipes + meta mensal editável pelo Master + fechamento mensal + comparação MoM + ranking. |
| Vendas (`vendas`) | `app/gestao/Vendas.jsx` | CRUD de vendas com cálculo automático de comissão (snapshot). |
| Comissões (`comissoes`) | `app/gestao/Comissoes.jsx` | Comissão por vendedor no período. |
| Financeiro da Equipe (`finequipe`) | `app/gestao/FinanceiroEquipe.jsx` | Tela inicial do **supervisor** (substitui o Dashboard). |

Componentes reutilizados: `Podium.jsx` (pódio/palanque TOP 3), `MiniBarChart.jsx`
(gráfico mês a mês em SVG), `PeriodFilter.jsx` (mês/ano/equipe/vendedor).
Identidade visual mantida (classes `.kpi-card`, `.data-table`, `.btn-*`, `.modal-*`).

---

## 2. Colaboradores (relacionamento, sem duplicar `users`)

O colaborador **é** o usuário. Em vez de uma tabela paralela, estendemos `users`
(migration `gestao_01_module.sql`):

`team_id`, `supervisor_id`, `commission_percentage`, `hire_date`, `position`,
`avatar`, `is_active`.

A tela de Colaboradores mantém a base detalhada por pessoa: cadastro, vínculo,
remuneração, meta individual, total vendido e comissão. Os cartões de custo de
pessoas e o pódio foram retirados dessa tela porque o desempenho já é apresentado
no quadro de Equipes. O endpoint continua agregando os dados em uma consulta, sem N+1.

---

## 3. Vendas (fonte única de verdade)

Tabela nova **`sales`** (`gestao_01_module.sql`) — a venda concluída:

`id, tenant_id, seller_id→users, team_id→teams, client_id, company_id, lead_id,
fine_id (processo de origem), amount, commission_percentage (snapshot),
commission_amount, status, closed_at (data real), source, created_by`.

- `fine_id` é **UNIQUE** → impede contar a mesma venda duas vezes (ex.: Lead
  Fechado que também vira Cliente Fechado).
- Dinheiro em **NUMERIC** (nunca float). Frontend formata pt-BR/BRL (`formatBRL`).
- `closed_at` (DATE) é a base do fechamento mensal (não `created_at`).

### Backfill (decisão: "puxar tudo que já existe da CR Recursos")
`gestao_03_backfill_sales.sql`: cria 1 venda por processo (`fines`) com valor > 0,
`amount = COALESCE(paid_value, value)`, `seller_id = fines.seller_id`,
`closed_at = fines.created_at`, `%` = comissão vigente do vendedor (snapshot).
Idempotente (via `uq_sales_fine`). Rollback: `DELETE FROM sales WHERE source='backfill_fine'`.

---

## 4. Comissão (automática, com snapshot)

`commission_amount = commissionable_amount * commission_percentage / 100`
(arredondado a 2 casas). Vendas históricas anteriores ao quadro preservam a base
original e não são recalculadas.

Desde 17/08/2026, a política vigente é global e fixa: **10% somente sobre o valor
mensal que exceder R$ 7.500**. Percentuais individuais e faixas progressivas não
podem mais ser cadastrados. O percentual e a base usados continuam gravados na
própria venda (snapshot), portanto uma eventual mudança futura de política não altera
vendas históricas. Implementado em `backend/config/commissionPolicy.js` e
`managementModels.computeCommission` + `createSale`/`updateSale`.

### Quadro mensal de vendas da CR

A aba **Gestão → Vendas** reutiliza a tabela `sales` e apresenta uma visão
**Geral do mês** para Master/Supervisor, além de abas automáticas por consultor.
O Supervisor continua limitado à própria equipe e o Consultor ao próprio ID.

Cada venda manual guarda data, cliente, serviço, valor pago, parcela atual/total,
forma de pagamento, forma de fechamento e consultor. Cliente e serviço são
snapshots: o histórico não muda se os cadastros de origem forem alterados.

Cada colaborador possui `monthly_sales_target` (padrão R$ 10.000). O gatilho global
é fixo em R$ 7.500. O saldo exibido é
`MAX(meta_mensal - vendido_no_mês, 0)`.

A visão **Geral do mês** usa a meta mensal da equipe, que é cadastrada pelo Master
para cada mês. Essa meta coletiva não altera a meta individual de R$ 10.000. Se ainda
não houver lançamento para a equipe/período, a interface mostra “meta não definida”.

A comissão fica zerada antes do gatilho. Na venda que o ultrapassa, somente o
excedente é comissionado. Exemplo: acumulado de R$ 7.000 + venda de R$ 1.000
gera base comissionável de R$ 500; a 10%, a comissão é R$ 50. A venda persiste
`commissionable_amount`, `commission_trigger_amount`, percentual e comissão como
snapshots auditáveis.

Dentro do sistema, o quadro funciona como uma central gerencial: KPIs de faturamento,
meta, saldo e comissão; progresso por consultor; busca; filtros de pagamento e
fechamento; e edição dos lançamentos. A exportação preserva a apresentação de
planilha solicitada, com a aba `FATURAMENTO` e uma aba automática para cada consultor,
linhas reservadas, filtros, fórmulas, total, meta e saldo para a meta.

---

## 5. Equipes

Tabela **`teams`** (`id, tenant_id, name, supervisor_id→users, active`). Preparado
para **múltiplas equipes/vendedores/supervisores** (sem hardcode de equipe única).
Vendedor e supervisor se associam via `users.team_id` / `teams.supervisor_id`.

### Meta mensal da equipe
A tabela `team_monthly_targets` armazena uma meta por `tenant + equipe + mês`.
Somente o **Master** pode alterá-la na tela Equipes; Administrativo e Supervisor
recebem apenas leitura. A meta coletiva alimenta o consolidado do quadro de vendas
e a aba `FATURAMENTO` da exportação, enquanto as abas de consultor usam a meta individual.

### Fechamento mensal (`GET /api/management/team/:id`)
Retorna: total vendido, nº de vendas, vendedores ativos, ticket médio, comissão
total, ranking do período, **comparação mês atual × anterior** (valor, diferença
absoluta e %), e histórico **mês a mês** (12 meses).

> Segurança: supervisor só acessa a **própria** equipe. `GET /api/management/team/OUTRA_EQUIPE` → **403**.

---

## 6. Nova Matriz de Permissões

Perfis operacionais do tenant: **master, admin, supervisor, seller (consultor)**.
`super_admin` (administração SaaS da plataforma) **preservado**.

> Migração: os `admin` atuais (donos do tenant) foram promovidos a **master**
> (mantêm acesso total). O novo `admin` é o perfil restrito. Ver `gestao_02_roles.sql`.

Fonte única da matriz: `backend/config/accessControl.js` (backend) e espelho em
`app/lib/access.js` (frontend). Níveis: `full` (tenant) / `team` (equipe) / `own`
(dono) / `none` (403 + item some do menu).

| Módulo | MASTER | ADM | SUPERVISOR | CONSULTOR |
|---|---|---|---|---|
| Gestão | full | full | team | own |
| Financeiro | full | **none** | team | **none** |
| Dashboard | full | full | **none** | **none** |
| Clientes | full | full | team | own |
| Empresas | full | full | team | own |
| Leads | full | **none** | team | own |
| Tarefas | full | **none** | team | own |
| Deferidos | full | full | full | **full (exceção)** |
| Prazos | full | full | **none** | own |
| Agenda | full | full | full | **full (exceção)** |
| Histórico | full | **none** | **none** | **none** |
| Aprovações | full | full | team | own |
| Configurações | full | full | own | own |

### Aplicação (backend é a fonte de verdade — não confiar na sidebar)
- `middlewares/authorize.js`: `userContext` (carrega role/equipe/ativo do **banco**,
  autoritativo mesmo com JWT antigo), `requireModule(nome)` (403), `requireRole(...)`,
  `scopeFor(req, modulo)`.
- ADM em `/api/finance`, `/api/leads`, `/api/multas-leads` (Tarefas) ou `/api/activity`
  (Histórico) → **403**.
- Consultor em `/api/leads/:idDeOutro` ou `/api/companies/:idDeOutra` → **403**.
- Supervisor em `/api/management/team/OUTRA` → **403**.

### 6.1 SUPERVISOR
Vinculado a uma equipe. **Sem** Dashboard tradicional, Prazos e Histórico. No lugar
do Dashboard: **Financeiro da Equipe** (só dados da própria equipe; o backend força
`team_id`). No menu Gestão, vê apenas **Financeiro da Equipe, Colaboradores e Vendas**;
as abas duplicadas **Equipes** e **Financeiro/Comissões** foram removidas, inclusive
com bloqueio do acesso direto pela URL. O resumo do supervisor contém somente total
vendido, contratos novos e ticket médio. Escopo de equipe em Clientes/Empresas/Leads/Tarefas.

### 6.2 CONSULTOR (seller) — ownership
Só vê **o que criou** (`created_by = usuário`, ou `fines.seller_id` para processos).
Colunas `created_by` adicionadas a `clients`, `companies`, `multas_leads`, `leads`
(`gestao_04_ownership.sql`) com backfill best-effort. **Exceções globais**: Deferidos
(todos veem tudo) e Agenda (todos visualizam) — sem filtro `created_by` na leitura.

### 6.3 Andamentos de processo por perfil

- Consultor cadastra somente `APRS DEFESA PREVIA`, `APRS 1 INSTANCIA` e
  `APRS 2 INSTANCIA`.
- Master, Administrativo e Supervisor mantêm o fluxo completo de análise e resultado.
- `MANDATORIA`, `EXCESSO DE PONTOS` e `PROTOCOLADO` não pertencem ao seletor de
  andamento e são recusados pelo backend. Mandatória e Excesso de Pontos continuam
  disponíveis no campo próprio **Tipo de suspensão**.
- A regra é aplicada no frontend e, de forma autoritativa, em
  `backend/config/processStages.js` nas operações de criação e edição.

---

## 7. Ajustes em PRAZOS

- **Empresa agora redireciona** para o serviço correto (`app/multas/Calendario.jsx`,
  `openItem`): Cliente → `/multas/clients/:id`; Empresa c/ veículo →
  `/multas/companies/:id/vehicles/:vid`; Empresa s/ veículo → `/multas/companies/:id`.
  O backend passou a devolver `company_id`, `vehicle_id`, `service_id` e
  `real_infractor_type` no endpoint de prazos.
- **Cores unificadas**: `getPrazoStyle` centralizado em `lib/processConstants.js`
  (vencido=vermelho, ≤7d=âmbar, saudável=verde, sem data=cinza). Removida a
  duplicação em `clients/[id]`. Empresas passam a usar o **mesmo** jogo de cores
  (antes o estado saudável era cinza-escuro, dando impressão de "só vermelho").
- **Real Infrator (destaque + filtro)**: os cartões redundantes de total, cliente e
  empresa foram removidos. O filtro destacado **Real Infrator** fica ao lado das
  faixas de urgência e a busca continua aceitando nome, auto ou placa.
  Somente processos do serviço `TRI` recebem `real_infractor_type` e o destaque;
  processos comuns de cliente/empresa não são classificados por inferência.
- O cadastro de TRI exige **Auto de Infração, placa e Nome do Real Infrator** tanto
  no frontend quanto no backend. O nome é persistido em `fines.real_infractor_name`
  e se torna o título do item em Prazos, mantendo o cadastro de origem identificado.

---

## 8. Migrations (seguras, idempotentes)

Ordem (referenciada em `backend/migrations/run_all_pending.sql`):

1. `gestao_01_module.sql` — `teams`, colunas de `users`, `sales`, índices. **DDL, seguro.**
2. `gestao_02_roles.sql` — `admin → master` (super_admin intacto). **DATA.**
3. `gestao_03_backfill_sales.sql` — vendas a partir dos processos. **DATA.**
4. `gestao_04_ownership.sql` — `created_by` em clients/companies/multas_leads/leads + backfill. **DDL+DATA.**
5. `gestao_08_sales_board.sql` — metas, gatilho e campos do quadro mensal. **DDL+DATA idempotente.**
6. `gestao_09_tri_real_infractor.sql` — nome do real infrator e índice parcial de prazos TRI. **DDL idempotente.**
7. `gestao_10_fixed_commission_policy.sql` — normaliza usuários para 10% e gatilho R$ 7.500 sem alterar snapshots de vendas. **DDL+DATA idempotente.**
8. `gestao_11_team_monthly_targets.sql` — meta coletiva por equipe/mês, com auditoria e unicidade por período. **DDL idempotente.**
9. `gestao_12_deferred_images.sql` — URL e data de atualização da imagem exclusiva de cada deferido. **DDL idempotente.**

Índices criados: `sales(tenant_id, closed_at)`, `sales(tenant_id, seller_id, closed_at)`,
`sales(tenant_id, team_id, closed_at)`, `fines(tenant_id, seller_id)`,
`fines(tenant_id, service_type_id, due_date)` para TRI, `teams(tenant_id)`,
`users(team_id)`, `*_created_by`. Nada é destrutivo
(`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). Reexecutável.

### Como aplicar
```bash
# 1) BACKUP do banco antes de tudo
pg_dump "$DATABASE_URL" > backup_antes_gestao.sql
# 2) Rodar as migrations (psql conectado ao Neon), na ordem:
psql "$DATABASE_URL" -f backend/migrations/gestao_01_module.sql
psql "$DATABASE_URL" -f backend/migrations/gestao_02_roles.sql
psql "$DATABASE_URL" -f backend/migrations/gestao_03_backfill_sales.sql
psql "$DATABASE_URL" -f backend/migrations/gestao_04_ownership.sql
psql "$DATABASE_URL" -f backend/migrations/gestao_08_sales_board.sql
psql "$DATABASE_URL" -f backend/migrations/gestao_09_tri_real_infractor.sql
psql "$DATABASE_URL" -f backend/migrations/gestao_10_fixed_commission_policy.sql
psql "$DATABASE_URL" -f backend/migrations/gestao_11_team_monthly_targets.sql
psql "$DATABASE_URL" -f backend/migrations/gestao_12_deferred_images.sql
```

---

## 9. Endpoints novos (`/api/management`, `/api/me`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/me/access` | Matriz de acesso do usuário (role, teamId, módulos). |
| GET | `/api/management/overview?month&year` | KPIs + MoM + mensal + ranking (escopado). |
| GET | `/api/management/ranking?month&year&team_id&seller_id` | Ranking/pódio. |
| GET | `/api/management/monthly-evolution?months` | Evolução mês a mês. |
| GET/POST/PUT/DELETE | `/api/management/teams[/:id]` | CRUD de equipes (master/admin). |
| GET | `/api/management/team/:id?month&year` | Fechamento da equipe (supervisor = própria). |
| GET | `/api/management/team-targets?month&year&team_id` | Metas coletivas do período, respeitando o escopo. |
| PUT | `/api/management/teams/:id/target` | Define a meta coletiva do mês (somente Master). |
| GET | `/api/management/collaborators` | Colaboradores + agregados. |
| PUT | `/api/management/collaborators/:id` | Meta/equipe/supervisor/status (master/admin); comissão é fixa. |
| GET/POST/PUT/DELETE | `/api/management/sales[/:id]` | CRUD de vendas (comissão automática). |
| GET | `/api/management/sales/export?month&year&seller_id` | Exporta o quadro mensal em XLSX, respeitando o escopo do perfil. |
| PATCH | `/api/contracts/:id/deferred-image` | Associa imagem enviada ao processo deferido (Master/ADM/Supervisor). |

Prazos: `GET /api/contracts/deadlines?days&real_infractor=client|company` (agora com
guard de módulo `prazos` + escopo do consultor).

---

## 10. Auditoria

Reutiliza `services/activityLogService` (tabela `activity_logs`). São logadas:
criação/edição de venda, cancelamento de venda, mudança de meta individual/coletiva, mudança de
equipe/supervisor e CRUD de equipe. Histórico (`/api/activity`) é **master-only**.

---

## 11. Testes

Rodar tudo: `cd backend && npm test` (deps de teste: `@electric-sql/pglite*`, em devDependencies).

### 11.1 Unitário — `backend/tests/rbac.test.js` (22 asserts ✓)
- Matriz: MASTER tudo; ADM sem Financeiro/Leads/Tarefas/Histórico; SUPERVISOR sem
  Dashboard/Prazos/Histórico (escopo equipe); CONSULTOR próprio + Deferidos/Agenda
  globais; super_admin preservado.
- Comissão: política fixa de 10% acima de R$ 7.500 e snapshot sem recálculo histórico.
- Ranking: A(10k)→1º, B(8k)→2º, C(5k)→3º; desempates por nº de vendas e recência.
- Andamentos: consultor limitado aos três APRs; perfis gerenciais com fluxo completo;
  etapas retiradas recusadas.

### 11.2 Workbook — `backend/tests/workbook.test.js` (21 checks ✓)
- Estrutura `FATURAMENTO` + abas por consultor, nomes seguros e sem duplicidade.
- Dados, formatos monetários/percentuais, cores, metas e fórmulas de total/saldo.

### 11.3 Integração END-TO-END — `backend/tests/integration.test.js` (75 checks ✓)
Sobe um **Postgres real** (PGlite/WASM, in-process — funciona mesmo em shell admin),
cria o schema base, roda as **migrations reais** (01 + 04 + backfill 03), popula 2
tenants/4 perfis/equipes/processos, **sobe o Express** e bate nos endpoints com JWT
de cada perfil. Cobre (tudo verde):
- `me/access` correto para master/admin/supervisor/seller.
- ADM → `/api/leads`, `/api/multas-leads`, `/api/activity` = **403**; `/api/clients` = 200; master → `/api/activity` = 200.
- CONSULTOR: vê só os próprios leads/clientes; `/api/leads/:deOutro` e `/api/clients/:deOutro` = **403**.
- Deferidos: todos os perfis veem **todos** (2/2). Agenda: seller e admin veem (200).
- Imagem de deferido: Master/ADM/Supervisor podem associar; Consultor recebe **403**;
  a imagem só pode ser ligada a processo realmente deferido e permanece global em leitura.
- Prazos: supervisor = **403**; master = todos; seller = só os próprios; payload traz
  `real_infractor_type` apenas para TRI, nome do real infrator e `company_id` (redirect);
  filtro `real_infractor=company` funciona.
- Processos: consultor não grava andamento fora dos APRs; Supervisor mantém o fluxo
  completo; TRI incompleto é recusado e TRI completo persiste responsável e nome.
- Gestão: overview total = 23.000; comissões = 1.550 (750+800); ranking 1º João(15k)/2º Maria(8k);
  supervisor = só a equipe; seller = só o próprio; `team/OUTRA` = **403**.
- Meta coletiva: Master grava a meta mensal; Supervisor lê somente a própria equipe;
  a exportação usa R$ 50.000 no consolidado e preserva R$ 10.000 nas abas individuais.
- Comissão fixa: tentativas de cadastrar percentuais/faixas são normalizadas ou recusadas;
  snapshots históricos permanecem inalterados e novas vendas usam 10% sobre o excedente.
- Consultor cria venda: `seller_id` forjado é ignorado (atribuída a ele).
- Multi-tenant: T2 não enxerga T1 e vice-versa; cliente de T1 por ID p/ T2 = 404.

---

## 12. Build & qualidade (nesta entrega)

- ✅ `npm run build` (frontend Next.js) — compilado com sucesso (10 páginas).
- ✅ `npm run lint` + type-check do Next — sem erros.
- ✅ `node --check` nos arquivos alterados do backend — todos OK.
- ✅ `npm test` — **22 asserts RBAC + 21 checks XLSX + 75 checks de integração**.
- ✅ Smoke de produção sem gravação: API saudável, 582 prazos lidos, 1 TRI destacado,
  0 falsos destaques; andamento retirado, TRI incompleto e andamento gerencial de
  consultor recusados antes do INSERT.
- ✅ Validação visual local com o perfil Supervisor: menu reduzido, três KPIs,
  Colaboradores sem pódio/custos, Vendas sem comissão consolidada e Deferidos sem
  “Abrir processo”; console sem erros ou avisos.
- ✅ Smoke em produção: metas e deferidos respondem HTTP 200; 52 deferidos retornam
  os campos de imagem; banco permanece com 0 vendas após o deploy.

---

## 13. Deploy desta entrega

- Backup íntegro desta publicação: `/opt/cr-recursos/backups/ui-refinement-20260817-204833`
  (`app.tar.gz`, `database.dump` e `SHA256SUMS`).
- Backend publicado na VPS e saudável em `https://api-hub.crrecursos.com.br`.
- Migrations `gestao_11_team_monthly_targets.sql` e `gestao_12_deferred_images.sql`
  registradas em `schema_migrations`.
- Frontend publicado no projeto Vercel `cr-recursos-sistema` e associado a
  `https://hub.crrecursos.com.br`.
- Deploy Vercel: `dpl_7JGDiZCbauAdiR5iz1M5g1kwwJDG`.
- API, login e dashboard público respondendo HTTP 200; tabela de metas e colunas de
  imagem confirmadas; contagem de vendas preservada em zero.
