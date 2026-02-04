const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { handleSupportVCButton, handleDeleteVCButton } = require('./handlers/buttonHandler');

const adminCommands = [
    new SlashCommandBuilder()
        .setName('sync')
        .setDescription('Manually sync subscriptions with roles')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('setup_vc')
        .setDescription('Setup Support VC creation panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('generate_key')
        .setDescription('Generate a one-time license key')
        .addStringOption(option =>
            option.setName('tier').setDescription('Plan tier (Pro/Pro+)').setRequired(true)
                .addChoices({ name: 'Pro', value: 'Pro' }, { name: 'Pro+', value: 'Pro+' }))
        .addIntegerOption(option =>
            option.setName('months').setDescription('Duration in months').setRequired(true))
        .addStringOption(option =>
            option.setName('note').setDescription('Memo for this key'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

const publicCommands = [
    new SlashCommandBuilder()
        .setName('activate')
        .setDescription('Activate subscription for a server')
        .addStringOption(option =>
            option.setName('server_id').setDescription('Server ID (Optional if used in the server)').setRequired(false))
        .addStringOption(option =>
            option.setName('key').setDescription('License Key or Booth Order Number').setRequired(false)),
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check if the bot is alive')
];

const commands = [...adminCommands, ...publicCommands];

async function handleInteraction(interaction) {
    if (interaction.isButton()) {
        if (interaction.customId === 'create_support_vc') {
            await handleSupportVCButton(interaction);
        } else if (interaction.customId === 'delete_support_vc') {
            await handleDeleteVCButton(interaction);
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    if (['sync', 'activate', 'setup_vc', 'generate_key', 'ping'].includes(interaction.commandName)) {
        try {
            const commandHandler = require(`./subcommands/${interaction.commandName}`);
            await commandHandler(interaction);
        } catch (error) {
            console.error(`Error executing command ${interaction.commandName}:`, error);
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: 'エラーが発生しました。', flags: MessageFlags.Ephemeral });
                } else if (interaction.deferred) {
                    await interaction.editReply({ content: 'エラーが発生しました。' });
                } else {
                    await interaction.followUp({ content: 'エラーが発生しました。', flags: MessageFlags.Ephemeral });
                }
            } catch (replyError) {
                console.error('Failed to send error message to user:', replyError);
            }
        }
    } else {
        try {
            await interaction.reply({ content: 'このコマンドは現在利用できないか、削除されました。', flags: MessageFlags.Ephemeral });
        } catch (e) {
            console.error('Failed to reply to unknown command:', e);
        }
    }
}

module.exports = { commands, adminCommands, publicCommands, handleInteraction };
