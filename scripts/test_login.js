const { Client, GatewayIntentBits, Events } = require('discord.js');
require('dotenv').config();

console.log('Starting Test Login Script...');

if (!process.env.DISCORD_TOKEN) {
    console.error('ERROR: DISCORD_TOKEN missing from .env');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
    ],
});

client.once(Events.ClientReady, c => {
    console.log(`SUCCESS: Logged in as ${c.user.tag}`);
    process.exit(0);
});

client.on('error', err => {
    console.error('CLIENT ERROR:', err);
});

console.log(`Token prefix: ${process.env.DISCORD_TOKEN.substring(0, 5)}...`);
console.log('Attemping client.login()...');

client.login(process.env.DISCORD_TOKEN)
    .catch(err => {
        console.error('LOGIN FAILED:', err);
        process.exit(1);
    });
