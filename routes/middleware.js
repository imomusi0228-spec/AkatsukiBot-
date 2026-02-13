const db = require('../db');
require('dotenv').config();
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

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
