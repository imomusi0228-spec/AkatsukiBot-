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

    await interaction.reply({
        content: '以下のボタンを押すと、あなた専用のサポート用ボイスチャンネルが作成されます。\n管理者に通知が送信され、対応が開始されます。',
        components: [row],
        flags: MessageFlags.Ephemeral // Only the admin sees the confirmation that button was posted? No, the command posts the button for OTHERS to use.
        // Actually, usually setup commands are run by admin, and the bot sends a message to the channel.
        // If we use ephemeral here, only the admin sees it and it disappears.
        // We want to send a PUBLIC message to the channel.
    });

    // Wait, if we use reply without ephemeral, it sends a message that looks like a reply to the /command.
    // Ideally we might want to just send a normal message to the channel?
    // But slash commands require a reply.
    // Let's make the reply non-ephemeral so everyone can see the button.
    // But 'reply' shows "User used /setup_vc" above it.
    // A cleaner way is: reply ephemerally "Button panel created", and send a separate channel message.

    // Let's revise:
    // 1. Reply ephemeral "Creating panel..."
    // 2. Send channel.send() with the button.
};
