const db = require('../db');
require('dotenv').config();

const ROLES = {
    'ProMonthly': process.env.ROLE_PRO_MONTHLY,
    'ProYearly': process.env.ROLE_PRO_YEARLY,
    'ProPlusMonthly': process.env.ROLE_PRO_PLUS_MONTHLY,
    'ProPlusYearly': process.env.ROLE_PRO_PLUS_YEARLY
};

module.exports = async (interaction) => {
    const serverId = interaction.options.getString('server_id');
    const userId = interaction.user.id;
    const member = interaction.member;

    if (!member) {
        return interaction.reply({ content: 'このコマンドはサーバー内でのみ実行できます。', ephemeral: true });
    }

    // Determine Tier and Duration based on roles
    let tier = null;
    let durationMonths = 0;

    // Priority: Pro+ > Pro, Yearly > Monthly
    if (member.roles.cache.has(ROLES['ProPlusYearly'])) {
        tier = 'Pro+';
        durationMonths = 12;
    } else if (member.roles.cache.has(ROLES['ProPlusMonthly'])) {
        tier = 'Pro+';
        durationMonths = 1;
    } else if (member.roles.cache.has(ROLES['ProYearly'])) {
        tier = 'Pro';
        durationMonths = 12;
    } else if (member.roles.cache.has(ROLES['ProMonthly'])) {
        tier = 'Pro';
        durationMonths = 1;
    }

    if (!tier) {
        return interaction.reply({ content: '有効なサブスクリプションロール（ProまたはPro+）が見つかりませんでした。Boothでの購入状況を確認してください。', ephemeral: true });
    }

    // Check existing subscriptions for this user
    try {
        const existing = await db.query('SELECT * FROM subscriptions WHERE user_id = $1 AND is_active = TRUE', [userId]);
        if (existing.rows.length > 0) {
            // Already has a server registered?
            // User requested 1 server limit.
            // Check if it's the SAME server (reactivation/update) or different
            const currentSub = existing.rows[0];
            if (currentSub.server_id !== serverId) {
                return interaction.reply({ content: `既に別のサーバー (ID: ${currentSub.server_id}) が登録されています。1ユーザーにつき1サーバーまで登録可能です。`, ephemeral: true });
            }
            // If same server, maybe update? For now, just reject or say "Already active"
            // Let's allow updating if it's the same server (e.g. extending or re-applying)
        }

        // Calculate expiry
        const now = new Date();
        const expiryDate = new Date(now.setMonth(now.getMonth() + durationMonths));

        await db.query(`
            INSERT INTO subscriptions (server_id, user_id, plan_tier, expiry_date, is_active)
            VALUES ($1, $2, $3, $4, TRUE)
            ON CONFLICT (server_id) DO UPDATE 
            SET user_id = EXCLUDED.user_id, 
                plan_tier = EXCLUDED.plan_tier, 
                expiry_date = EXCLUDED.expiry_date, 
                is_active = TRUE,
                notes = COALESCE(subscriptions.notes, '') || E'\\n[Activate] Self-service activation'
        `, [serverId, userId, tier, expiryDate]);

        await db.query('INSERT INTO subscription_logs (server_id, action, details) VALUES ($1, $2, $3)',
            [serverId, 'ACTIVATE_SELF', `Tier: ${tier}, Exp: ${expiryDate.toLocaleDateString()}`]);

        await interaction.reply({ content: `✅ サーバー (ID: ${serverId}) を有効化しました！\n**Tier:** ${tier}\n**有効期限:** ${expiryDate.toLocaleDateString()}`, ephemeral: true });

    } catch (err) {
        console.error(err);
        await interaction.reply({ content: 'エラーが発生しました。管理者に連絡してください。', ephemeral: true });
    }
};
