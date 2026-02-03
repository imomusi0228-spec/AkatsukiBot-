const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const { initDB } = require('./db');
const { commands, handleInteraction } = require('./commands');
const { syncSubscriptions } = require('./sync');
const { startServer } = require('./server');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
    ],
});

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    try {
        await initDB();

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

        console.log('Started refreshing application (/) commands.');

        // Convert commands to JSON for registration
        const commandsJson = commands.map(cmd => cmd.toJSON());

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commandsJson },
        );

        console.log('Successfully reloaded application (/) commands.');

        // Initial sync
        await syncSubscriptions(client);
        // Sync every hour
        setInterval(() => syncSubscriptions(client), 3600000);

        // Start Web Server
        startServer(client);

        // Self-Ping for Keep-Alive
        const PUBLIC_URL = process.env.PUBLIC_URL;
        if (PUBLIC_URL) {
            console.log(`Setting up keep-alive for ${PUBLIC_URL}`);
            // Initial ping
            fetch(PUBLIC_URL).catch(e => console.error('Initial ping failed:', e.message));

            setInterval(() => {
                fetch(PUBLIC_URL)
                    .then(() => console.log('Keep-Alive ping sent'))
                    .catch(e => console.error('Keep-Alive ping failed:', e.message));
            }, 300000); // 5 minutes
        } else {
            console.warn('PUBLIC_URL not set, keep-alive disabled.');
        }

    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', handleInteraction);

client.login(process.env.DISCORD_TOKEN);
