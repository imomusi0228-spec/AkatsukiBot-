const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('./middleware');
const { approveApplication } = require('../services/applicationService');

// Get all applications with pagination
router.get('/', authMiddleware, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const page = parseInt(req.query.page) || 1;
        const offset = (page - 1) * limit;

        // Get total count
        const countRes = await db.query('SELECT COUNT(*) FROM applications');
        const totalCount = parseInt(countRes.rows[0].count);

        const result = await db.query(`
            SELECT a.*, l.is_used 
            FROM applications a 
            LEFT JOIN license_keys l ON a.license_key = l.key_id 
            ORDER BY a.created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);
        const apps = result.rows;

        // Fetch names from Discord
        const client = req.app.discordClient;
        if (client) {
            const enrichedApps = await Promise.all(apps.map(async app => {
                let userName = app.author_name || 'Unknown';
                let userHandle = 'unknown';
                let userAvatar = null;

                try {
                    // Cache-first lookup
                    const user = client.users.cache.get(app.author_id) || await client.users.fetch(app.author_id).catch(() => null);
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
            res.json({
                data: enrichedApps,
                pagination: {
                    total: totalCount,
                    page,
                    limit,
                    pages: Math.ceil(totalCount / limit)
                }
            });
        } else {
            res.json({
                data: apps,
                pagination: {
                    total: totalCount,
                    page,
                    limit,
                    pages: Math.ceil(totalCount / limit)
                }
            });
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
        const operatorId = req.user?.userId || 'Unknown';
        const operatorName = req.user?.username || 'Unknown';

        const result = await approveApplication(id, operatorId, operatorName);
        res.json(result);
    } catch (err) {
        console.error(err);
        if (err.message === 'Application not found') return res.status(404).json({ error: 'Not found' });
        res.status(500).json({ error: 'Database error' });
    }
});

// Reject application
router.post('/:id/reject', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        const appRes = await db.query('SELECT author_name, author_id, parsed_booth_name FROM applications WHERE id = $1', [id]);
        if (appRes.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const app = appRes.rows[0];

        await db.query('UPDATE applications SET status = \'rejected\' WHERE id = $1', [id]);

        // Log
        const operatorId = req.user?.userId || 'Unknown';
        const operatorName = req.user?.username || 'Unknown';
        const targetDesc = `${app.author_name} (${app.parsed_booth_name})`;
        await db.query(`
            INSERT INTO operation_logs (operator_id, operator_name, target_id, target_name, action_type, details)
            VALUES ($1, $2, $3, $4, 'REJECT_APP', 'Rejected application')
        `, [operatorId, operatorName, id, targetDesc]);

        // Notify
        await sendWebhookNotification({
            title: 'Application Rejected',
            description: `**Author:** ${app.author_name} (\`${app.author_id}\`)\n**Booth:** ${app.parsed_booth_name}`,
            color: 0xe74c3c,
            fields: [{ name: 'Operator', value: operatorName, inline: true }]
        });

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Hold application (New)
router.post('/:id/hold', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        const appRes = await db.query('SELECT author_name, author_id, parsed_booth_name FROM applications WHERE id = $1', [id]);
        if (appRes.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const app = appRes.rows[0];

        await db.query('UPDATE applications SET status = \'on_hold\' WHERE id = $1', [id]);

        // Log
        const operatorId = req.user?.userId || 'Unknown';
        const operatorName = req.user?.username || 'Unknown';
        const targetDesc = `${app.author_name} (${app.parsed_booth_name})`;
        await db.query(`
            INSERT INTO operation_logs (operator_id, operator_name, target_id, target_name, action_type, details)
            VALUES ($1, $2, $3, $4, 'HOLD_APP', 'Put application on hold')
        `, [operatorId, operatorName, id, targetDesc]);

        // Notify
        await sendWebhookNotification({
            title: 'Application Put on Hold',
            description: `**Author:** ${app.author_name} (\`${app.author_id}\`)\n**Booth:** ${app.parsed_booth_name}`,
            color: 0xf1c40f,
            fields: [{ name: 'Operator', value: operatorName, inline: true }]
        });

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
        const appRes = await db.query('SELECT author_name, author_id, parsed_booth_name FROM applications WHERE id = $1', [id]);
        if (appRes.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const app = appRes.rows[0];

        await db.query('UPDATE applications SET status = \'cancelled\' WHERE id = $1', [id]);

        // Log
        const operatorId = req.user?.userId || 'Unknown';
        const operatorName = req.user?.username || 'Unknown';
        const targetDesc = `${app.author_name} (${app.parsed_booth_name})`;
        await db.query(`
            INSERT INTO operation_logs (operator_id, operator_name, target_id, target_name, action_type, details)
            VALUES ($1, $2, $3, $4, 'CANCEL_APP', 'Cancelled approved application')
        `, [operatorId, operatorName, id, targetDesc]);

        // Notify
        await sendWebhookNotification({
            title: 'Application Cancelled',
            description: `**Author:** ${app.author_name} (\`${app.author_id}\`)\n**Booth:** ${app.parsed_booth_name}`,
            color: 0x95a5a6,
            fields: [{ name: 'Operator', value: operatorName, inline: true }]
        });

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
        const appRes = await db.query('SELECT author_name, author_id, parsed_booth_name FROM applications WHERE id = $1', [id]);
        if (appRes.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const app = appRes.rows[0];

        await db.query('DELETE FROM applications WHERE id = $1', [id]);

        // Log
        const operatorId = req.user?.userId || 'Unknown';
        const operatorName = req.user?.username || 'Unknown';
        const targetDesc = `${app.author_name} (${app.parsed_booth_name})`;
        await db.query(`
            INSERT INTO operation_logs (operator_id, operator_name, target_id, target_name, action_type, details)
            VALUES ($1, $2, $3, $4, 'DELETE_APP', 'Deleted application record')
        `, [operatorId, operatorName, id, targetDesc]);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
