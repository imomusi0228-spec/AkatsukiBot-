const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('./middleware');

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

const { sendWebhookNotification } = require('../services/notif');

// Update or set a setting
router.post('/', authMiddleware, async (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Key is required' });

    // Prevent saving null/undefined which might wipe settings unintentionally
    if (value === undefined || value === null) {
        return res.status(400).json({ error: 'Value is required' });
    }

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
        const dashboardUrl = `${process.env.PUBLIC_URL || ''}/#settings`;
        const result = await sendWebhookNotification({
            title: 'Webhook Test',
            description: `管理コンソールからのテスト送信だよ。これが見えていれば、設定はバッチリだ。\n\n[**管理画面に戻る**](${dashboardUrl})`,
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

// GET /api/settings/roles
router.get('/roles', authMiddleware, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM tier_role_mappings');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/settings/roles
router.post('/roles', authMiddleware, async (req, res) => {
    const { tier, role_id } = req.body;
    if (!tier || !role_id) return res.status(400).json({ error: 'Tier and role_id are required' });

    try {
        await db.query(`
            INSERT INTO tier_role_mappings (tier, role_id, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (tier) DO UPDATE SET
                role_id = EXCLUDED.role_id,
                updated_at = CURRENT_TIMESTAMP
        `, [tier, role_id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/settings/roles/:tier
router.delete('/roles/:tier', authMiddleware, async (req, res) => {
    const { tier } = req.params;
    try {
        await db.query('DELETE FROM tier_role_mappings WHERE tier = $1', [tier]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/settings/staff
router.get('/staff', authMiddleware, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM staff_permissions ORDER BY added_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/settings/staff
router.post('/staff', authMiddleware, async (req, res) => {
    const { user_id, username, role } = req.body;
    if (!user_id) return res.status(400).json({ error: 'User ID is required' });

    try {
        await db.query(`
            INSERT INTO staff_permissions (user_id, username, role)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id) DO UPDATE SET
                username = EXCLUDED.username,
                role = EXCLUDED.role
        `, [user_id, username || 'Unknown', role || 'viewer']);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/settings/staff/:userId
router.delete('/staff/:userId', authMiddleware, async (req, res) => {
    const { userId } = req.params;
    try {
        await db.query('DELETE FROM staff_permissions WHERE user_id = $1', [userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
