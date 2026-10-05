const pool = require('../config/db');

// ============================================
// FINES MODEL - Multas V2
// ============================================

// CREATE - Criar nova multa
const createFine = async ({ 
  tenant_id, client_id, fine_number, plate, organ, infraction_type,
  vehicle_model, infraction_date, due_date, defense_date, stage, status,
  value, cost, paid_value, seller_id, notes
}) => {
  if (!tenant_id) {
    throw new Error('tenant_id é obrigatório para criar uma multa');
  }
  if (!client_id) {
    throw new Error('client_id é obrigatório para criar uma multa');
  }
  if (!organ) {
    throw new Error('órgão é obrigatório para criar uma multa');
  }
  
  const result = await pool.query(
    `INSERT INTO fines(
      tenant_id, client_id, fine_number, plate, organ, infraction_type,
      vehicle_model, infraction_date, due_date, defense_date, stage, status,
      value, cost, paid_value, seller_id, notes
    ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *`,
    [
      tenant_id, client_id, fine_number, plate, organ, infraction_type,
      vehicle_model, infraction_date, due_date, defense_date, 
      stage || 'cadastro', status || 'pendente',
      value || 0, cost || 0, paid_value || 0, seller_id, notes
    ]
  );
  
  return result.rows[0];
};

// READ - Listar todas as multas do tenant
const getAllFines = async (tenant_id) => {
  const result = await pool.query(
    `SELECT f.*, 
            c.name as client_name, c.cpf as client_cpf, c.phone as client_phone, c.email as client_email,
            u.name as seller_name
     FROM fines f
     LEFT JOIN clients c ON f.client_id = c.id
     LEFT JOIN users u ON f.seller_id = u.id
     WHERE f.tenant_id = $1
     ORDER BY f.created_at DESC`,
    [tenant_id]
  );
  return result.rows;
};

// READ - Listar multas com filtros
const getFinesByFilter = async (tenant_id, filters = {}) => {
  let query = `
    SELECT f.*, 
           c.name as client_name, c.cpf as client_cpf, c.phone as client_phone,
           u.name as seller_name
    FROM fines f
    LEFT JOIN clients c ON f.client_id = c.id
    LEFT JOIN users u ON f.seller_id = u.id
    WHERE f.tenant_id = $1
  `;
  
  const params = [tenant_id];
  let paramIndex = 2;
  
  if (filters.client_id) {
    query += ` AND f.client_id = $${paramIndex}`;
    params.push(filters.client_id);
    paramIndex++;
  }
  
  if (filters.status) {
    query += ` AND f.status = $${paramIndex}`;
    params.push(filters.status);
    paramIndex++;
  }
  
  if (filters.stage) {
    query += ` AND f.stage = $${paramIndex}`;
    params.push(filters.stage);
    paramIndex++;
  }
  
  if (filters.organ) {
    query += ` AND f.organ ILIKE $${paramIndex}`;
    params.push(`%${filters.organ}%`);
    paramIndex++;
  }
  
  if (filters.plate) {
    query += ` AND f.plate ILIKE $${paramIndex}`;
    params.push(`%${filters.plate}%`);
    paramIndex++;
  }
  
  if (filters.seller_id) {
    query += ` AND f.seller_id = $${paramIndex}`;
    params.push(filters.seller_id);
    paramIndex++;
  }
  
  // Filtros de data
  if (filters.due_date_from) {
    query += ` AND f.due_date >= $${paramIndex}`;
    params.push(filters.due_date_from);
    paramIndex++;
  }
  
  if (filters.due_date_to) {
    query += ` AND f.due_date <= $${paramIndex}`;
    params.push(filters.due_date_to);
    paramIndex++;
  }
  
  query += ' ORDER BY f.created_at DESC';
  
  const result = await pool.query(query, params);
  return result.rows;
};

