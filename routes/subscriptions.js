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
                // Determine IDs/Tier (with fallback for safety)
                const sId = sub.server_id || sub.guild_id || '';
                const pTier = sub.plan_tier || sub.tier || 'Free';

                let serverName = 'Unknown Server';
                let userName = 'Unknown User';
                let userHandle = 'unknown';

                try {
                    // Fetch Guild Name
                    if (sId) {
                        const guild = await client.guilds.fetch(sId).catch(() => null);
                        if (guild) serverName = guild.name;
                    }

                    // Fetch User Name
                    if (sub.user_id) {
                        const user = await client.users.fetch(sub.user_id).catch(() => null);
                        if (user) {
                            userName = user.globalName || user.username;
                            userHandle = user.username;
                            userAvatar = user.avatar; // Added avatar hash
                        }
                    }
                } catch (e) {
                    console.warn(`[Enrichment] Failed for server ${sId}: ${e.message}`);
                }

                // Explicitly return all fields plus enriched data
                return {
                    server_id: sId,
                    user_id: sub.user_id,
                    plan_tier: pTier,
                    expiry_date: sub.expiry_date,
                    is_active: sub.is_active,
                    auto_renew: sub.auto_renew, // Added auto_renew
                    server_name: serverName,
                    user_display_name: userName,
                    user_handle: userHandle,
                    user_avatar: userAvatar // Added user_avatar
                };
            }));
            res.json(enrichedSubs);
        } else {
            res.json(subs);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/stats
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const stats = {
            active_count: 0,
            expiring_soon_count: 0,
            new_this_month: 0,
            renewed_this_month: 0
        };

        // Active Count
        const activeRes = await db.query('SELECT COUNT(*) FROM subscriptions WHERE is_active = TRUE');
        stats.active_count = parseInt(activeRes.rows[0].count);

        // Expiring Soon (within 7 days)
        const expiringRes = await db.query(`
            SELECT COUNT(*) FROM subscriptions 
            WHERE is_active = TRUE 
            AND expiry_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
        `);
        stats.expiring_soon_count = parseInt(expiringRes.rows[0].count);

        // New/Renewed This Month (Approximation using operation_logs or created_at if we had it)
        // Since we don't have created_at on subscriptions (we do, start_date), let's use start_date for new.
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const newRes = await db.query(`
            SELECT COUNT(*) FROM subscriptions 
            WHERE start_date >= $1
        `, [startOfMonth]);
        stats.new_this_month = parseInt(newRes.rows[0].count);

        // Renewed (Log based)
        const renewedRes = await db.query(`
            SELECT COUNT(*) FROM operation_logs 
            WHERE action_type = 'EXTEND' 
            AND created_at >= $1
        `, [startOfMonth]);
        stats.renewed_this_month = parseInt(renewedRes.rows[0].count);

        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/subscriptions/stats/detailed
router.get('/stats/detailed', authMiddleware, async (req, res) => {
    try {
        const stats = {
            tier_distribution: {},
            retention_rate: 0,
            growth_data: []
        };

        // Tier Distribution
        const tierRes = await db.query('SELECT plan_tier, COUNT(*) FROM subscriptions WHERE is_active = TRUE GROUP BY plan_tier');
        tierRes.rows.forEach(row => {
            stats.tier_distribution[row.plan_tier] = parseInt(row.count);
        });

        // Retention Rate (Simplified: Active / Total ever)
        const totalRes = await db.query('SELECT COUNT(*) FROM subscriptions');
        const activeRes = await db.query('SELECT COUNT(*) FROM subscriptions WHERE is_active = TRUE');
        const total = parseInt(totalRes.rows[0].count);
        const active = parseInt(activeRes.rows[0].count);
        stats.retention_rate = total > 0 ? Math.round((active / total) * 100) : 0;

        // Growth Data (Last 6 months)
        const growthRes = await db.query(`
            SELECT 
                TO_CHAR(start_date, 'YYYY-MM') as month,
                COUNT(*) as count
            FROM subscriptions 
            WHERE start_date >= NOW() - INTERVAL '6 months'
            GROUP BY month
            ORDER BY month ASC
        `);
        stats.growth_data = growthRes.rows;

        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/subscriptions/:id/auto-renew
router.patch('/:id/auto-renew', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { enabled } = req.body;
    try {
        await db.query('UPDATE subscriptions SET auto_renew = $1 WHERE server_id = $2', [enabled, id]);
        
        // Log
        const operatorId = req.user?.userId || 'Unknown';
        const operatorName = req.user?.username || 'Unknown';
        await db.query(`INSERT INTO operation_logs (operator_id, operator_name, target_id, action_type, details) VALUES ($1, $2, $3, 'TOGGLE_AUTO_RENEW', $4)`,
            [operatorId, operatorName, id, `Set auto_renew to ${enabled}`]);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/logs (Self History)
router.get('/logs', authMiddleware, async (req, res) => {
    try {
        // Return logs where operator is this user OR system logs
        // Since it's a personal tool, maybe just show last 50 logs?
        const limit = 50;
        const result = await db.query(`
            SELECT * FROM operation_logs 
            ORDER BY created_at DESC 
            LIMIT $1
        `, [limit]);
        res.json(result.rows);
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
            } else if (/^\d+$/.test(duration)) {
                // Fallback for numeric only (treat as months)
                const now = new Date();
                now.setMonth(now.getMonth() + parseInt(duration));
                expiryDate = now;
            }
        }

        await db.query(
            'INSERT INTO subscriptions (server_id, user_id, plan_tier, expiry_date, is_active, expiry_warning_sent) VALUES ($1, $2, $3, $4, TRUE, FALSE) ON CONFLICT (server_id) DO UPDATE SET user_id = EXCLUDED.user_id, plan_tier = EXCLUDED.plan_tier, expiry_date = EXCLUDED.expiry_date, is_active = TRUE, expiry_warning_sent = FALSE',
            [server_id, user_id, tier, expiryDate]
        );

        // Log
        const operator = req.user ? `${req.user.username} (${req.user.userId})` : 'Unknown';
        await db.query(`
            INSERT INTO operation_logs (operator_id, operator_name, target_id, action_type, details)
            VALUES ($1, $2, $3, 'CREATE', $4)
        `, [req.user?.userId || 'Unknown', req.user?.username || 'Unknown', server_id, `Created ${tier} for ${duration}`]);

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
        const operatorId = req.user?.userId || 'Unknown';
        const operatorName = req.user?.username || 'Unknown';

        if (action === 'extend') {
            const currentSub = await db.query('SELECT user_id, expiry_date, plan_tier FROM subscriptions WHERE server_id = $1', [id]);
            if (currentSub.rows.length === 0) return res.status(404).json({ error: 'Not found' });

            const subData = currentSub.rows[0];
            let currentExpiry = subData.expiry_date ? new Date(subData.expiry_date) : new Date();
            if (currentExpiry < new Date()) currentExpiry = new Date();

            const match = String(duration).match(/^(\d+)([dmy])$/);
            let amount, unit;

            if (match) {
                amount = parseInt(match[1]);
                unit = match[2];
            } else if (/^\d+$/.test(duration)) {
                amount = parseInt(duration);
                unit = 'm';
            } else {
                return res.status(400).json({ error: 'Invalid duration format (expected e.g. 1m, 1d)' });
            }

            if (unit === 'd') currentExpiry.setDate(currentExpiry.getDate() + amount);
            else if (unit === 'm') currentExpiry.setMonth(currentExpiry.getMonth() + amount);
            else if (unit === 'y') currentExpiry.setFullYear(currentExpiry.getFullYear() + amount);

            await db.query('UPDATE subscriptions SET expiry_date = $1, is_active = TRUE, expiry_warning_sent = FALSE WHERE server_id = $2', [currentExpiry, id]);

            // Log
            await db.query(`INSERT INTO operation_logs (operator_id, operator_name, target_id, action_type, details) VALUES ($1, $2, $3, 'EXTEND', $4)`,
                [operatorId, operatorName, id, `Extended by ${duration}`]);

            if (client && SUPPORT_GUILD_ID) {
                const guild = await client.guilds.fetch(SUPPORT_GUILD_ID).catch(() => null);
                if (guild) await updateMemberRoles(guild, subData.user_id, subData.plan_tier);
            }

        } else if (action === 'update_tier') {
            const currentSub = await db.query('SELECT user_id FROM subscriptions WHERE server_id = $1', [id]);
            if (currentSub.rows.length === 0) return res.status(404).json({ error: 'Not found' });

            await db.query('UPDATE subscriptions SET plan_tier = $1 WHERE server_id = $2', [tier, id]);

            // Log
            await db.query(`INSERT INTO operation_logs (operator_id, operator_name, target_id, action_type, details) VALUES ($1, $2, $3, 'UPDATE_TIER', $4)`,
                [operatorId, operatorName, id, `Changed to ${tier}`]);

            if (client && SUPPORT_GUILD_ID) {
                const guild = await client.guilds.fetch(SUPPORT_GUILD_ID).catch(() => null);
                if (guild) await updateMemberRoles(guild, currentSub.rows[0].user_id, tier);
            }
        } else if (action === 'toggle_active') {
            await db.query('UPDATE subscriptions SET is_active = $1 WHERE server_id = $2', [is_active, id]);

            // Log
            await db.query(`INSERT INTO operation_logs (operator_id, operator_name, target_id, action_type, details) VALUES ($1, $2, $3, 'TOGGLE_ACTIVE', $4)`,
                [operatorId, operatorName, id, `Set active to ${is_active}`]);
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

        // Log
        const operatorId = req.user?.userId || 'Unknown';
        const operatorName = req.user?.username || 'Unknown';
        await db.query(`INSERT INTO operation_logs (operator_id, operator_name, target_id, action_type, details) VALUES ($1, $2, $3, 'DEACTIVATE', 'Soft Delete')`,
            [operatorId, operatorName, id]);

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

        // Log
        const operatorId = req.user?.userId || 'Unknown';
        const operatorName = req.user?.username || 'Unknown';
        await db.query(`INSERT INTO operation_logs (operator_id, operator_name, target_id, action_type, details) VALUES ($1, $2, $3, 'DELETE', 'Hard Delete')`,
            [operatorId, operatorName, id]);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
