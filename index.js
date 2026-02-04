const { Client, GatewayIntentBits, REST, Routes, Events } = require('discord.js');
const { initDB } = require('./db');
const { commands, handleInteraction } = require('./commands');
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

client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    try {
        await initDB();

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

        console.log('Started refreshing application (/) commands.');

        // Convert commands to JSON for registration
        const commandsJson = commands.map(cmd => cmd.toJSON());

        // Clear global commands to avoid duplicates
        await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
        console.log('Successfully cleared global application (/) commands.');

        // Register guild commands
        const guildId = process.env.SUPPORT_GUILD_ID;
        if (guildId) {
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, guildId),
                { body: commandsJson },
            );
            console.log(`Successfully reloaded application (/) commands for guild ${guildId}.`);
        } else {
            console.warn('SUPPORT_GUILD_ID is not set. Skipping guild command registration.');
        }

        console.log('Successfully reloaded application (/) commands.');

        // Initial sync
        await syncSubscriptions(client);
        await checkExpirations(client);
        // Sync every hour
        setInterval(() => syncSubscriptions(client), 3600000);
        setInterval(() => checkExpirations(client), 3600000);

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

client.login(process.env.DISCORD_TOKEN);
