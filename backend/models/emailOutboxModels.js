const pool = require('../config/db');

const STATUS_MESSAGES = {
  queued: 'E-mail enfileirado',
  processing: 'E-mail em processamento',
  sent: 'E-mail aceito pelo Resend',
  delivered: 'E-mail entregue ao servidor do destinatário',
  delivery_delayed: 'Entrega do e-mail atrasada',
  bounced: 'E-mail rejeitado pelo servidor do destinatário',
  complained: 'Destinatário denunciou o e-mail como spam',
  suppressed: 'Envio bloqueado por suppression',
  failed: 'Falha no envio do e-mail',
  cancelled: 'Envio de e-mail cancelado',
};

const dbOf = (client) => client || pool;

async function findSuppression(tenantId, recipient, client) {
  const result = await dbOf(client).query(
    `SELECT id, reason FROM email_suppressions
      WHERE tenant_id = $1 AND recipient_normalized = $2 AND active = true`,
    [tenantId, String(recipient || '').trim().toLowerCase()]
  );
  return result.rows[0] || null;
}

async function insertOutbox(data, client) {
  const db = dbOf(client);
  const result = await db.query(
    `INSERT INTO email_outbox (
       tenant_id, client_id, process_id, created_by, event_type,
       recipient, recipient_name, subject, template_key, template_data,
       attachments, status, provider, idempotency_key, scheduled_at, last_error
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16)
     ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
     RETURNING *`,
    [
      data.tenant_id, data.client_id || null, data.process_id || null, data.created_by || null,
      data.event_type, data.recipient, data.recipient_name || null, data.subject, data.template_key,
      JSON.stringify(data.template_data || {}), JSON.stringify(data.attachments || []), data.status || 'queued',
      data.provider || 'resend', data.idempotency_key, data.scheduled_at || new Date(), data.last_error || null,
    ]
  );
  if (result.rowCount) return { row: result.rows[0], inserted: true };
  const existing = await db.query(
    `SELECT * FROM email_outbox WHERE tenant_id = $1 AND idempotency_key = $2`,
    [data.tenant_id, data.idempotency_key]
  );
  return { row: existing.rows[0], inserted: false };
}

async function recordEvent(outbox, status, { message, metadata, providerCreatedAt } = {}, client) {
  const db = dbOf(client);
  const eventMessage = message || STATUS_MESSAGES[status] || 'Atualização do e-mail';
  const safeMetadata = metadata && typeof metadata === 'object' ? metadata : {};
  const result = await db.query(
    `INSERT INTO email_outbox_events
       (outbox_id, tenant_id, process_id, status, message, metadata, provider_created_at)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING *`,
    [outbox.id, outbox.tenant_id, outbox.process_id || null, status, eventMessage, JSON.stringify(safeMetadata), providerCreatedAt || null]
  );
  // Mantém o Histórico geral coerente sem expor o destinatário ou o corpo do e-mail.
  await db.query(
    `INSERT INTO audit_events
       (tenant_id, user_id, action, module, entity, entity_id, entity_name,
        description, success, metadata, source)
     VALUES ($1,$2,'email_status','processos','email',$3,$4,$5,$6,$7::jsonb,'automatic')`,
    [
      outbox.tenant_id, outbox.created_by || null, outbox.process_id ? String(outbox.process_id) : String(outbox.id),
      outbox.subject, eventMessage, !['failed','bounced','complained','suppressed'].includes(status),
      JSON.stringify({ outbox_id: outbox.id, status, provider: outbox.provider }),
    ]
  );
  return result.rows[0];
}

async function claimBatch(limit = 10) {
  const result = await pool.query(
    `WITH candidates AS (
       SELECT id FROM email_outbox
        WHERE status = 'queued' AND scheduled_at <= NOW()
        ORDER BY scheduled_at ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $1
     )
     UPDATE email_outbox eo
        SET status = 'processing', processing_at = NOW(), attempts = eo.attempts + 1, updated_at = NOW()
       FROM candidates c
      WHERE eo.id = c.id
     RETURNING eo.*`,
    [Math.max(1, Math.min(Number(limit) || 10, 50))]
  );
  return result.rows;
}

