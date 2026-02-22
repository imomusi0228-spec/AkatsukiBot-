const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');



const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.set('trust proxy', 1);
app.use(cookieParser());

// Security Headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "cdn.jsdelivr.net", "unpkg.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "fonts.googleapis.com"],
            fontSrc: ["'self'", "fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "cdn.discordapp.com", "images-ext-1.discordapp.net"], // Allow Discord Avatars & Embed images
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
