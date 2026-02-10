const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('./auth');

// GET /api/applications - Get all applications
router.get('/', authMiddleware, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM applications ORDER BY created_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/applications/:id/approve - Approve an application
router.post('/:id/approve', authMiddleware, async (req, res) => {
    const { id } = req.params;

    try {
        // Get application details
        const appResult = await db.query(
            'SELECT * FROM applications WHERE id = $1',
            [id]
        );

        if (appResult.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }

        const app = appResult.rows[0];

        if (app.status === 'approved') {
            return res.status(400).json({ error: 'Application already approved' });
        }

        // Create or update subscription
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + 1); // 1 month

        await db.query(
            `INSERT INTO subscriptions (server_id, user_id, plan_tier, expiry_date, is_active) 
            VALUES ($1, $2, $3, $4, TRUE) 
            ON CONFLICT (server_id) DO UPDATE 
            SET user_id = EXCLUDED.user_id, 
                plan_tier = EXCLUDED.plan_tier, 
                expiry_date = EXCLUDED.expiry_date, 
                is_active = TRUE`,
            [app.parsed_server_id, app.parsed_user_id, app.parsed_tier, expiryDate]
        );

        // Update application status
        await db.query(
            'UPDATE applications SET status = $1 WHERE id = $2',
            ['approved', id]
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/applications/:id/reject - Reject an application
router.post('/:id/reject', authMiddleware, async (req, res) => {
    const { id } = req.params;

    try {
        await db.query(
            'UPDATE applications SET status = $1 WHERE id = $2',
            ['rejected', id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/applications/:id/cancel - Cancel an approved application
router.post('/:id/cancel', authMiddleware, async (req, res) => {
    const { id } = req.params;

    try {
        // Get application details
        const appResult = await db.query(
            'SELECT * FROM applications WHERE id = $1',
            [id]
        );

        if (appResult.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }

        const app = appResult.rows[0];

        // Deactivate subscription
        await db.query(
            'UPDATE subscriptions SET is_active = FALSE WHERE server_id = $1',
            [app.parsed_server_id]
        );

        // Update application status
        await db.query(
            'UPDATE applications SET status = $1 WHERE id = $2',
            ['cancelled', id]
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