async function claimById(id, tenantId = null) {
  const params = [id];
  let tenantWhere = '';
  if (tenantId) { params.push(tenantId); tenantWhere = ` AND tenant_id = $${params.length}`; }
  const result = await pool.query(
    `UPDATE email_outbox
        SET status = 'processing', processing_at = NOW(), attempts = attempts + 1, updated_at = NOW()
      WHERE id = $1${tenantWhere} AND status = 'queued' AND scheduled_at <= NOW()
      RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

async function markSent(outbox, providerEmailId) {
  const result = await pool.query(
    `UPDATE email_outbox
        SET status='sent', provider_email_id=$2, sent_at=COALESCE(sent_at,NOW()),
            processing_at=NULL, last_error=NULL, updated_at=NOW()
      WHERE id=$1 RETURNING *`,
    [outbox.id, providerEmailId]
  );
  return result.rows[0];
}

async function markRetry(outbox, errorMessage, scheduledAt) {
  const result = await pool.query(
    `UPDATE email_outbox
        SET status='queued', scheduled_at=$2, processing_at=NULL, last_error=$3, updated_at=NOW()
      WHERE id=$1 RETURNING *`,
    [outbox.id, scheduledAt, errorMessage]
  );
  return result.rows[0];
}

async function markFailed(outbox, errorMessage) {
  const result = await pool.query(
    `UPDATE email_outbox
        SET status='failed', failed_at=NOW(), processing_at=NULL, last_error=$2, updated_at=NOW()
      WHERE id=$1 RETURNING *`,
    [outbox.id, errorMessage]
  );
  return result.rows[0];
}

async function recoverStuck(minutes = 10) {
  const result = await pool.query(
    `UPDATE email_outbox
        SET status='queued', scheduled_at=NOW(), processing_at=NULL,
            last_error='Processamento interrompido; nova tentativa segura agendada.', updated_at=NOW()
      WHERE status='processing' AND processing_at < NOW() - ($1::text || ' minutes')::interval
      RETURNING id`,
    [Math.max(1, Number(minutes) || 10)]
  );
  return result.rowCount;
}

async function retry(id, tenantId) {
  const result = await pool.query(
    `UPDATE email_outbox
        SET status='queued', scheduled_at=NOW(), processing_at=NULL, failed_at=NULL,
            attempts=0, last_error=NULL, updated_at=NOW()
      WHERE id=$1 AND tenant_id=$2 AND status IN ('failed','delivery_delayed')
      RETURNING *`,
    [id, tenantId]
  );
  return result.rows[0] || null;
}

async function getById(id, tenantId = null) {
  const params = [id];
  const where = tenantId ? ' AND tenant_id=$2' : '';
  if (tenantId) params.push(tenantId);
  const result = await pool.query(`SELECT * FROM email_outbox WHERE id=$1${where}`, params);
  return result.rows[0] || null;
}

async function getDashboard(tenantId, limit = 30) {
  const [stats, recent] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('queued','processing'))::int AS queued,
         COUNT(*) FILTER (WHERE status='sent')::int AS sent,
         COUNT(*) FILTER (WHERE status='delivered')::int AS delivered,
         COUNT(*) FILTER (WHERE status='failed')::int AS failed,
         COUNT(*) FILTER (WHERE status='bounced')::int AS bounced,
         COUNT(*) FILTER (WHERE status='complained')::int AS complained,
         COUNT(*) FILTER (WHERE status='suppressed')::int AS suppressed
       FROM email_outbox WHERE tenant_id=$1`,
      [tenantId]
    ),
    pool.query(
      `SELECT id, event_type, recipient, subject, status, provider, provider_email_id,
              attempts, last_error, scheduled_at, sent_at, delivered_at, failed_at, created_at
         FROM email_outbox WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2`,
      [tenantId, Math.max(1, Math.min(Number(limit) || 30, 100))]
    ),
  ]);
  return { stats: stats.rows[0], recent: recent.rows };
}

