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
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('setup_application')
        .setDescription('ライセンス申請パネルを設置します')
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
        } else if (interaction.customId === 'start_application') {
            const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

            const modal = new ModalBuilder()
                .setCustomId('application_modal')
                .setTitle('ライセンス申請');

            const boothInput = new TextInputBuilder()
                .setCustomId('booth_name')
                .setLabel('購入者名 (BOOTH)')
                .setPlaceholder('例: 山田 太郎')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const userInput = new TextInputBuilder()
                .setCustomId('user_id')
                .setLabel('有効化するユーザーID')
                .setValue(interaction.user.id)
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const guildInput = new TextInputBuilder()
                .setCustomId('guild_id')
                .setLabel('有効化するサーバーID')
                .setPlaceholder('例: 123456789012345678')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const tierInput = new TextInputBuilder()
                .setCustomId('tier_choice')
                .setLabel('希望プラン (Pro / Pro+ / Trial Pro / Trial Pro+)')
                .setPlaceholder('Pro / Pro+ など')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(boothInput),
                new ActionRowBuilder().addComponents(userInput),
                new ActionRowBuilder().addComponents(guildInput),
                new ActionRowBuilder().addComponents(tierInput)
            );

            await interaction.showModal(modal);
        }
        return;
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'application_modal') {
            const { handleApplicationModal } = require('./handlers/applicationHandler');
            await handleApplicationModal(interaction);
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    if (['sync', 'activate', 'setup_vc', 'setup_application'].includes(interaction.commandName)) {
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
