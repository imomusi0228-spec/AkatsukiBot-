const db = require('../db');
require('dotenv').config();
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

async function authMiddleware(req, res, next) {
    const token = req.headers['authorization'];
    const sessionId = req.cookies['session_id'];

    if (token === `Bearer ${ADMIN_TOKEN}` || token === ADMIN_TOKEN) {
        return next();
    }

    // 0. Blacklist Check (Global)
    try {
        const blacklistRes = await db.query('SELECT 1 FROM blacklist WHERE target_id = $1', [sessionId]); // session_id is NOT what we want here
        // We need user_id from session if it exists, or check by IP but session is better.
        // Actually, let's do it AFTER we resolve the user_id from session.
    } catch (e) { }

    if (sessionId) {
        try {
            const result = await db.query('SELECT * FROM user_sessions WHERE session_id = $1', [sessionId]);
            if (result.rows.length > 0) {
                const session = result.rows[0];

                // --- Blacklist Check ---
                const blCheck = await db.query('SELECT 1 FROM blacklist WHERE target_id = $1', [session.user_id]);
                if (blCheck.rows.length > 0) {
                    return res.status(403).json({ error: 'Forbidden: Your account is blacklisted' });
                }

                if (new Date(session.expiry) > new Date()) {
                    // Get user's subscription tier
                    const subRes = await db.query('SELECT tier, is_active FROM subscriptions WHERE user_id = $1', [session.user_id]);
                    const userTier = subRes.rows.length > 0 ? subRes.rows[0].tier : 'Free';
                    const isActive = subRes.rows.length > 0 ? subRes.rows[0].is_active : false;

                    // Block Free tier or Inactive users (unless they are explicitly allowed admins)
                    const allowedIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map(id => id.trim());
                    const isExplicitAdmin = allowedIds.includes(session.user_id);

                    if (!isExplicitAdmin && (userTier === 'Free' || userTier === '0' || !isActive)) {
                        return res.status(403).json({ error: 'Forbidden: Paid tier required for dashboard access' });
                    }

                    req.user = {
                        userId: session.user_id,
                        username: session.username,
                        avatar: session.avatar,
                        discriminator: session.discriminator,
                        tier: userTier
                    };
                    return next();
                } else {
                    db.query('DELETE FROM user_sessions WHERE session_id = $1', [sessionId]).catch(console.error);
                }
            }
        } catch (err) {
            console.error('Session check error:', err);
        }
    }

    res.status(401).json({ error: 'Unauthorized' });
}

module.exports = { authMiddleware };
