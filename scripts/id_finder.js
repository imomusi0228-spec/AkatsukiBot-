const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    const guild = client.guilds.cache.find(g => g.name === 'Akatsuki-Bot');
    if (guild) {
        console.log(`FOUND_ID:${guild.id}`);
    } else {
        console.log('NOT_FOUND');
    }
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
