const pool = require('../config/db');

const getAprsStats = async (req, res) => {
  try {
    const tenantId = req.tenantId;

    if (!tenantId) {
      return res.status(401).json({
        success: false,
        error: 'Tenant não identificado.',
      });
    }

    const query = `
      SELECT 
        ct.status, 
        COUNT(DISTINCT c.id)::int AS count
      FROM clients c
      JOIN services s ON s.client_id = c.id
      JOIN contracts ct ON ct.service_id = s.id
      WHERE c.tenant_id = $1
        AND UPPER(TRIM(ct.status)) IN (
          'APRS DEFESA PRÉVIA',
          'DEFESA PRÉVIA - ANÁLISE',
          'APRS 1 INSTÂNCIA',
          'APRS 1ª INSTÂNCIA',
          'APRS 1 INSTANCIA',
          '1 INSTÂNCIA - ANÁLISE',
          'APRS 2 INSTÂNCIA',
          '2 INSTÂNCIA -ANÁLISE'
        )
      GROUP BY ct.status
      HAVING COUNT(DISTINCT c.id) > 0
      ORDER BY count DESC
    `;

    const { rows } = await pool.query(query, [tenantId]);

    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error('[Dashboard] Erro ao buscar estatísticas de APRs:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro interno ao carregar os dados do gráfico.',
    });
  }
};

module.exports = {
  getAprsStats,
};