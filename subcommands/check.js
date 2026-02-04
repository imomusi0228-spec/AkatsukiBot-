const db = require('../db');
const { MessageFlags } = require('discord.js');

module.exports = async (interaction) => {
    const serverId = interaction.options.getString('server_id');
    const res = await db.query('SELECT * FROM subscriptions WHERE server_id = $1', [serverId]);

    if (res.rows.length === 0) {
        await interaction.reply({ content: 'このサーバーの登録情報は見つかりませんでした。', flags: MessageFlags.Ephemeral });
    } else {
        const sub = res.rows[0];
        const expiry = sub.expiry_date ? new Date(sub.expiry_date).toLocaleDateString() : '無期限';
        const status = sub.is_active ? 'Active' : 'Inactive';
        await interaction.reply({ content: `**Server:** ${sub.server_id}\n**User:** ${sub.user_id}\n**Tier:** ${sub.plan_tier}\n**Status:** ${status}\n**Expires:** ${expiry}\n**Notes:** ${sub.notes || 'なし'}`, flags: MessageFlags.Ephemeral });
    }
};
