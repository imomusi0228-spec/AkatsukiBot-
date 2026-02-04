const { Client, GatewayIntentBits, REST, Routes, Events, ActivityType } = require('discord.js');
const { initDB } = require('./db');
const { commands, adminCommands, publicCommands, handleInteraction } = require('./commands');
const { syncSubscriptions } = require('./sync');
const { checkExpirations } = require('./expiry');
const { startServer } = require('./server');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
    ],
});

// 1. Core initialization (Run immediately to satisfy health checks)
startServer(client);
console.log('Web Server started.');

(async () => {
    try {
        await initDB();
        console.log('Database initialized.');

        // Keep-Alive Mechanism
        const PUBLIC_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
        if (PUBLIC_URL) {
            console.log(`Setting up Keep-Alive for: ${PUBLIC_URL}`);
            const pingSelf = () => {
                fetch(PUBLIC_URL)
                    .then(res => {
                        if (res.ok) console.log(`[Keep-Alive] Ping successful: ${res.status}`);
                        else console.warn(`[Keep-Alive] Ping returned status: ${res.status}`);
                    })
                    .catch(e => console.error(`[Keep-Alive] Ping failed: ${e.message}`));
            };
            // Delay first ping slightly to ensure server is ready
            setTimeout(pingSelf, 5000);
            setInterval(pingSelf, 300000);
        }
    } catch (err) {
        console.error('Core background initialization error:', err);
    }
})();

const setBotPresence = () => {
    if (client.user) {
        client.user.setPresence({
            activities: [{ name: '/help | 管理ツール', type: ActivityType.Playing }],
            status: 'online'
        });
    }
};

client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    setBotPresence();

    console.log('Skipping command registration on startup. Use "npm run register" if changes are needed.');

    // Heavy sync tasks run in background
    (async () => {
        try {
            await syncSubscriptions(client);
            await checkExpirations(client);
        } catch (err) {
            console.error('Background sync/expiry error:', err);
        }
    })();

    // Sync every 5 minutes
    setInterval(() => syncSubscriptions(client), 300000);
    setInterval(() => checkExpirations(client), 300000);
});

client.on('interactionCreate', handleInteraction);

client.on('error', error => {
    console.error('Discord Client Error:', error);
});

client.on('shardError', error => {
    console.error('A websocket connection encountered an error:', error);
});

client.on('shardDisconnect', (event, id) => {
    console.log(`Shard ${id} disconnected. Code: ${event.code}, Reason: ${event.reason}`);
});

client.on('shardReady', (id, unavailableGuilds) => {
    console.log(`Shard ${id} is ready.`);
    setBotPresence();
});

client.on('shardResume', (id, replayedEvents) => {
    console.log(`Shard ${id} resumed.`);
    setBotPresence();
});

console.log('Attempting to login to Discord...');
if (!process.env.DISCORD_TOKEN) {
    console.error('DISCORD_TOKEN is not defined in environment variables!');
    process.exit(1);
}
console.log(`Token prefix: ${process.env.DISCORD_TOKEN.substring(0, 10)}...`);

client.login(process.env.DISCORD_TOKEN)
    .then(() => {
        console.log('client.login() prompt returned successfully.');
    })
    .catch(error => {
        console.error('Failed to login:', error);
        process.exit(1);
    });

// Global error handling to prevent silent validation failures
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Exit process on uncaught exception to allow platform (Render) to restart the instance
    process.exit(1);
});