async function listProcessEvents(tenantId, processId, limit = 50) {
  const result = await pool.query(
    `SELECT e.id, e.outbox_id, e.status, e.message, e.provider_created_at, e.created_at,
            o.subject, o.provider, o.provider_email_id
       FROM email_outbox_events e
       JOIN email_outbox o ON o.id=e.outbox_id AND o.tenant_id=e.tenant_id
      WHERE e.tenant_id=$1 AND e.process_id=$2
      ORDER BY e.created_at DESC LIMIT $3`,
    [tenantId, processId, Math.max(1, Math.min(Number(limit) || 50, 100))]
  );
  return result.rows;
}

async function applyWebhook({ svixId, eventType, providerEmailId, payloadHash, status, providerCreatedAt }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO email_webhook_events(svix_id,event_type,provider_email_id,payload_sha256)
       VALUES($1,$2,$3,$4) ON CONFLICT (svix_id) DO NOTHING RETURNING svix_id`,
      [svixId, eventType, providerEmailId || null, payloadHash]
    );
    if (!inserted.rowCount) {
      await client.query('ROLLBACK');
      return { duplicate: true, matched: false };
    }
    const found = await client.query(
      `SELECT * FROM email_outbox WHERE provider='resend' AND provider_email_id=$1 FOR UPDATE`,
      [providerEmailId]
    );
    const outbox = found.rows[0];
    if (!outbox) {
      await client.query('COMMIT');
      return { duplicate: false, matched: false };
    }
    // Webhooks podem chegar fora de ordem. Um evento antigo de "sent" ou
    // "delivery_delayed" nunca deve rebaixar um estado terminal/entregue.
    const terminal = new Set(['bounced', 'complained', 'suppressed']);
    let effectiveStatus = status;
    if (terminal.has(outbox.status)) effectiveStatus = outbox.status;
    else if (outbox.status === 'delivered' && ['sent', 'delivery_delayed'].includes(status)) effectiveStatus = 'delivered';
    const dateColumn = {
      sent: 'sent_at', delivered: 'delivered_at', failed: 'failed_at',
      bounced: 'failed_at', complained: 'failed_at', suppressed: 'failed_at',
    }[effectiveStatus];

    const assignments = [`status=$2`, `updated_at=NOW()`];
    const params = [outbox.id, effectiveStatus];
    if (dateColumn) {
      params.push(providerCreatedAt || new Date());
      assignments.push(`${dateColumn}=COALESCE(${dateColumn},$${params.length})`);
    }
    if (['bounced','complained','suppressed','failed'].includes(effectiveStatus)) {
      params.push(STATUS_MESSAGES[effectiveStatus]);
      assignments.push(`last_error=$${params.length}`);
    }
    const updated = await client.query(
      `UPDATE email_outbox SET ${assignments.join(', ')} WHERE id=$1 RETURNING *`,
      params
    );
    const next = updated.rows[0];
    if (['bounced','complained','suppressed'].includes(effectiveStatus)) {
      await client.query(
        `INSERT INTO email_suppressions
           (tenant_id,recipient_normalized,reason,provider_email_id,active)
         VALUES($1,$2,$3,$4,true)
         ON CONFLICT (tenant_id,recipient_normalized) DO UPDATE
           SET reason=EXCLUDED.reason, provider_email_id=EXCLUDED.provider_email_id,
               active=true, updated_at=NOW()`,
        [next.tenant_id, next.recipient.toLowerCase(), effectiveStatus, providerEmailId]
      );
    }
    await recordEvent(next, effectiveStatus, {
      providerCreatedAt,
      metadata: effectiveStatus === status ? {} : { received_status: status, ignored_regression: true },
    }, client);
    await client.query('COMMIT');
    return { duplicate: false, matched: true, outbox: next };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  STATUS_MESSAGES,
  findSuppression,
  insertOutbox,
  recordEvent,
  claimBatch,
  claimById,
  markSent,
  markRetry,
  markFailed,
  recoverStuck,
  retry,
  getById,
  getDashboard,
  listProcessEvents,
  applyWebhook,
};
