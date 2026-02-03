const db = require('../db');

module.exports = async (interaction) => {
    const serverId = interaction.options.getString('server_id');
    const content = interaction.options.getString('content');

    await db.query('UPDATE subscriptions SET notes = COALESCE(notes, \'\') || E\'\\n\' || $1 WHERE server_id = $2', [content, serverId]);
    await db.query('INSERT INTO subscription_logs (server_id, action, details) VALUES ($1, $2, $3)', [serverId, 'NOTE_UPDATE', content]);

    await interaction.reply({ content: `サーバー ${serverId} にメモを追加しました。`, ephemeral: true });
};
