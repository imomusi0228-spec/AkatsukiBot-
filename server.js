const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth'); // Imports { router, authMiddleware }
const subscriptionRoutes = require('./routes/subscriptions');
const miscRoutes = require('./routes/misc');
const applicationRoutes = require('./routes/applications');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Security Headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "cdn.jsdelivr.net", "unpkg.com"], // Allow CDN for Bootstrap/Vue
            styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "fonts.googleapis.com"],
            fontSrc: ["'self'", "fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "cdn.discordapp.com"], // Allow Discord Avatars
            connectSrc: ["'self'"]
        }
    }
}));

// Global Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter); // Apply to API routes

app.use(express.static('public'));
app.set('trust proxy', 1); // Render/Cloudflareのプロキシを信頼する
app.use(cookieParser());

// Health Check Endpoint (Keep-Alive)
app.get('/health', (req, res) => res.sendStatus(200));

// Mount Routes
app.use('/api/auth', authRoutes.router);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api', miscRoutes); // mounts /api/sync

function startServer(client) {
    app.discordClient = client;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Web Server running on port ${PORT}`);
    });
}

module.exports = { startServer };
