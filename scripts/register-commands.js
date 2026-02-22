const { REST, Routes } = require('discord.js');
const { adminCommands, publicCommands } = require('../commands');
require('dotenv').config();

const commands = [...publicCommands, ...adminCommands];

async function main() {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('[Register] Started refreshing application (/) commands.');

        const clientId = process.env.CLIENT_ID || (await rest.get(Routes.user('@me'))).id;

        // 1. Global Commands (Public)
        // Note: Global commands take up to an hour to update, but are available in all servers.
        const publicJson = publicCommands.map(cmd => cmd.toJSON());
        if (publicJson.length > 0) {
            console.log(`[Register] Registering ${publicJson.length} global commands...`);
            await rest.put(Routes.applicationCommands(clientId), { body: publicJson });
        }

        // 2. Guild Commands (Admin/Support)
        // Note: Guild commands update instantly but only for the specific guild.
        if (process.env.SUPPORT_GUILD_ID && adminCommands.length > 0) {
            console.log(`[Register] Registering ${adminCommands.length} guild commands to ${process.env.SUPPORT_GUILD_ID}...`);
            const adminJson = adminCommands.map(cmd => cmd.toJSON());
            await rest.put(Routes.applicationGuildCommands(clientId, process.env.SUPPORT_GUILD_ID), { body: adminJson });
        }

        console.log('[Register] Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('[Register] Error:', error);
        process.exit(1);
    }
}

main();
