const db = require('../db');
const crypto = require('crypto');
require('dotenv').config();
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

// In-memory store for CSRF tokens (session_id -> token)
// Since we don't have Redis or session store in DB for tokens for now, 
// and the app restarts often, let's store it in `user_sessions` table if possible, 
// or simpler: just verify a custom header that must match a token stored in a cookie?
// No, standard Double Submit Cookie or Synchronizer Token Pattern is better.
// Given we use `user_sessions` table, let's add a `csrf_secret` column to it? 
// Or simpler for now: Random token in Cookie + Verify Header match.
// BUT, to be safer, let's bind it to the session.

// Let's implement a simple Synchronizer Token Pattern using the DB session.
// 1. When logging in, we generate a session.
// 2. We can add a `csrf_secret` to the session row in DB (requires migration).
// OR, we can just use a signed cookie if we had a secret key.
// Let's go with: Double Submit Cookie with a twist (verify against DB if possible, but simplicity first).

// Actually, `csurf` style: session has a secret, token is generated from it.
// Since we don't want to change DB schema yet if avoidable, let's use:
// Token in Cookie (HttpOnly) -> Wait, frontend needs to read it.
// Token in Cookie (Not HttpOnly) -> XSS dangerous if not careful.
// Best approach without DB change:
// Generate a random token, put it in a `csrf_token` cookie (Secure, SameSite=Strict), 
// AND require it in a custom header `X-CSRF-Token`.
// Wait, if it's in a cookie, browser sends it automatically.
// The "Double Submit Cookie" pattern:
// 1. Server sends a random value in a Cookie (e.g. `_csrf`).
// 2. Client reads the cookie and sends the value in a Header defined by us (e.g. `X-CSRF-Token`).
// 3. Server verifies Cookie value == Header value.
// This works because attacker cannot read the cookie from a different origin to set the header.

async function authMiddleware(req, res, next) {
    const token = req.headers['authorization'];
    const sessionId = req.cookies['session_id'];

    // API Token Access (Bypass CSRF for pure API tokens if they exist, but here it's Bearer ADMIN_TOKEN)
    if (token === `Bearer ${ADMIN_TOKEN}` || token === ADMIN_TOKEN) {
        return next();
    }

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
                    // Check for staff permission
                    const staffRes = await db.query('SELECT role FROM staff_permissions WHERE user_id = $1', [session.user_id]);
                    const staffRole = staffRes.rows.length > 0 ? staffRes.rows[0].role : null;

                    // Get user's subscription tier
                    const subRes = await db.query('SELECT tier, is_active FROM subscriptions WHERE user_id = $1', [session.user_id]);
                    const userTier = subRes.rows.length > 0 ? subRes.rows[0].tier : 'Free';
                    const isActive = subRes.rows.length > 0 ? subRes.rows[0].is_active : false;

                    const allowedIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map(id => id.trim());
                    const isExplicitAdmin = allowedIds.includes(session.user_id);

                    // Authorized if: Explicit Admin OR Staff OR Paid Tier
                    if (!isExplicitAdmin && !staffRole && (userTier === 'Free' || userTier === '0' || !isActive)) {
                        return res.status(403).json({ error: 'Forbidden: Unauthorized access to dashboard' });
                    }

                    // Role-based restriction
                    const isModerator = staffRole === 'moderator';

                    if (isModerator) {
                        // Moderator can see everything (GET)
                        // But can only POST to certain application endpoints
                        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
                            const isAllowedAppAction = req.path.startsWith('/api/applications/') &&
                                (req.path.endsWith('/approve') || req.path.endsWith('/hold'));

                            if (!isAllowedAppAction) {
                                return res.status(403).json({ error: 'Forbidden: Moderator access restricted to application approval/hold' });
                            }
                        }
                    } else if (staffRole === 'viewer') {
                        // Deprecating viewer: treat as restricted
                        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
                            return res.status(403).json({ error: 'Forbidden: View-only access (Please update to moderator or admin)' });
                        }
                    }

                    req.user = {
                        userId: session.user_id,
                        username: session.username,
                        avatar: session.avatar,
                        discriminator: session.discriminator,
                        tier: userTier,
                        role: staffRole || (isExplicitAdmin ? 'admin' : 'user')
                    };

                    // --- CSRF Check for State-Changing Methods ---
                    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
                        const csrfCookie = req.cookies['csrf_token'];
                        const csrfHeader = req.headers['x-csrf-token'];

                        if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
                            console.warn(`[CSRF Block] User: ${session.user_id}, Method: ${req.method}, Path: ${req.path}`);
                            return res.status(403).json({ error: 'CSRF Token Mismatch' });
                        }
                    }

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
