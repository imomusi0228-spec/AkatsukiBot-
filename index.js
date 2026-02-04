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
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.MessageContent,
    ],
});

client.once(Events.ClientReady, async () => {
    const setBotPresence = () => {
        client.user.setPresence({
            activities: [{ name: '/help | 管理ツール', type: ActivityType.Playing }],
            status: 'online'
        });
    };

    console.log(`Logged in as ${client.user.tag}!`);
    setBotPresence();

    try {
        await initDB();

        console.log('Skipping command registration on startup. Use "npm run register" if changes are needed.');

        // Initial sync
        await syncSubscriptions(client);
        await checkExpirations(client);
        // Sync every 5 minutes
        setInterval(() => syncSubscriptions(client), 300000);
        setInterval(() => checkExpirations(client), 300000);

        // Force presence update every 10 minutes
        setInterval(() => {
            console.log('[Presence] Refreshing presence state...');
            setBotPresence();
        }, 600000);

        // Start Web Server
        startServer(client);

        // Keep-Alive Mechanism
        // Prioritize PUBLIC_URL, fallback to RENDER_EXTERNAL_URL (Render.com default)
        const PUBLIC_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;

        if (PUBLIC_URL) {
            console.log(`Setting up Keep-Alive for: ${PUBLIC_URL}`);

            // Function to ping
            const pingSelf = () => {
                fetch(PUBLIC_URL)
                    .then(res => {
                        if (res.ok) console.log(`[Keep-Alive] Ping successful: ${res.status}`);
                        else console.warn(`[Keep-Alive] Ping returned status: ${res.status}`);
                    })
                    .catch(e => console.error(`[Keep-Alive] Ping failed: ${e.message}`));
            };

            // Initial ping
            pingSelf();

            // Interval ping (every 5 minutes)
            setInterval(pingSelf, 300000);
        } else {
            console.warn('WARNING: No PUBLIC_URL or RENDER_EXTERNAL_URL found. Keep-Alive is disabled. Bot may sleep.');
        }

    } catch (error) {
        console.error(error);
    }
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
    if (client.user) {
        client.user.setPresence({
            activities: [{ name: '/help | 管理ツール', type: ActivityType.Playing }],
            status: 'online'
        });
    }
});

client.on('shardResume', (id, replayedEvents) => {
    console.log(`Shard ${id} resumed.`);
    if (client.user) {
        client.user.setPresence({
            activities: [{ name: '/help | 管理ツール', type: ActivityType.Playing }],
            status: 'online'
        });
    }
});

client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('Failed to login:', error);
    process.exit(1);
});

// Global error handling to prevent silent validation failures
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});
