const { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = async (interaction) => {
    const portalUrl = process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL}/portal.html` : null;

    if (!portalUrl) {
        return interaction.reply({
            content: '❌ ポータルのURLが設定されていません。管理者に連絡してください。',
            flags: MessageFlags.Ephemeral
        });
    }

    const embed = {
        title: '🌐 購入者セルフポータル',
        description: 'こちらからライセンスの状況確認や一時停止・再開などの操作が行えます。',
        color: 0x3498db,
        fields: [
            { name: '機能', value: '• ライセンス一覧の確認\n• 有効期限・ステータスの確認\n• サブスクリプションの一時停止・再開' }
        ],
        footer: { text: 'Akatsuki License System' }
    };

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('ポータルを開く')
            .setURL(portalUrl)
            .setStyle(ButtonStyle.Link)
    );

    await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral
    });
};
