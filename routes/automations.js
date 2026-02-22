const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('./middleware');
const crypto = require('crypto');

// --- Auto-Approval Rules ---

// Get all rules
router.get('/rules', authMiddleware, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM auto_approval_rules ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Add a rule
router.post('/rules', authMiddleware, async (req, res) => {
    const { pattern, tier, duration_months, duration_days, match_type, tier_mode } = req.body;
    if (!tier) return res.status(400).json({ error: 'Missing tier' });

    try {
        await db.query(`
            INSERT INTO auto_approval_rules (pattern, tier, duration_months, duration_days, match_type, tier_mode)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [pattern || '', tier, duration_months || 1, duration_days || null, match_type || 'regex', tier_mode || 'fixed']);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Delete a rule
router.delete('/rules/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM auto_approval_rules WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// --- External API Keys ---

// Get all API keys
router.get('/keys', authMiddleware, async (req, res) => {
    try {
        const result = await db.query('SELECT key_id, name, is_active, created_at, last_used_at FROM external_api_keys ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Create an API key
router.post('/keys', authMiddleware, async (req, res) => {
    const { name } = req.body;
    try {
        const key = `ak_live_${crypto.randomBytes(24).toString('hex')}`;
        await db.query(`
            INSERT INTO external_api_keys (key_id, name)
            VALUES ($1, $2)
        `, [key, name || 'Unnamed Key']);

        res.json({ success: true, key });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Delete an API key
router.delete('/keys/:key', authMiddleware, async (req, res) => {
    const { key } = req.params;
    try {
        await db.query('DELETE FROM external_api_keys WHERE key_id = $1', [key]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// --- External API Key Issuance (No session auth, uses API Key) ---

router.post('/external/issue', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'Missing API Key' });

    try {
        // Validate API Key
        const keyCheck = await db.query('SELECT name FROM external_api_keys WHERE key_id = $1 AND is_active = TRUE', [apiKey]);
        if (keyCheck.rows.length === 0) return res.status(403).json({ error: 'Invalid or inactive API Key' });

        const { guild_id, user_id, tier, duration_months, duration_days, notes } = req.body;
        if (!guild_id || !user_id || !tier) return res.status(400).json({ error: 'Missing required fields (guild_id, user_id, tier)' });

        // Update key usage
        await db.query('UPDATE external_api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE key_id = $1', [apiKey]);

        // Insert/Update subscription logic (or just generate a license key?)
        // The user asked to "issue licenses", usually meaning creating/updating subscription.
        // Let's reuse the logic from key usage or just create a subscription directly.
        // Actually, let's create a license key and return it, that's more flexible.

        const randomBuffer = crypto.randomBytes(4);
        const licenseKey = `AK-EXT-${randomBuffer.toString('hex').toUpperCase()}`;

        await db.query(`
            INSERT INTO license_keys (key_id, tier, duration_months, duration_days, reserved_user_id, notes)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [licenseKey, tier, duration_months || 1, duration_days || null, user_id, notes || `Issued via API: ${keyCheck.rows[0].name}`]);

        await db.query(`
            INSERT INTO operation_logs (operator_id, operator_name, target_id, target_name, action_type, details)
            VALUES ($1, $2, $3, $4, 'API_ISSUE', $5)
        `, [apiKey, `API: ${keyCheck.rows[0].name}`, user_id, `User ${user_id}`, `Issued ${tier} license key via external API`]);

        res.json({ success: true, key: licenseKey, tier });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
