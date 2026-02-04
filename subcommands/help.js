const { EmbedBuilder } = require('discord.js');
require('dotenv').config();

module.exports = async (interaction) => {
    const boothUrl = process.env.BOOTH_URL || 'https://booth.pm/';

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('AkatsukiBot ヘルプ')
        .setDescription('サーバー管理Bot「AkatsukiBot」の使い方です。\n各コマンドはスラッシュコマンド (`/`) から実行してください。')
        .addFields(
            { name: '📋 /list', value: '現在の有効なサブスクリプション一覧を表示します。' },
            { name: '🔍 /check [server_id]', value: '指定したサーバーのサブスクリプション状況を確認します。' },
            { name: '🔄 /sync', value: '管理者用: ロールの状態とデータベースを強制同期します。' },
            { name: '✅ /activate [server_id]', value: '購入したロールを使用して、指定したサーバーを有効化します。' },
            { name: '📊 /status', value: 'Botのシステムステータスを表示します。' },
            { name: '❓ /help', value: 'このヘルプを表示します。' }
        )
        .addFields(
            { name: '🛒 プランの購入・更新', value: `[Boothの商品ページはこちら](${boothUrl})` },
            { name: '🆘 サポート', value: '不明な点がある場合はサポートサーバーまでお問い合わせください。' }
        )
        .setFooter({ text: 'AkatsukiBot Management System' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
};
