const { SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('list')
        .setDescription('List all active subscriptions'),
    new SlashCommandBuilder()
        .setName('check')
        .setDescription('Check subscription status for a server')
        .addStringOption(option =>
            option.setName('server_id').setDescription('Server ID').setRequired(true)),
    new SlashCommandBuilder()
        .setName('sync')
        .setDescription('Manually sync subscriptions with roles'),
    new SlashCommandBuilder()
        .setName('activate')
        .setDescription('Activate subscription for a server')
        .addStringOption(option =>
            option.setName('server_id').setDescription('Server ID').setRequired(true)),
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check bot health and status')
];

async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return;

    if (['list', 'check', 'sync', 'activate', 'status'].includes(interaction.commandName)) {
        try {
            // Dynamic import based on command name
            // Note: Use commandName directly as filenames match (list.js, check.js, sync.js)
            const commandHandler = require(`./subcommands/${interaction.commandName}`);
            await commandHandler(interaction);
        } catch (error) {
            console.error(`Error executing command ${interaction.commandName}:`, error);
            // Only reply if not already replied/deferred
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'エラーが発生しました。', ephemeral: true });
            } else {
                await interaction.followUp({ content: 'エラーが発生しました。', ephemeral: true });
            }
        }
    }
}

module.exports = { commands, handleInteraction };
