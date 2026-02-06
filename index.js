require('dotenv').config(); // Load env vars FIRST
const { Client, GatewayIntentBits, Events, ActivityType } = require('discord.js');
const { initDB } = require('./db');
const { commands, adminCommands, publicCommands, handleInteraction } = require('./commands');
const { syncSubscriptions } = require('./sync');
const { checkExpirations } = require('./expiry');
const { startServer } = require('./server');

console.log('>>> Starting Bot Application...');

// 1. Initialize Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
    ],
});

// Debug Logging
client.on('debug', info => console.log(`[Discord Debug] ${info}`));


// Presence Helper
const setBotPresence = () => {
    if (client.user) {
        client.user.setPresence({
            activities: [{ name: '/help | 管理ツール', type: ActivityType.Playing }],
            status: 'online'
        });
    }
};

// Event Handlers
client.once(Events.ClientReady, async () => {
    console.log(`>>> [Discord] Logged in as ${client.user.tag}!`);
    setBotPresence();

    console.log('[Discord] Skipping command registration on startup. Use "npm run register" if changes are needed.');

    // Start heavier background tasks AFTER login
    try {
        console.log('[Background] Starting initial sync and expiry check...');
        await syncSubscriptions(client);
        await checkExpirations(client);

        // Schedule periodic tasks
        setInterval(() => syncSubscriptions(client), 300000); // 5 mins
        setInterval(() => checkExpirations(client), 300000); // 5 mins
        console.log('[Background] Periodic tasks scheduled.');
    } catch (err) {
        console.error('[Background] Error in background tasks:', err);
    }
});

client.on('interactionCreate', handleInteraction);

client.on('error', error => console.error('[Discord] Client Error:', error));
client.on('shardError', error => console.error('[Discord] WS Error:', error));
client.on('shardDisconnect', (event, id) => console.log(`[Discord] Shard ${id} disconnected.`));
client.on('shardReady', (id) => {
    console.log(`[Discord] Shard ${id} is ready.`);
    setBotPresence();
});

// Main Startup Flow
async function main() {
    try {
        // 2. Start Web Server
        startServer(client);
        console.log('[Web] Server started.');

        // 3. Initialize Database
        await initDB();
        console.log('[DB] Database initialized.');

        // 4. Setup Keep-Alive (Render Support)
        const PUBLIC_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
        if (PUBLIC_URL) {
            console.log(`[Keep-Alive] Configured for: ${PUBLIC_URL}`);
            const pingUrl = new URL('/health', PUBLIC_URL).toString();
            const pingSelf = () => {
                fetch(pingUrl)
                    .then(res => {
                        if (res.ok) console.log(`[Keep-Alive] Ping successful: ${res.status}`);
                        else console.warn(`[Keep-Alive] Ping returned status: ${res.status}`);
                    })
                    .catch(e => console.error(`[Keep-Alive] Ping failed: ${e.message}`));
            };
            setTimeout(pingSelf, 5000);
            setInterval(pingSelf, 300000);
        }

        // 5. Login to Discord
        if (!process.env.DISCORD_TOKEN) {
            throw new Error('DISCORD_TOKEN is missing from environment variables!');
        }
        const token = process.env.DISCORD_TOKEN.trim();
        console.log('[Discord] Attempting login...');
        await client.login(token);
        console.log('[Discord] Login call completed (waiting for ClientReady).');

    } catch (error) {
        console.error('FATAL STARTUP ERROR:', error);
        process.exit(1);
    }
}

// Global Error Handlers (Safety Net)
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Execute Main
main();
