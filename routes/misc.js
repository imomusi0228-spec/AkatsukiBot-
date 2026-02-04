const express = require('express');
const router = express.Router();
const { syncSubscriptions } = require('../sync');
const { authMiddleware } = require('./auth');

// POST /api/sync
router.post('/sync', authMiddleware, async (req, res) => {
    const client = req.app.discordClient;
    if (!client) {
        return res.status(503).json({ error: 'Discord Client not ready' });
    }
    try {
        const result = await syncSubscriptions(client);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/applications
router.get('/applications', authMiddleware, async (req, res) => {
    const client = req.app.discordClient;
    if (!client) {
        return res.status(503).json({ error: 'Discord Client not ready' });
    }
    const channelId = process.env.LICENSE_CHANNEL_ID;
    if (!channelId) {
        return res.status(500).json({ error: 'LICENSE_CHANNEL_ID not configured' });
    }

    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) {
            return res.status(404).json({ error: 'License channel not found' });
        }
        if (!channel.isTextBased()) {
            return res.status(400).json({ error: 'License channel is not text-based' });
        }

        const messages = await channel.messages.fetch({ limit: 20 });
        const apps = messages.map(m => {
            const content = m.content;
            let serverId = '';
            let userId = m.author.id;
            let tier = 'Pro';
            let duration = '1m';

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

module.exports = router;
