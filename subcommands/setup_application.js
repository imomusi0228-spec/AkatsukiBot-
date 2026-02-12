const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = async (interaction) => {
    // Only administrators should be able to run this
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: 'このコマンドを実行する権限がありません。', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('🎫 ライセンス有効化の申請')
        .setDescription(
            '以下のメニューから**希望するプランを選択**して、申請を開始してください。\n\n' +
            '**【申請に必要な情報】**\n' +
            '・購入者名 (BOOTH の注文履歴の名前)\n' +
            '・有効化したいサーバーの ID\n\n' +
            '※ 申請後、管理者が内容を確認してライセンスを発行します。'
        )
        .setColor(0x0099FF)
        .setFooter({ text: 'Akatsuki Bot License System' })
        .setTimestamp();

    const select = new StringSelectMenuBuilder()
        .setCustomId('select_tier')
        .setPlaceholder('希望するプランを選択してください')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Pro')
                .setDescription('ベーシックな有料プラン (1サーバー)')
                .setEmoji('💎')
                .setValue('Pro'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Pro+')
                .setDescription('高度な機能を備えたプラン (3サーバー)')
                .setEmoji('✨')
                .setValue('Pro+'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Trial Pro')
                .setDescription('Proプランの14日間無料体験')
                .setEmoji('🎁')
                .setValue('Trial Pro'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Trial Pro+')
                .setDescription('Pro+プランの7日間無料体験')
                .setEmoji('🚀')
                .setValue('Trial Pro+')
        );

    const row = new ActionRowBuilder().addComponents(select);

    await interaction.reply({ content: '申請パネルを設置しました。', ephemeral: true });
    await interaction.channel.send({ embeds: [embed], components: [row] });
};
