const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');



const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.set('trust proxy', 1);
app.use(cookieParser());

// DEBUG: Global Request Logger
app.use((req, res, next) => {
    if (!req.path.startsWith('/css') && !req.path.startsWith('/js') && !req.path.includes('.png')) {
        const authHeader = req.headers['authorization'] ? `Auth: ${req.headers['authorization'].substring(0, 15)}...` : 'NoAuth';
        console.log(`[REQ] ${req.method} ${req.path} - ${authHeader} - Cookies: ${JSON.stringify(req.cookies || {})}`);
    }
    next();
});

// Security Headers (TEMPORARILY DISABLED)
/*
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "cdn.jsdelivr.net", "unpkg.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "fonts.googleapis.com"],
            fontSrc: ["'self'", "fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "cdn.discordapp.com", "images-ext-1.discordapp.net"],
            connectSrc: ["'self'"]
        }
    }
}));
*/

// Global Rate Limiting (TEMPORARILY DISABLED)
/*
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);
*/

app.use(express.static('public'));

// Health Check Endpoint (Keep-Alive)
app.get('/health', (req, res) => res.sendStatus(200));

const path = require('path');

// Mount Routes with Safety Check
const routes = [
    { path: '/api/auth', module: 'auth' },
    { path: '/api/subscriptions', module: 'subscriptions' },
    { path: '/api/applications', module: 'applications' },
    { path: '/api/settings', module: 'settings' },
    { path: '/api/logs', module: 'logs' },
    { path: '/api/blacklist', module: 'blacklist' },
    { path: '/api/import', module: 'import' },
    { path: '/api/automations', module: 'automations' },
    { path: '/api', module: 'misc' }
];

routes.forEach(route => {
    try {
        const routePath = path.join(__dirname, 'routes', route.module);
        const handler = require(routePath);
        if (typeof handler === 'function') {
            app.use(route.path, handler);
        } else {
            console.error(`[Router Error] Module "${route.module}" did not export a function (exported: ${typeof handler}). Path: ${routePath}`);
            // Fallback to empty router if possible, or just skip if it's already broken
        }
    } catch (err) {
        console.error(`[Router Fatal] Failed to load module "${route.module}":`, err.message);
    }
});

function startServer(client) {
    app.discordClient = client;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Web Server running on port ${PORT}`);
    });
}

module.exports = { startServer };