// READ - Buscar multa por ID
const getFineById = async (id, tenant_id) => {
  const result = await pool.query(
    `SELECT f.*, 
            c.name as client_name, c.cpf as client_cpf, c.phone as client_phone, c.email as client_email,
            c.cnh as client_cnh, c.address as client_address,
            u.name as seller_name
     FROM fines f
     LEFT JOIN clients c ON f.client_id = c.id
     LEFT JOIN users u ON f.seller_id = u.id
     WHERE f.id = $1 AND f.tenant_id = $2`,
    [id, tenant_id]
  );
  return result.rows[0];
};

// READ - Buscar multas por cliente
const getFinesByClient = async (client_id, tenant_id) => {
  const result = await pool.query(
    `SELECT * FROM fines 
     WHERE client_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC`,
    [client_id, tenant_id]
  );
  return result.rows;
};

// READ - Buscar multas por vendedor
const getFinesBySeller = async (seller_id, tenant_id) => {
  const result = await pool.query(
    `SELECT * FROM fines 
     WHERE seller_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC`,
    [seller_id, tenant_id]
  );
  return result.rows;
};

// READ - Contar multas
const countFines = async (tenant_id) => {
  const result = await pool.query(
    'SELECT COUNT(*) as total FROM fines WHERE tenant_id = $1',
    [tenant_id]
  );
  return result.rows[0].total;
};

// READ - Dashboard stats - Estatísticas completas
const getDashboardStats = async (tenant_id) => {
  const result = await pool.query(
    `SELECT 
      -- Total de multas
      COUNT(*) as total_fines,
      
      -- Por status
      COUNT(CASE WHEN status = 'pendente' THEN 1 END) as pending_fines,
      COUNT(CASE WHEN status = 'aguardando_documento' THEN 1 END) as waiting_doc_fines,
      COUNT(CASE WHEN status = 'protocolado' THEN 1 END) as filed_fines,
      COUNT(CASE WHEN status = 'deferido' THEN 1 END) as granted_fines,
      COUNT(CASE WHEN status = 'indeferido' THEN 1 END) as denied_fines,
      COUNT(CASE WHEN status = 'cancelado' THEN 1 END) as canceled_fines,
      
      -- Por estágio
      COUNT(CASE WHEN stage = 'cadastro' THEN 1 END) as stage_cadastro,
      COUNT(CASE WHEN stage = 'defesa_previa' THEN 1 END) as stage_defesa_previa,
      COUNT(CASE WHEN stage = 'recurso_1' THEN 1 END) as stage_recurso_1,
      COUNT(CASE WHEN stage = 'recurso_2' THEN 1 END) as stage_recurso_2,
      COUNT(CASE WHEN stage = 'finalizado' THEN 1 END) as stage_finalizado,
      
      -- Valores
      SUM(COALESCE(value, 0)) as total_value,
      SUM(COALESCE(cost, 0)) as total_cost,
      SUM(COALESCE(paid_value, 0)) as total_paid,
      
      -- Valor por status
      SUM(CASE WHEN status = 'deferido' THEN COALESCE(paid_value, 0) END) as granted_value,
      SUM(CASE WHEN status = 'pendente' THEN COALESCE(value, 0) END) as pending_value
    FROM fines
    WHERE tenant_id = $1`,
    [tenant_id]
  );
  return result.rows[0];
};

// READ - Urgência - Multas com prazo curto
const getUrgentFines = async (tenant_id, days = 5) => {
  const result = await pool.query(
    `SELECT f.*, c.name as client_name, c.phone as client_phone
     FROM fines f
     LEFT JOIN clients c ON f.client_id = c.id
     WHERE f.tenant_id = $1 
       AND f.stage != 'finalizado'
       AND f.due_date IS NOT NULL
       AND f.due_date <= NOW() + INTERVAL '1 day' * $2
       AND f.due_date >= NOW()
     ORDER BY f.due_date ASC`,
    [tenant_id, days]
  );
  return result.rows;
};

