const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = async (interaction) => {
    // Only administrators should be able to run this (already checked in commands.js usually, but good to be safe)
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: 'このコマンドを実行する権限がありません。', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('🎫 ライセンス有効化の申請')
        .setDescription(
            '以下のボタンを押して、ライセンス有効化の申請を開始してください。\n\n' +
            '**【申請に必要な情報】**\n' +
            '・購入者名 (BOOTH の注文履歴の名前)\n' +
            '・有効化したいサーバーの ID\n' +
            '・希望するプラン (Pro / Pro+ / Trial Pro / Trial Pro+)\n\n' +
            '※ 申請後、管理者が内容を確認してライセンスを発行します。'
        )
        .setColor(0x0099FF)
        .setFooter({ text: 'Akatsuki Bot License System' })
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('start_application')
                .setLabel('申請を開始する')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📝')
        );

    await interaction.reply({ content: '申請パネルを設置しました。', ephemeral: true });
    await interaction.channel.send({ embeds: [embed], components: [row] });
};
