const db = require('../db');
const { MessageFlags } = require('discord.js');
require('dotenv').config();

const ROLES = {
    'ProMonthly': process.env.ROLE_PRO_MONTHLY,
    'ProYearly': process.env.ROLE_PRO_YEARLY,
    'ProPlusMonthly': process.env.ROLE_PRO_PLUS_MONTHLY,
    'ProPlusYearly': process.env.ROLE_PRO_PLUS_YEARLY
};

module.exports = async (interaction) => {
    const inputServerId = interaction.options.getString('server_id');
    const serverId = inputServerId ? inputServerId.trim() : '';
    const userId = interaction.user.id;
    const member = interaction.member;

    if (!member) {
        return interaction.reply({ content: 'このコマンドはサーバー内でのみ実行できます。', flags: MessageFlags.Ephemeral });
    }

    // Validation: Check if server ID is numeric and 17-19 characters
    if (!/^\d{17,19}$/.test(serverId)) {
        return interaction.reply({ content: '❌ **無効なサーバーIDです。**\n正しいIDを入力してください。', flags: MessageFlags.Ephemeral });
    }

    // Check if bot is present in the target guild
    // This is not strictly blocking (we can allow activating for a server the bot will join later), 
    // but it's good practice to warn or check.
    // Let's just warn if not found, but proceed (or maybe blocking is safer to avoid typos).
    // Given the user wants "strictness", let's BLOCK if bot is not in guild? 
    // Actually, "bot is not in server" means we can't manage it. So blocking is better.
    const targetGuild = await interaction.client.guilds.fetch(serverId).catch(() => null);
    if (!targetGuild) {
        return interaction.reply({ content: `❌ **Botが指定されたサーバー (ID: ${serverId}) に参加していません。**\n先にBotをサーバーに招待してください。`, flags: MessageFlags.Ephemeral });
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
        return interaction.reply({
            content: `❌ **有効なサブスクリプションロールが見つかりませんでした。**\n\nこの機能を使用するには、ProまたはPro+プランの支援者ロールが必要です。\nもし既に支援済みの場合は、以下の点をご確認ください：\n1. サポートサーバーに参加しているか\n2. DiscordとBooth/PixivFANBOXが連携されているか`,
            flags: MessageFlags.Ephemeral
        });
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
                return interaction.reply({ content: `既に別のサーバー (ID: ${currentSub.server_id}) が登録されています。1ユーザーにつき1サーバーまで登録可能です。`, flags: MessageFlags.Ephemeral });
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

        await interaction.reply({ content: `✅ サーバー (ID: ${serverId}) を有効化しました！\n**Tier:** ${tier}\n**有効期限:** ${expiryDate.toLocaleDateString()}`, flags: MessageFlags.Ephemeral });

    } catch (err) {
        console.error(err);
        await interaction.reply({ content: 'エラーが発生しました。管理者に連絡してください。', flags: MessageFlags.Ephemeral });
    }
};
