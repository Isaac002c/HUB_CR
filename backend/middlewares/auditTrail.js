const { createAuditEvent } = require('../models/auditModels');

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_KEY = /(password|senha|token|secret|authorization|cookie|credential|api[_-]?key)/i;

const ENTITY_LABELS = {
  approval: 'aprovação', calendar_event: 'evento', client: 'cliente', collaborator: 'colaborador',
  collaborator_cost: 'custo de colaborador', commission_tier: 'faixa de comissão', company: 'empresa',
  contract: 'contrato', document: 'documento', fine: 'processo', forecast: 'previsão',
  lead: 'lead', protocol: 'protocolo', sale: 'venda', seller: 'vendedor', service: 'serviço',
  target: 'meta', task: 'tarefa', team: 'equipe', upload: 'arquivo', user: 'usuário', vehicle: 'veículo',
};

function sanitize(value, key = '', depth = 0) {
  if (SENSITIVE_KEY.test(key)) return '[PROTEGIDO]';
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (depth >= 4) return '[CONTEÚDO ANINHADO]';
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitize(item, key, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 60).map(([childKey, childValue]) => [childKey, sanitize(childValue, childKey, depth + 1)]));
  }
  return String(value);
}

function routeContext(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  const root = segments[1] || 'sistema';
  let module = 'sistema';
  let entity = root.replace(/s$/, '') || 'sistema';

  if (root === 'management') {
    module = 'gestao';
    const resource = segments[2] || 'gestao';
    if (resource === 'sales') entity = 'sale';
    else if (resource === 'teams' || resource === 'team') entity = 'team';
    else if (resource === 'collaborator-costs') entity = 'collaborator_cost';
    else if (resource === 'commission-tiers' || segments.includes('commission-tiers')) entity = 'commission_tier';
    else if (resource === 'collaborators') entity = 'collaborator';
    else entity = resource.replace(/s$/, '');
  } else if (root === 'clients') { module = 'clientes'; entity = 'client';
  } else if (root === 'companies') {
    module = 'empresas';
    entity = segments.includes('vehicles') ? 'vehicle' : (segments.includes('fines') ? 'fine' : 'company');
  } else if (root === 'leads') { module = 'leads'; entity = 'lead';
  } else if (root === 'multas-leads') { module = 'tarefas'; entity = 'task';
  } else if (root === 'calendar-events') { module = 'agenda'; entity = 'calendar_event';
  } else if (root === 'approvals') { module = 'aprovacoes'; entity = 'approval';
  } else if (root === 'fines') { module = 'processos'; entity = 'fine';
  } else if (root === 'contracts') { module = 'processos'; entity = 'contract';
  } else if (root === 'documents') { module = 'documentos'; entity = 'document';
  } else if (root === 'fine-protocols') { module = 'processos'; entity = 'protocol';
  } else if (root === 'users') { module = 'usuarios'; entity = 'user';
  } else if (root === 'targets') { module = 'metas'; entity = 'target';
  } else if (root === 'sellers') { module = 'usuarios'; entity = 'seller';
  } else if (root === 'services') { module = 'configuracoes'; entity = 'service';
  } else if (root === 'forecast') { module = 'leads'; entity = 'forecast';
  } else if (root === 'upload') { module = 'documentos'; entity = 'upload'; }

  const uuids = segments.filter((segment) => /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment));
  return { module, entity, entityId: uuids.at(-1) || null };
}

function actionFor(method, pathname) {
  if (/\/approve$/.test(pathname)) return 'approve';
  if (/\/reject$/.test(pathname)) return 'reject';
  if (/\/send-email$/.test(pathname)) return 'send_email';
  if (/\/archive(?:-old)?$/.test(pathname)) return 'archive';
  if (/\/complete$/.test(pathname)) return 'complete';
  if (/\/reset(?:-password)?$/.test(pathname)) return 'reset';
  if (/\/password$/.test(pathname)) return 'password_change';
  if (/\/status$/.test(pathname)) return 'status_change';
  if (/\/stage$/.test(pathname)) return 'stage_change';
  if (/\/protocol$/.test(pathname)) return 'protocol_update';
  if (/\/link$/.test(pathname)) return 'link';
  if (method === 'DELETE') return 'delete';
  if (method === 'POST') return 'create';
  return 'update';
}

function entityName(body, response) {
  const data = response?.data || {};
  return data.name || data.title || data.razao_social || data.description || data.email || data.fine_number
    || body?.name || body?.title || body?.razao_social || body?.description || body?.email || body?.fine_number || null;
}

function descriptionFor(action, entity, success, statusCode) {
  const verbs = {
    create: 'Criou', update: 'Atualizou', delete: 'Excluiu', approve: 'Aprovou', reject: 'Rejeitou',
    send_email: 'Enviou e-mail de', archive: 'Arquivou', complete: 'Concluiu', reset: 'Redefiniu',
    password_change: 'Alterou a senha de', status_change: 'Alterou o status de',
    stage_change: 'Alterou a etapa de', protocol_update: 'Atualizou o protocolo de', link: 'Vinculou',
  };
  const phrase = `${verbs[action] || 'Executou ação em'} ${ENTITY_LABELS[entity] || entity}`;
  return success ? phrase : `Tentativa falhou: ${phrase.toLowerCase()} (HTTP ${statusCode})`;
}

function auditTrail(req, res, next) {
  if (!MUTATION_METHODS.has(req.method) || !req.tenantId || !req.userId) return next();
  const startedAt = Date.now();
  const pathname = req.originalUrl.split('?')[0];
  const context = routeContext(pathname);
  const action = actionFor(req.method, pathname);
  const requestBody = sanitize(req.body || {});
  const query = sanitize(req.query || {});
  let responseBody = null;
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    responseBody = body;
    return originalJson(body);
  };

  res.once('finish', () => {
    const success = res.statusCode >= 200 && res.statusCode < 400;
    const responseData = responseBody?.data || {};
    const event = {
      tenant_id: req.tenantId,
      user_id: req.userId,
      action,
      module: context.module,
      entity: context.entity,
      entity_id: responseData.id || context.entityId,
      entity_name: entityName(req.body, responseBody),
      description: descriptionFor(action, context.entity, success, res.statusCode),
      method: req.method,
      path: pathname,
      status_code: res.statusCode,
      success,
      ip_address: String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim().slice(0, 80) || null,
      user_agent: String(req.headers['user-agent'] || '').slice(0, 500) || null,
      metadata: {
        request: requestBody,
        query,
        role: req.userRole || null,
        duration_ms: Date.now() - startedAt,
        ...(responseBody?.error || responseBody?.message ? { response: sanitize({ error: responseBody.error, message: responseBody.message }) } : {}),
      },
    };
    createAuditEvent(event).catch((error) => console.error('[auditTrail]', error.message));
  });
  next();
}

module.exports = { auditTrail, sanitize, routeContext, actionFor };
