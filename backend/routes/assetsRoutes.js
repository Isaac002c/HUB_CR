const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  // 🔍 DEBUG - REMOVE DEPOIS
  console.log('🔍 req.db existe?', !!req.db);
  console.log('🔍 req.tenantId?', req.tenantId);
  console.log('🔍 headers x-tenant-id:', req.headers['x-tenant-id']);
  
  if (!req.db) {
    return res.status(500).json({ 
      error: 'req.db não encontrado! Middleware falhou',
      has_db: !!req.db,
      tenantId: req.tenantId 
    });
  }

  try {
    const result = await req.db.query('SELECT * FROM assets');
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    req.db.release();
  }
});

module.exports = router;
