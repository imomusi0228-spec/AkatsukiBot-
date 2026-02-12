const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log('--- Current Guilds ---');
    client.guilds.cache.forEach(g => {
        console.log(`[Guild] Name: ${g.name}, ID: ${g.id}`);
    });
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
