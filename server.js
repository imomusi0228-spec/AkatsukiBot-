const express = require('express');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const authRoutes = require('./routes/auth'); // Imports { router, authMiddleware }
const subscriptionRoutes = require('./routes/subscriptions');
const miscRoutes = require('./routes/misc');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.set('trust proxy', 1); // Render/Cloudflareのプロキシを信頼する
app.use(cookieParser());

// Mount Routes
app.use('/api/auth', authRoutes.router);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api', miscRoutes); // mounts /api/sync, /api/applications

function startServer(client) {
    app.discordClient = client;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Web Server running on port ${PORT}`);
    });
}

module.exports = { startServer };
