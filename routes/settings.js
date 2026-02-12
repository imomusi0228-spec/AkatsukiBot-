const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('./auth');

// Get all settings
router.get('/', authMiddleware, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM bot_system_settings');
        const settings = {};
        result.rows.forEach(row => {
            settings[row.key] = row.value;
        });
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const { sendWebhookNotification } = require('../services/notificationService');

// Update or set a setting
router.post('/', authMiddleware, async (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Key is required' });

    try {
        await db.query(`
            INSERT INTO bot_system_settings (key, value, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET
                value = EXCLUDED.value,
                updated_at = CURRENT_TIMESTAMP
        `, [key, value]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Test webhook
router.post('/test-webhook', authMiddleware, async (req, res) => {
    try {
        const result = await sendWebhookNotification({
            title: 'Webhook Test',
            description: '管理コンソールからのテスト送信だよ。これが見えていれば、設定はバッチリだ。',
            color: 0x7aa2f7,
            fields: [
                { name: 'Status', value: 'Success ✅', inline: true },
                { name: 'Timestamp', value: new Date().toLocaleString(), inline: true }
            ]
        });
        res.json(result); // result includes { success, error }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
