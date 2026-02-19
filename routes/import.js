const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('./middleware');

// POST /api/import/booth
router.post('/booth', authMiddleware, async (req, res) => {
    const { data } = req.body; // Expecting array of objects from CSV
    if (!data || !Array.isArray(data)) {
        return res.status(400).json({ error: 'Invalid data format' });
    }

    let successCount = 0;
    let skipCount = 0;

    for (const item of data) {
        // BOOTH CSV columns: 注文番号 (Order ID), 商品名 (Product Name), etc.
        // Let's assume the user map the columns in the frontend
        const orderId = item.order_id || item['注文番号'];
        const tier = item.tier || 'Pro'; // Default or mapped
        const duration = parseInt(item.duration || 1); // Months

        if (!orderId) {
            skipCount++;
            continue;
        }

        try {
            await db.query(
                'INSERT INTO license_keys (key_id, tier, duration_months, notes) VALUES ($1, $2, $3, $4) ON CONFLICT (key_id) DO NOTHING',
                [orderId.toString().trim(), tier, duration, 'Imported from BOOTH CSV']
            );
            successCount++;
        } catch (err) {
            console.error(`[Import] Failed to import ${orderId}:`, err.message);
            skipCount++;
        }
    }

    res.json({ success: true, imported: successCount, skipped: skipCount });
});

module.exports = router;
