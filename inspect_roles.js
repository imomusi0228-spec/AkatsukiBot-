const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log('--- Connected Guilds ---');
    client.guilds.cache.forEach(g => {
        console.log(`Name: ${g.name}, ID: ${g.id}`);
    });
    console.log('------------------------');
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('Login Failed:', err.message);
    process.exit(1);
});
