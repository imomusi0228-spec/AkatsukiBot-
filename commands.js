const { SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('sub')
        .setDescription('Manage subscriptions')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all active subscriptions'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Check subscription status for a server')
                .addStringOption(option =>
                    option.setName('server_id').setDescription('Server ID').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a new subscription')
                .addStringOption(option => option.setName('server_id').setDescription('Server ID').setRequired(true))
                .addStringOption(option => option.setName('user_id').setDescription('User ID').setRequired(true))
                .addStringOption(option => option.setName('tier').setDescription('Plan Tier').setRequired(true))
                .addStringOption(option => option.setName('duration').setDescription('Duration (e.g. 30d, 1y)').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('extend')
                .setDescription('Extend subscription')
                .addStringOption(option => option.setName('server_id').setDescription('Server ID').setRequired(true))
                .addStringOption(option => option.setName('duration').setDescription('Duration to add (e.g. 30d)').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('cancel')
                .setDescription('Cancel subscription')
                .addStringOption(option => option.setName('server_id').setDescription('Server ID').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('note')
                .setDescription('Add a note to subscription')
                .addStringOption(option => option.setName('server_id').setDescription('Server ID').setRequired(true))
                .addStringOption(option => option.setName('content').setDescription('Note content').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('sync')
                .setDescription('Manually sync subscriptions with roles'))
];

async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'sub') {
        const subcommandName = interaction.options.getSubcommand();

        try {
            // Dynamic import based on subcommand name
            const subcommandHandler = require(`./subcommands/${subcommandName}`);
            await subcommandHandler(interaction);
        } catch (error) {
            console.error(`Error executing subcommand ${subcommandName}:`, error);
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
