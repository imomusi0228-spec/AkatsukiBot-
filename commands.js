const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { handleSupportVCButton, handleDeleteVCButton } = require('./handlers/buttonHandler');

const adminCommands = [
    new SlashCommandBuilder()
        .setName('sync')
        .setDescription('サブスクリプションとロールを手動で同期します')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('setup_vc')
        .setDescription('サポートVC作成パネルを設置します')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

const publicCommands = [
    new SlashCommandBuilder()
        .setName('activate')
        .setDescription('サーバーのサブスクリプションを有効化します')
        .addStringOption(option =>
            option.setName('guild_id').setDescription('サーバーID (サーバー内で使用する場合は省略可)').setRequired(false))
        .addStringOption(option =>
            option.setName('key').setDescription('ライセンスキーまたはBooth注文番号').setRequired(false))
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

    if (['sync', 'activate', 'setup_vc'].includes(interaction.commandName)) {
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
