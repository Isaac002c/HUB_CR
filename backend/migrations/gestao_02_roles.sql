-- ============================================================================
-- Migration: Evolução da matriz de perfis (DATA CHANGE — consciente)
-- ----------------------------------------------------------------------------
-- Nova matriz operacional do TENANT:
--   master     → nível máximo DENTRO da operação do tenant (era "admin")
--   admin      → administrativo restrito (sem Financeiro/Leads/Tarefas/Histórico)
--   supervisor → escopo de equipe
--   seller     → CONSULTOR (escopo do que criou)
--
-- PRESERVA o super_admin (administração global da instalação) — NÃO tocar.
--
-- Por que admin → master:
--   Hoje o 1º usuário do tenant nasce 'admin' e representa o DONO da operação
--   (acesso total). Na nova matriz esse acesso total chama-se MASTER. Se
--   deixássemos como 'admin', o dono perderia Financeiro/Leads/Tarefas/Histórico.
--   Portanto, promovemos os 'admin' atuais para 'master' — ninguém perde acesso.
--
-- Idempotente: reexecutar não causa efeito adverso.
-- ============================================================================

-- 1) Donos de tenant atuais (admin) → master. super_admin permanece intacto.
UPDATE users
   SET role = 'master'
 WHERE role = 'admin';

-- 2) Normaliza role vazio/nulo para 'seller' (consultor) — menor privilégio.
UPDATE users
   SET role = 'seller'
 WHERE role IS NULL OR TRIM(role) = '';

-- 3) (Opcional/legado) Perfis antigos manager/operator/viewer NÃO são apagados.
--    A matriz de permissões no backend os trata de forma conservadora.
--    Descomente para consolidá-los explicitamente, se desejar:
--    UPDATE users SET role = 'admin'  WHERE role = 'manager';
--    UPDATE users SET role = 'seller' WHERE role IN ('operator','viewer');

-- Conferência (executar manualmente se quiser inspecionar):
-- SELECT role, COUNT(*) FROM users GROUP BY role ORDER BY 2 DESC;
