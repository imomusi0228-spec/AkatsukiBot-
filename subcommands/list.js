const db = require('../db');

module.exports = async (interaction) => {
    const res = await db.query('SELECT * FROM subscriptions WHERE is_active = TRUE ORDER BY expiry_date ASC');
    if (res.rows.length === 0) {
        await interaction.reply('有効なサブスクリプションはありません。');
        return;
    }
    const list = res.rows.map(row => {
        const expiry = row.expiry_date ? new Date(row.expiry_date).toLocaleDateString() : '無期限';
        return `ID: ${row.server_id} | Tier: ${row.plan_tier} | Exp: ${expiry}`;
    }).join('\n');
    await interaction.reply({ content: `**Active Subscriptions:**\n${list}`, ephemeral: true });
};
