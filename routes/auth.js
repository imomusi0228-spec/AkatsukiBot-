const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const db = require('../db');
require('dotenv').config();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const DISCORD_CLIENT_ID = process.env.CLIENT_ID || process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const PORT = process.env.PORT || 3000;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const REDIRECT_URI = `${PUBLIC_URL}/api/auth/callback`;

console.log(`[OAuth] Configured REDIRECT_URI: ${REDIRECT_URI}`);

// Cache for used codes to prevent replay attacks and rate limits
const usedCodes = new Set();
// Cleanup used codes every 10 minutes
setInterval(() => {
    usedCodes.clear();
}, 1000 * 60 * 10);

// Circuit Breaker for Rate Limiting (Cloudflare Error 1015)
let rateLimitUntil = 0;

// Auth Middleware
async function authMiddleware(req, res, next) {
    const token = req.headers['authorization'];
    const sessionId = req.cookies['session_id'];

    if (token === `Bearer ${ADMIN_TOKEN}` || token === ADMIN_TOKEN) {
        return next();
    }

    if (sessionId) {
        try {
            const result = await db.query('SELECT * FROM user_sessions WHERE session_id = $1', [sessionId]);
            if (result.rows.length > 0) {
                const session = result.rows[0];
                if (new Date(session.expiry) > new Date()) {
                    req.user = {
                        userId: session.user_id,
                        username: session.username,
                        avatar: session.avatar,
                        discriminator: session.discriminator
                    };
                    return next();
                } else {
                    // Cleanup expired session
                    db.query('DELETE FROM user_sessions WHERE session_id = $1', [sessionId]).catch(console.error);
                }
            }
        } catch (err) {
            console.error('Session check error:', err);
        }
    }

    res.status(401).json({ error: 'Unauthorized' });
}

// Login Route
router.get('/login', (req, res) => {
    if (Date.now() < rateLimitUntil) {
        console.warn('[Circuit Breaker] Blocking request due to active rate limit.');
        return res.redirect('/error.html');
    }

    const state = crypto.randomUUID();
    res.cookie('oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 5 // 5 minutes
    });

    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: 'identify guilds',
        state: state
    });
    console.log('[OAuth] Login initiated. Redirect URI:', REDIRECT_URI);
    res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

// Callback Route
router.get('/callback', async (req, res) => {
    if (Date.now() < rateLimitUntil) {
        console.warn('[Circuit Breaker] Blocking callback due to active rate limit.');
        return res.redirect('/error.html');
    }

    const { code, state } = req.query;
    const storedState = req.cookies['oauth_state'];

    if (!state || !storedState || state !== storedState) {
        console.warn('OAuth State Mismatch');
        return res.redirect('/error.html');
    }
    res.clearCookie('oauth_state');

    if (!code) return res.redirect('/error.html');

    // Check if code has been used recently
    if (usedCodes.has(code)) {
        console.warn('[OAuth] Code replay detected. Blocking request.');
        return res.redirect('/error.html');
    }
    usedCodes.add(code);

    const USER_AGENT = 'DiscordBot (https://github.com/imomusi0228-spec/AkatsukiBot-, 1.0.0)';

    try {
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            client_secret: DISCORD_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: REDIRECT_URI,
            scope: 'identify guilds'
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': USER_AGENT
            }
        });

        const { access_token } = tokenResponse.data;
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${access_token}`,
                'User-Agent': USER_AGENT
            }
        });

        const user = userResponse.data;

        // --- Whitelist Check ---
        const allowedIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map(id => id.trim());
        // Also allow if ADMIN_TOKEN is used (handled in middleware, but here we are login via Discord)
        // If ADMIN_DISCORD_IDS is not set, we might want to default to blocking or allowing only the owner?
        // For now, if the list is empty, we warn but might block.
        // Let's strictly enforce:
        if (allowedIds.length > 0 && !allowedIds.includes(user.id)) {
            console.warn(`[OAuth] Access denied for user ID: ${user.id} (${user.username}). Not in valid list.`);
            return res.status(403).send('<h1>403 Forbidden</h1><p>You are not authorized to access this dashboard.</p><a href="/">Return to Home</a>');
        }
        // -----------------------

        const sessionId = crypto.randomUUID();
        const expiry = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days

        await db.query(
            'INSERT INTO user_sessions (session_id, user_id, username, avatar, discriminator, expiry) VALUES ($1, $2, $3, $4, $5, $6)',
            [sessionId, user.id, user.username, user.avatar, user.discriminator, expiry]
        );

        res.cookie('session_id', sessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 1000 * 60 * 60 * 24 * 7
        });

        res.redirect('/');

    } catch (error) {
        const status = error.response?.status;
        const data = error.response?.data;
        const message = error.message || '';

        console.error('OAuth Error:', data || message);

        // Check for Cloudflare Rate Limit (Status 403/429 with HTML body often containing "1015" or "Cloudflare")
        // Or if the error message itself mentions 1015
        if (
            status === 429 ||
            (status === 403 && typeof data === 'string' && (data.includes('1015') || data.includes('Cloudflare'))) ||
            message.includes('1015')
        ) {
            console.error('!!! RATE LIMIT DETECTED !!! Triggering Circuit Breaker for 30 minutes.');
            rateLimitUntil = Date.now() + (30 * 60 * 1000); // 30 minutes cooldown
        }

        // Do not return 500 JSON, redirect to error page to prevent reload loops
        res.redirect('/error.html');
    }
});

// Status Route
router.get('/status', async (req, res) => {
    const sessionId = req.cookies['session_id'];
    if (sessionId) {
        try {
            const result = await db.query('SELECT * FROM user_sessions WHERE session_id = $1', [sessionId]);
            if (result.rows.length > 0) {
                const session = result.rows[0];
                if (new Date(session.expiry) > new Date()) {
                    return res.json({
                        authenticated: true,
                        user: {
                            id: session.user_id,
                            username: session.username,
                            avatar: session.avatar
                        }
                    });
                }
            }
        } catch (err) {
            console.error('Status check error:', err);
        }
    }
    res.json({ authenticated: false });
});

// Logout Route
router.post('/logout', async (req, res) => {
    const sessionId = req.cookies['session_id'];
    if (sessionId) {
        try {
            await db.query('DELETE FROM user_sessions WHERE session_id = $1', [sessionId]);
        } catch (err) {
            console.error('Logout error:', err);
        }
        res.clearCookie('session_id');
    }
    res.json({ success: true });
});

module.exports = { router, authMiddleware };
