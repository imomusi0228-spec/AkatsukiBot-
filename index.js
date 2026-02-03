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

    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', handleInteraction);

client.login(process.env.DISCORD_TOKEN);
