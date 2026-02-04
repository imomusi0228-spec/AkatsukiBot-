const { ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require('discord.js');

module.exports = async (interaction) => {
    // 1. Defer immediately to prevent interaction timeout
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const createButton = new ButtonBuilder()
        .setCustomId('create_support_vc')
        .setLabel('サポートVCを作成')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎧');

    const deleteButton = new ButtonBuilder()
        .setCustomId('delete_support_vc')
        .setLabel('通話を終了する')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🚫');

    const row = new ActionRowBuilder()
        .addComponents(createButton, deleteButton);

    try {
        // Send the panel as a normal message to the channel
        await interaction.channel.send({
            content: '以下のボタンを押すと、あなた専用のサポート用ボイスチャンネルが作成されます。\n管理者に通知が送信され、対応が開始されます。',
            components: [row]
        });

        // Reply to the command confirm completion
        await interaction.editReply({
            content: '✅ サポートVC作成パネルを設置しました。'
        });
    } catch (error) {
        console.error('Error in setup_vc:', error);
        await interaction.editReply({
            content: '❌ パネルの設置中にエラーが発生しました。'
        });
    }
};
