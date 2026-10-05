const express = require('express');
const router = express.Router();
const { getAprsStats } = require('../controllers/dashboardController');
const { checkPermission } = require('../middlewares/checkPermission');

// Usando 'contracts:read' baseado nas roles do seu checkPermission.js 
// para que a equipe possa visualizar o gráfico.
router.get('/aprs-stats', checkPermission('contracts:read'), getAprsStats);

module.exports = router;