// READ - Multas aguardando documento
const getFinesWaitingDocument = async (tenant_id) => {
  const result = await pool.query(
    `SELECT f.*, c.name as client_name, c.phone as client_phone
     FROM fines f
     LEFT JOIN clients c ON f.client_id = c.id
     WHERE f.tenant_id = $1 
       AND f.status = 'aguardando_documento'
     ORDER BY f.updated_at DESC`,
    [tenant_id]
  );
  return result.rows;
};

// READ - Multas aguardando protocolo
const getFinesWaitingProtocol = async (tenant_id) => {
  const result = await pool.query(
    `SELECT f.*, c.name as client_name
     FROM fines f
     LEFT JOIN clients c ON f.client_id = c.id
     WHERE f.tenant_id = $1 
       AND f.status = 'protocolado'
       AND f.stage IN ('defesa_previa', 'recurso_1', 'recurso_2')
     ORDER BY f.updated_at DESC`,
    [tenant_id]
  );
  return result.rows;
};

// READ - Multas vencidas
const getOverdueFines = async (tenant_id) => {
  const result = await pool.query(
    `SELECT f.*, c.name as client_name, c.phone as client_phone
     FROM fines f
     LEFT JOIN clients c ON f.client_id = c.id
     WHERE f.tenant_id = $1 
       AND f.stage != 'finalizado'
       AND f.due_date IS NOT NULL
       AND f.due_date < NOW()
     ORDER BY f.due_date ASC`,
    [tenant_id]
  );
  return result.rows;
};

// READ - Multas por órgão (para gráficos)
const getFinesGroupedByOrgan = async (tenant_id) => {
  const result = await pool.query(
    `SELECT 
      organ, 
      COUNT(*) as count, 
      SUM(COALESCE(value, 0)) as total_value,
      COUNT(CASE WHEN status = 'deferido' THEN 1 END) as granted_count
    FROM fines
    WHERE tenant_id = $1
    GROUP BY organ
    ORDER BY count DESC`,
    [tenant_id]
  );
  return result.rows;
};

// READ - Multas por vendedor
const getFinesGroupedBySeller = async (tenant_id) => {
  const result = await pool.query(
    `SELECT 
      u.name as seller_name,
      f.seller_id,
      COUNT(*) as count, 
      SUM(COALESCE(value, 0)) as total_value,
      SUM(COALESCE(paid_value, 0)) as total_paid,
      COUNT(CASE WHEN status = 'deferido' THEN 1 END) as granted_count
    FROM fines f
    LEFT JOIN users u ON f.seller_id = u.id
    WHERE f.tenant_id = $1
    GROUP BY f.seller_id, u.name
    ORDER BY count DESC`,
    [tenant_id]
  );
  return result.rows;
};

// READ - Taxa de deferimento
const getDefermentRate = async (tenant_id) => {
  const result = await pool.query(
    `SELECT 
      COUNT(CASE WHEN status = 'deferido' THEN 1 END) as granted,
      COUNT(CASE WHEN status IN ('deferido', 'indeferido') THEN 1 END) as total_decided,
      ROUND(
        COUNT(CASE WHEN status = 'deferido' THEN 1 END)::numeric / 
        NULLIF(COUNT(CASE WHEN status IN ('deferido', 'indeferido') THEN 1 END), 0) * 100, 2
      ) as rate
    FROM fines
    WHERE tenant_id = $1`,
    [tenant_id]
  );
  return result.rows[0];
};

