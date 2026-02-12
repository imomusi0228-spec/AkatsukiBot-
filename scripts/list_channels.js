const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    try {
        const guild = await client.guilds.fetch(process.env.SUPPORT_GUILD_ID);
        const channels = await guild.channels.fetch();
        const fs = require('fs');
        let results = 'All Channels in Support Guild:\n';
        channels.forEach(ch => {
            results += `${ch.id}: #${ch.name} (${ch.type})\n`;
        });
        fs.writeFileSync('all_channels.txt', results);
        console.log('All channels written to all_channels.txt');
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
