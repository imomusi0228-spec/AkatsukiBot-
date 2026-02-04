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

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

        console.log('Started refreshing application (/) commands.');

        // 1. Global Commands: Only 'activate' (publicCommands)
        const publicCommandsJson = publicCommands.map(cmd => cmd.toJSON());
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: publicCommandsJson },
        );
        console.log('Successfully reloaded GLOBAL application (/) commands (activate only).');

        // 2. Guild Commands: Admin commands (adminCommands) -> Support Guild Only
        const adminCommandsJson = adminCommands.map(cmd => cmd.toJSON());
        const guildId = process.env.SUPPORT_GUILD_ID;

        if (guildId) {
            // Note: If we want 'activate' to ALSO be in guild commands (for faster update/dev), we could include it,
            // but global registration overrides or merges. Usually global takes time to propagate.
            // For safety and clean separation: Global = activate, Guild = admin.
            // But if we want Admins to use activate quickly in support server, it's fine if it's global.
            // Let's just register adminCommands to the guild.

            await rest.put(
                Routes.applicationGuildCommands(client.user.id, guildId),
                { body: adminCommandsJson },
            );
            console.log(`Successfully reloaded GUILD application (/) commands for guild ${guildId} (Admin tools).`);
        } else {
            console.warn('SUPPORT_GUILD_ID is not set. Skipping guild command registration.');
        }

        console.log('Successfully reloaded application (/) commands.');

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
