const express = require('express');
const db = require('./db');
const { syncSubscriptions, updateMemberRoles } = require('./sync');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const SUPPORT_GUILD_ID = process.env.SUPPORT_GUILD_ID;

app.use(express.json());
app.use(express.static('public'));


// Auth Middleware
function authMiddleware(req, res, next) {
    const token = req.headers['authorization'];
    if (token === `Bearer ${ADMIN_TOKEN}` || token === ADMIN_TOKEN) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

// API Routes
app.get('/api/subscriptions', authMiddleware, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM subscriptions ORDER BY expiry_date ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/subscriptions', authMiddleware, async (req, res) => {
    const { server_id, user_id, tier, duration } = req.body;
    // Basic validation
    if (!server_id || !user_id || !tier) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        let expiryDate = null;
        if (duration) {
            // Re-use logic or duplicate simple logic? simple logic here for now
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
        await db.query('INSERT INTO subscription_logs (server_id, action, details) VALUES ($1, $2, $3)', [server_id, 'CREATE_WEB', `Tier: ${tier}, Exp: ${expiryDate}`]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/subscriptions/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { action, duration, tier, notes, is_active } = req.body;

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
            await db.query('INSERT INTO subscription_logs (server_id, action, details) VALUES ($1, $2, $3)', [id, 'EXTEND_WEB', `New Exp: ${currentExpiry}`]);

            // Sync roles
            const guild = await app.discordClient.guilds.fetch(SUPPORT_GUILD_ID).catch(() => null);
            if (guild) {
                await updateMemberRoles(guild, subData.user_id, subData.plan_tier);
            }

        } else if (action === 'update_tier') {
            const currentSub = await db.query('SELECT user_id FROM subscriptions WHERE server_id = $1', [id]);
            if (currentSub.rows.length === 0) return res.status(404).json({ error: 'Not found' });

            await db.query('UPDATE subscriptions SET plan_tier = $1 WHERE server_id = $2', [tier, id]);
            await db.query('INSERT INTO subscription_logs (server_id, action, details) VALUES ($1, $2, $3)', [id, 'UPDATE_WEB', `Tier: ${tier}`]);

            // Sync roles
            const guild = await app.discordClient.guilds.fetch(SUPPORT_GUILD_ID).catch(() => null);
            if (guild) {
                await updateMemberRoles(guild, currentSub.rows[0].user_id, tier);
            }
        } else if (action === 'toggle_active') {
            await db.query('UPDATE subscriptions SET is_active = $1 WHERE server_id = $2', [is_active, id]);
            await db.query('INSERT INTO subscription_logs (server_id, action, details) VALUES ($1, $2, $3)', [id, 'UPDATE_WEB', `Active: ${is_active}`]);

            // If deactivating, we might want to remove roles, but the standard 'sync' handles Free/Inactive.
            // For now, let's keep it simple.
        }
        else if (action === 'update_note') {
            await db.query('UPDATE subscriptions SET notes = $1 WHERE server_id = $2', [notes, id]);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/subscriptions/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('UPDATE subscriptions SET is_active = FALSE WHERE server_id = $1', [id]);
        await db.query('INSERT INTO subscription_logs (server_id, action, details) VALUES ($1, $2, $3)', [id, 'CANCEL_WEB', 'Cancelled manually']);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/logs', authMiddleware, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM subscription_logs ORDER BY created_at DESC LIMIT 100');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sync', authMiddleware, async (req, res) => {
    // We need the client to run sync. Ideally we should pass client to startServer but simple solution:
    // We can't access discord client here easily unless exported or passed.
    // For now, let's export a setter or assume client is passed to startServer and stored.
    if (!app.discordClient) {
        return res.status(503).json({ error: 'Discord Client not ready' });
    }
    try {
        const result = await syncSubscriptions(app.discordClient);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/applications', authMiddleware, async (req, res) => {
    if (!app.discordClient) {
        return res.status(503).json({ error: 'Discord Client not ready' });
    }
    const channelId = process.env.LICENSE_CHANNEL_ID;
    if (!channelId) {
        return res.status(500).json({ error: 'LICENSE_CHANNEL_ID not configured' });
    }

    try {
        const channel = await app.discordClient.channels.fetch(channelId).catch(() => null);
        if (!channel) {
            return res.status(404).json({ error: 'License channel not found' });
        }
        if (!channel.isTextBased()) {
            return res.status(400).json({ error: 'License channel is not text-based' });
        }

        const messages = await channel.messages.fetch({ limit: 20 });
        const apps = messages.map(m => {
            // Basic parsing attempt
            const content = m.content;
            const lines = content.split('\n');
            let serverId = '';
            let userId = m.author.id; // Default to author
            let tier = 'Pro'; // Default
            let duration = '1m';

            // Try to extract known patterns
            // Look for "Server ID: 123..." or just 18-20 digit numbers
            const serverIdMatch = content.match(/Server\s*ID[:\s]*(\d{17,20})/i) || content.match(/(?<!User\s*ID[:\s]*)(\d{17,20})/);
            if (serverIdMatch) serverId = serverIdMatch[1];

            const userIdMatch = content.match(/User\s*ID[:\s]*(\d{17,20})/i);
            if (userIdMatch) userId = userIdMatch[1];

            if (content.match(/Pro\+/i)) tier = 'Pro+';
            else if (content.match(/Pro/i)) tier = 'Pro';

            if (content.match(/1\s*y/i) || content.match(/year/i) || content.match(/年/)) duration = '1y';

            return {
                id: m.id,
                author: m.author.tag,
                authorId: m.author.id,
                content: m.content,
                createdAt: m.createdAt,
                parsed: { serverId, userId, tier, duration }
            };
        });

        res.json(apps);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

function startServer(client) {
    app.discordClient = client;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = { startServer };
