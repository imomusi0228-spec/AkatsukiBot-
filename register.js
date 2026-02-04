const { REST, Routes } = require('discord.js');
const { adminCommands, publicCommands } = require('./commands');
require('dotenv').config();

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
    try {
        console.log('Started refreshing application (/) commands.');

        const clientId = process.env.DISCORD_CLIENT_ID || (await rest.get(Routes.user('@me'))).id;

        // 1. Global Commands: Only 'activate' (publicCommands)
        const publicCommandsJson = publicCommands.map(cmd => cmd.toJSON());
        console.log('Registering GLOBAL application commands...');
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: publicCommandsJson },
        );
        console.log('Successfully reloaded GLOBAL application (/) commands (activate only).');

        // 2. Guild Commands: Admin commands (adminCommands) -> Support Guild Only
        const adminCommandsJson = adminCommands.map(cmd => cmd.toJSON());
        const guildId = process.env.SUPPORT_GUILD_ID;

        if (guildId) {
            console.log(`Registering GUILD application commands for guild ${guildId}...`);
            await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: adminCommandsJson },
            );
            console.log(`Successfully reloaded GUILD application (/) commands for guild ${guildId} (Admin tools).`);
        } else {
            console.warn('SUPPORT_GUILD_ID is not set. Skipping guild command registration.');
        }

        console.log('Finished refreshing application (/) commands.');
    } catch (error) {
        console.error('Error during command registration:', error);
        process.exit(1);
    }
}

registerCommands();
