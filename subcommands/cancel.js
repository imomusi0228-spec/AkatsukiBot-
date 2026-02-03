const db = require('../db');

module.exports = async (interaction) => {
    const serverId = interaction.options.getString('server_id');
    await db.query('UPDATE subscriptions SET is_active = FALSE WHERE server_id = $1', [serverId]);
    await db.query('INSERT INTO subscription_logs (server_id, action, details) VALUES ($1, $2, $3)', [serverId, 'CANCEL', 'Cancelled manually']);
    await interaction.reply({ content: `サーバー ${serverId} のサブスクリプションを停止しました。`, ephemeral: true });
};
