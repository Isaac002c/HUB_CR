const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Exemplo de webhook de pagamento
router.post('/payment', async (req, res) => {
    try {
        // Recebendo dados do webhook
        const { tenant_id, status, amount, user_id } = req.body;

        if (!tenant_id || !status || !amount) {
            return res.status(400).json({ message: 'Dados incompletos' });
        }

        // Aqui você processaria o evento, por exemplo:
        // Atualizar tabela de pagamentos, enviar notificação, etc.
        await pool.query(
            'INSERT INTO payments(tenant_id, user_id, status, amount) VALUES($1, $2, $3, $4)',
            [tenant_id, user_id || null, status, amount]
        );

        console.log('Webhook recebido:', { tenant_id, status, amount, user_id });

        return res.status(200).json({ message: 'Webhook processado com sucesso!' });
    } catch (err) {
        console.error('Erro no webhook:', err);
        return res.status(500).json({ message: 'Erro interno ao processar webhook' });
    }
});

module.exports = router;