// READ - Alertas
const getAlerts = async (tenant_id) => {
  const alerts = [];
  
  // Multas com prazo curto (< 5 dias)
  const urgent = await pool.query(
    `SELECT COUNT(*) as count FROM fines
     WHERE tenant_id = $1 
       AND stage != 'finalizado'
       AND due_date IS NOT NULL
       AND due_date <= NOW() + INTERVAL '5 days'
       AND due_date >= NOW()`,
    [tenant_id]
  );
  
  if (parseInt(urgent.rows[0].count) > 0) {
    alerts.push({
      type: 'danger',
      title: 'Multas com prazo curto',
      message: `${urgent.rows[0].count} multa(s) vencem em menos de 5 dias`,
      count: parseInt(urgent.rows[0].count)
    });
  }
  
  // Multas aguardando documento
  const waitingDoc = await pool.query(
    `SELECT COUNT(*) as count FROM fines
     WHERE tenant_id = $1 AND status = 'aguardando_documento'`,
    [tenant_id]
  );
  
  if (parseInt(waitingDoc.rows[0].count) > 0) {
    alerts.push({
      type: 'warning',
      title: 'Aguardando documento',
      message: `${waitingDoc.rows[0].count} multa(s) aguardando documento`,
      count: parseInt(waitingDoc.rows[0].count)
    });
  }
  
  // Multas vencidas
  const overdue = await pool.query(
    `SELECT COUNT(*) as count FROM fines
     WHERE tenant_id = $1 
       AND stage != 'finalizado'
       AND due_date IS NOT NULL
       AND due_date < NOW()`,
    [tenant_id]
  );
  
  if (parseInt(overdue.rows[0].count) > 0) {
    alerts.push({
      type: 'danger',
      title: 'Multas vencidas',
      message: `${overdue.rows[0].count} multa(s) com prazo vencido`,
      count: parseInt(overdue.rows[0].count)
    });
  }
  
  return alerts;
};

// READ - Fines por status
const getFinesByStatus = async (tenant_id) => {
  const result = await pool.query(
    `SELECT status, COUNT(*) as count, SUM(COALESCE(value, 0)) as total_value
     FROM fines
     WHERE tenant_id = $1
     GROUP BY status`,
    [tenant_id]
  );
  return result.rows;
};

// UPDATE - Atualizar multa
const updateFine = async (id, { 
  fine_number, plate, organ, infraction_type, vehicle_model,
  infraction_date, due_date, defense_date, stage, status,
  value, cost, paid_value, seller_id, notes
}, tenant_id) => {
  const result = await pool.query(
    `UPDATE fines 
     SET fine_number = $1, plate = $2, organ = $3, infraction_type = $4,
         vehicle_model = $5, infraction_date = $6, due_date = $7, defense_date = $8,
         stage = $9, status = $10, value = $11, cost = $12, paid_value = $13,
         seller_id = $14, notes = $15, updated_at = NOW()
     WHERE id = $16 AND tenant_id = $17 RETURNING *`,
    [
      fine_number, plate, organ, infraction_type, vehicle_model,
      infraction_date, due_date, defense_date, stage, status,
      value, cost, paid_value, seller_id, notes,
      id, tenant_id
    ]
  );
  return result.rows[0];
};

// UPDATE - Atualizar status da multa
const updateFineStatus = async (id, status, tenant_id) => {
  const result = await pool.query(
    `UPDATE fines 
     SET status = $1, updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3 RETURNING *`,
    [status, id, tenant_id]
  );
  return result.rows[0];
};

// UPDATE - Atualizar estágio da multa
const updateFineStage = async (id, stage, tenant_id) => {
  const result = await pool.query(
    `UPDATE fines 
     SET stage = $1, updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3 RETURNING *`,
    [stage, id, tenant_id]
  );
  return result.rows[0];
};

// DELETE - Deletar multa
const deleteFine = async (id, tenant_id) => {
  const result = await pool.query(
    'DELETE FROM fines WHERE id = $1 AND tenant_id = $2 RETURNING *',
    [id, tenant_id]
  );
  return result.rows[0];
};

module.exports = {
  createFine,
  getAllFines,
  getFinesByFilter,
  getFineById,
  getFinesByClient,
  getFinesBySeller,
  countFines,
  getDashboardStats,
  getUrgentFines,
  getFinesWaitingDocument,
  getFinesWaitingProtocol,
  getOverdueFines,
  getFinesGroupedByOrgan,
  getFinesGroupedBySeller,
  getDefermentRate,
  getAlerts,
  getFinesByStatus,
  updateFine,
  updateFineStatus,
  updateFineStage,
  deleteFine
};

