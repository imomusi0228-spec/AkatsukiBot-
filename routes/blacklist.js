const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('./middleware');

// GET /api/blacklist
router.get('/', authMiddleware, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM blacklist ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/blacklist
router.post('/', authMiddleware, async (req, res) => {
    const { target_id, type, reason } = req.body;
    if (!target_id || !type) {
        return res.status(400).json({ error: 'target_id and type are required' });
    }

    try {
        await db.query(
            'INSERT INTO blacklist (target_id, type, reason, operator_id) VALUES ($1, $2, $3, $4) ON CONFLICT (target_id) DO UPDATE SET reason = EXCLUDED.reason, operator_id = EXCLUDED.operator_id',
            [target_id, type, reason, req.user ? req.user.userId : 'Admin']
        );
        res.json({ success: true, message: 'Added to blacklist' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/blacklist/:id
router.delete('/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM blacklist WHERE target_id = $1', [id]);
        res.json({ success: true, message: 'Removed from blacklist' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
