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

// POST /api/announce
router.post('/announce', authMiddleware, async (req, res) => {
    const client = req.app.discordClient;
    if (!client) {
        return res.status(503).json({ error: 'Discord Client not ready' });
    }

    const { title, content, type } = req.body;
    if (!title || !content) {
        return res.status(400).json({ error: 'Title and content are required' });
    }

    try {
        const channelId = process.env.ANNOUNCEMENT_CHANNEL_ID;
        if (!channelId) {
            console.error('[Announce] ANNOUNCEMENT_CHANNEL_ID is not set.');
            return res.status(500).json({ error: 'Announcement channel ID not configured' });
        }
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            return res.status(404).json({ error: 'Announcement channel not found' });
        }

        const embed = {
            title: title,
            description: content,
            color: type === 'important' ? 0xff0000 : 0x00ff00,
            timestamp: new Date().toISOString(),
            footer: {
                text: 'AkatsukiBot Update System'
            }
        };

        await channel.send({ embeds: [embed] });
        res.json({ success: true, message: 'Announcement posted' });
    } catch (err) {
        console.error('[Announce] Failed to post:', err);
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;
