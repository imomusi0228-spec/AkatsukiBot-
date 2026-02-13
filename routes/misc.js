const express = require('express');
const router = express.Router();
const db = require('../db');
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

// GET /api/announce (告知履歴・予約一覧取得)
router.get('/announce', authMiddleware, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM scheduled_announcements ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('[Announce] Failed to fetch list:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/announce
router.post('/announce', authMiddleware, async (req, res) => {
    const client = req.app.discordClient;
    if (!client) {
        return res.status(503).json({ error: 'Discord Client not ready' });
    }

    const { title, content, type, scheduled_at } = req.body;
    if (!title || !content) {
        return res.status(400).json({ error: 'Title and content are required' });
    }

    try {
        if (scheduled_at) {
            await db.query(
                'INSERT INTO scheduled_announcements (title, content, type, scheduled_at) VALUES ($1, $2, $3, $4)',
                [title, content, type || 'normal', scheduled_at]
            );
            return res.json({ success: true, message: 'Announcement scheduled' });
        }

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
        console.error('[Announce] Failed to post/schedule:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/announce/:id (予約編集)
router.put('/announce/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { title, content, type, scheduled_at } = req.body;

    try {
        const check = await db.query('SELECT sent_at FROM scheduled_announcements WHERE id = $1', [id]);
        if (check.rows.length === 0) return res.status(404).json({ error: 'Announcement not found' });
        if (check.rows[0].sent_at) return res.status(400).json({ error: 'Already sent. Cannot edit.' });

        await db.query(
            'UPDATE scheduled_announcements SET title = $1, content = $2, type = $3, scheduled_at = $4 WHERE id = $5',
            [title, content, type, scheduled_at, id]
        );
        res.json({ success: true, message: 'Announcement updated' });
    } catch (err) {
        console.error('[Announce] Failed to update:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/announce/:id (削除)
router.delete('/announce/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM scheduled_announcements WHERE id = $1', [id]);
        res.json({ success: true, message: 'Announcement deleted' });
    } catch (err) {
        console.error('[Announce] Failed to delete:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
