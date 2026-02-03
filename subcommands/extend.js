const db = require('../db');

// Helper
function calculateExpiryDate(duration, startDate = new Date()) {
    const match = duration.match(/^(\d+)([dmy])$/);
    if (!match) return null;
    const amount = parseInt(match[1]);
    const unit = match[2];

    const expiry = new Date(startDate);
    if (unit === 'd') expiry.setDate(expiry.getDate() + amount);
    else if (unit === 'm') expiry.setMonth(expiry.getMonth() + amount);
    else if (unit === 'y') expiry.setFullYear(expiry.getFullYear() + amount);

    return expiry;
}

module.exports = async (interaction) => {
    const serverId = interaction.options.getString('server_id');
    const duration = interaction.options.getString('duration');

    const res = await db.query('SELECT expiry_date FROM subscriptions WHERE server_id = $1', [serverId]);
    if (res.rows.length === 0) {
        await interaction.reply({ content: 'サーバーが見つかりません。先に登録してください。', ephemeral: true });
        return;
    }

    let currentExpiry = res.rows[0].expiry_date ? new Date(res.rows[0].expiry_date) : new Date();
    if (currentExpiry < new Date()) currentExpiry = new Date();

    const newExpiry = calculateExpiryDate(duration, currentExpiry);
    if (!newExpiry) {
        await interaction.reply({ content: '期間の形式が正しくありません (例: 30d, 1y)', ephemeral: true });
        return;
    }

    await db.query('UPDATE subscriptions SET expiry_date = $1, is_active = TRUE WHERE server_id = $2', [newExpiry, serverId]);
    await db.query('INSERT INTO subscription_logs (server_id, action, details) VALUES ($1, $2, $3)', [serverId, 'EXTEND', `New Exp: ${newExpiry}`]);

    await interaction.reply({ content: `サーバー ${serverId} の期間を延長しました。新しい期限: ${newExpiry.toLocaleDateString()}`, ephemeral: true });
};
