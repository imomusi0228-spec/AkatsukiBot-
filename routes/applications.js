const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('./auth');
const crypto = require('crypto');

// Get all applications
router.get('/', authMiddleware, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM applications ORDER BY created_at DESC');
        const apps = result.rows;

        // Fetch names from Discord
        const client = req.app.discordClient;
        if (client) {
            const enrichedApps = await Promise.all(apps.map(async app => {
                let userName = app.author_name || 'Unknown';
                let userHandle = 'unknown';
                let userAvatar = null;

                try {
                    const user = await client.users.fetch(app.author_id).catch(() => null);
                    if (user) {
                        userName = user.globalName || user.username;
                        userHandle = user.username;
                        userAvatar = user.avatar;
                    }
                } catch (e) {
                    console.warn(`[App Enrichment] Failed for user ${app.author_id}: ${e.message}`);
                }

                return {
                    ...app,
                    user_display_name: userName,
                    user_handle: userHandle,
                    user_avatar: userAvatar
                };
            }));
            res.json(enrichedApps);
        } else {
            res.json(apps);
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Approve application and GENERATE KEY
router.post('/:id/approve', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        const appRes = await db.query('SELECT * FROM applications WHERE id = $1', [id]);
        if (appRes.rows.length === 0) return res.status(404).json({ error: 'Not found' });

        const app = appRes.rows[0];

        // 1. Generate a new License Key
        const tier = app.parsed_tier || 'Pro';
        const duration = 1;
        const randomBuffer = crypto.randomBytes(4);
        const key = `AK-${randomBuffer.toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        const reservedUser = app.parsed_user_id || null;

        // 2. Insert into license_keys
        await db.query(`
            INSERT INTO license_keys (key_id, plan_tier, duration_months, reserved_user_id, notes)
            VALUES ($1, $2, $3, $4, $5)
        `, [key, tier, duration, reservedUser, `Generated for App ID: ${id} (${app.parsed_booth_name})`]);

        // 3. Update application status and store the generated key
        await db.query('UPDATE applications SET status = \'approved\', license_key = $1 WHERE id = $2', [key, id]);

        res.json({ success: true, key: key, tier: tier });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Reject application
router.post('/:id/reject', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('UPDATE applications SET status = \'rejected\' WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Cancel approved application
router.post('/:id/cancel', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('UPDATE applications SET status = \'cancelled\' WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Delete application record
router.delete('/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM applications WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
