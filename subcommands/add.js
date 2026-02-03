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
    const userId = interaction.options.getString('user_id');
    const tier = interaction.options.getString('tier');
    const duration = interaction.options.getString('duration');

    let expiryDate = null;
    if (duration) {
        expiryDate = calculateExpiryDate(duration);
        if (!expiryDate) {
            await interaction.reply({ content: '期間の形式が正しくありません (例: 30d, 1y)', ephemeral: true });
            return;
        }
    }

    await db.query(
        'INSERT INTO subscriptions (server_id, user_id, plan_tier, expiry_date, is_active) VALUES ($1, $2, $3, $4, TRUE) ON CONFLICT (server_id) DO UPDATE SET user_id = EXCLUDED.user_id, plan_tier = EXCLUDED.plan_tier, expiry_date = EXCLUDED.expiry_date, is_active = TRUE',
        [serverId, userId, tier, expiryDate]
    );

    await db.query('INSERT INTO subscription_logs (server_id, action, details) VALUES ($1, $2, $3)', [serverId, 'CREATE', `Tier: ${tier}, Exp: ${expiryDate}`]);

    await interaction.reply({ content: `サーバー ${serverId} を Tier ${tier} で登録しました。`, ephemeral: true });
};
