const { ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require('discord.js');

module.exports = async (interaction) => {
    // Check permissions (Admin only)
    // Permission check is already handled by setDefaultMemberPermissions in commands.js registration,
    // but good to have a backup or if we want specific custom logic.

    const button = new ButtonBuilder()
        .setCustomId('create_support_vc')
        .setLabel('サポートVCを作成')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎧');

    const row = new ActionRowBuilder()
        .addComponents(button);

    // Send the panel as a normal message to the channel
    await interaction.channel.send({
        content: '以下のボタンを押すと、あなた専用のサポート用ボイスチャンネルが作成されます。\n管理者に通知が送信され、対応が開始されます。',
        components: [row]
    });

    // Reply to the command ephemerally to confirm completion
    await interaction.reply({
        content: '✅ サポートVC作成パネルを設置しました。',
        flags: MessageFlags.Ephemeral
    });
};
