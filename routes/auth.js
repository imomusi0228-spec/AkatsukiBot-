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
const PUBLIC_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
const REDIRECT_URI = `${PUBLIC_URL}/api/auth/callback`;

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
    const { code, state } = req.query;
    const storedState = req.cookies['oauth_state'];

    if (!state || !storedState || state !== storedState) {
        console.warn('OAuth State Mismatch');
        return res.status(403).send('Invalid state parameter');
    }
    res.clearCookie('oauth_state');

    if (!code) return res.status(400).send('No code provided');

    try {
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            client_secret: DISCORD_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: REDIRECT_URI,
            scope: 'identify guilds'
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const { access_token } = tokenResponse.data;
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const user = userResponse.data;
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
        console.error('OAuth Error:', error.response?.data || error.message);
        res.status(500).send(`Authentication failed: ${JSON.stringify(error.response?.data || error.message)}`);
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
