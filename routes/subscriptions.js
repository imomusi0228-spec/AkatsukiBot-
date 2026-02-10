const express = require('express');
const router = express.Router();
const db = require('../db');
const { updateMemberRoles } = require('../sync');
const { authMiddleware } = require('./auth');

// GET /api/subscriptions
router.get('/', authMiddleware, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM subscriptions ORDER BY expiry_date ASC');
        const subs = result.rows;

        // Fetch names from Discord
        const client = req.app.discordClient;
        if (client) {
            const enrichedSubs = await Promise.all(subs.map(async sub => {
                let serverName = 'Unknown Server';
                let userName = 'Unknown User';

                try {
                    const guild = await client.guilds.fetch(sub.server_id).catch(() => null);
                    if (guild) serverName = guild.name;

                    const user = await client.users.fetch(sub.user_id).catch(() => null);
                    if (user) userName = user.tag;
                } catch (e) {
                    // console.warn(`Failed to fetch names: ${e.message}`);
                }

                return { ...sub, server_name: serverName, user_name: userName };
            }));
            res.json(enrichedSubs);
        } else {
            res.json(subs);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/subscriptions
router.post('/', authMiddleware, async (req, res) => {
    const { server_id, user_id, tier, duration } = req.body;
    if (!server_id || !user_id || !tier) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        let expiryDate = null;
        if (duration) {
            const match = duration.match(/^(\d+)([dmy])$/);
            if (match) {
                const amount = parseInt(match[1]);
                const unit = match[2];
                const now = new Date();
                if (unit === 'd') now.setDate(now.getDate() + amount);
                else if (unit === 'm') now.setMonth(now.getMonth() + amount);
                else if (unit === 'y') now.setFullYear(now.getFullYear() + amount);
                expiryDate = now;
            }
        }

        await db.query(
            'INSERT INTO subscriptions (server_id, user_id, plan_tier, expiry_date, is_active) VALUES ($1, $2, $3, $4, TRUE) ON CONFLICT (server_id) DO UPDATE SET user_id = EXCLUDED.user_id, plan_tier = EXCLUDED.plan_tier, expiry_date = EXCLUDED.expiry_date, is_active = TRUE',
            [server_id, user_id, tier, expiryDate]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/subscriptions/:id
router.put('/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { action, duration, tier, notes, is_active } = req.body;
    const client = req.app.discordClient;
    const SUPPORT_GUILD_ID = process.env.SUPPORT_GUILD_ID;

    try {
        if (action === 'extend') {
            const currentSub = await db.query('SELECT user_id, expiry_date, plan_tier FROM subscriptions WHERE server_id = $1', [id]);
            if (currentSub.rows.length === 0) return res.status(404).json({ error: 'Not found' });

            const subData = currentSub.rows[0];
            let currentExpiry = subData.expiry_date ? new Date(subData.expiry_date) : new Date();
            if (currentExpiry < new Date()) currentExpiry = new Date();

            const match = duration.match(/^(\d+)([dmy])$/);
            if (!match) return res.status(400).json({ error: 'Invalid duration' });
            const amount = parseInt(match[1]);
            const unit = match[2];
            if (unit === 'd') currentExpiry.setDate(currentExpiry.getDate() + amount);
            else if (unit === 'm') currentExpiry.setMonth(currentExpiry.getMonth() + amount);
            else if (unit === 'y') currentExpiry.setFullYear(currentExpiry.getFullYear() + amount);

            await db.query('UPDATE subscriptions SET expiry_date = $1, is_active = TRUE WHERE server_id = $2', [currentExpiry, id]);

            if (client && SUPPORT_GUILD_ID) {
                const guild = await client.guilds.fetch(SUPPORT_GUILD_ID).catch(() => null);
                if (guild) await updateMemberRoles(guild, subData.user_id, subData.plan_tier);
            }

        } else if (action === 'update_tier') {
            const currentSub = await db.query('SELECT user_id FROM subscriptions WHERE server_id = $1', [id]);
            if (currentSub.rows.length === 0) return res.status(404).json({ error: 'Not found' });

            await db.query('UPDATE subscriptions SET plan_tier = $1 WHERE server_id = $2', [tier, id]);

            if (client && SUPPORT_GUILD_ID) {
                const guild = await client.guilds.fetch(SUPPORT_GUILD_ID).catch(() => null);
                if (guild) await updateMemberRoles(guild, currentSub.rows[0].user_id, tier);
            }
        } else if (action === 'toggle_active') {
            await db.query('UPDATE subscriptions SET is_active = $1 WHERE server_id = $2', [is_active, id]);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/subscriptions/:id
router.delete('/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('UPDATE subscriptions SET is_active = FALSE WHERE server_id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/subscriptions/:id/delete - Complete deletion
router.delete('/:id/delete', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM subscriptions WHERE server_id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
