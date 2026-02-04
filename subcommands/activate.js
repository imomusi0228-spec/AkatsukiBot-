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
    // If input is provided, use it. Otherwise, use the current guild ID where the command is run.
    const serverId = inputServerId ? inputServerId.trim() : interaction.guildId;
    const userId = interaction.user.id;

    // We don't necessarily need "member" from the current guild for ROLE checking anymore,
    // because we will check the Support Server for roles.
    // However, if we are auto-detecting server ID (no input), we must be in a guild.
    if (!serverId) {
        return interaction.reply({ content: '❌ サーバーIDを指定するか、サーバー内でコマンドを実行してください。', flags: MessageFlags.Ephemeral });
    }

    // Validation checks
    if (!/^\d{17,19}$/.test(serverId)) {
        return interaction.reply({ content: '❌ **無効なサーバーIDです。**\n正しいIDを入力してください。', flags: MessageFlags.Ephemeral });
    }

    // Check if bot is present in the target guild
    const targetGuild = await interaction.client.guilds.fetch(serverId).catch(() => null);
    if (!targetGuild) {
        return interaction.reply({ content: `❌ **Botが指定されたサーバー (ID: ${serverId}) に参加していません。**\n先にBotをサーバーに招待してください。`, flags: MessageFlags.Ephemeral });
    }

    // Check if the specific AkatsukiBot (Service Bot) is present
    const SERVICE_BOT_ID = '1466095214161825873';
    const isServiceBotPresent = await targetGuild.members.fetch(SERVICE_BOT_ID).catch(() => null);

    if (!isServiceBotPresent) {
        return interaction.reply({
            content: `❌ **AkatsukiBot (ID: ${SERVICE_BOT_ID}) がサーバーに参加していません。**\nサブスクリプションを有効化するには、対象のサーバーにAkatsukiBotを招待してください。`,
            flags: MessageFlags.Ephemeral
        });
    }

    // === Role Verification against Support Server ===
    const SUPPORT_GUILD_ID = process.env.SUPPORT_GUILD_ID;
    if (!SUPPORT_GUILD_ID) {
        console.error('SUPPORT_GUILD_ID is not set in .env');
        return interaction.reply({ content: 'Botの設定エラーです（サポートサーバーID未設定）。管理者に連絡してください。', flags: MessageFlags.Ephemeral });
    }

    let supportMember = null;
    try {
        const supportGuild = await interaction.client.guilds.fetch(SUPPORT_GUILD_ID);
        supportMember = await supportGuild.members.fetch(userId);
    } catch (err) {
        // User not in support server or other error
        console.warn(`Failed to fetch member ${userId} from support guild: ${err.message}`);
    }

    if (!supportMember) {
        // Fallback checks (e.g. maybe allow if in current guild? No, requirement is support server role)
        const supportServerUrl = process.env.SUPPORT_SERVER_URL || 'https://discord.gg/your-support-server';
        return interaction.reply({
            content: `❌ **サポートサーバーでの権限確認に失敗しました。**\n\nサブスクリプションを有効化するには、Botのサポートサーバーに参加している必要があります。\n\n🆘 **サポートサーバー:** [参加する](${supportServerUrl})`,
            flags: MessageFlags.Ephemeral
        });
    }

    // Determine Tier and Duration based on roles in Support Server
    let tier = null;
    let durationMonths = 0;

    if (supportMember.roles.cache.has(ROLES['ProPlusYearly'])) {
        tier = 'Pro+';
        durationMonths = 12;
    } else if (supportMember.roles.cache.has(ROLES['ProPlusMonthly'])) {
        tier = 'Pro+';
        durationMonths = 1;
    } else if (supportMember.roles.cache.has(ROLES['ProYearly'])) {
        tier = 'Pro';
        durationMonths = 12;
    } else if (supportMember.roles.cache.has(ROLES['ProMonthly'])) {
        tier = 'Pro';
        durationMonths = 1;
    }

    if (!tier) {
        console.log(`[Debug] User ${userId} has roles:`, supportMember.roles.cache.map(r => `${r.name} (${r.id})`).join(', '));
        console.log(`[Debug] Expected IDs:`, JSON.stringify(ROLES));
        return interaction.reply({
            content: `❌ **有効なサブスクリプションロールが見つかりませんでした。**\n\nこの機能を使用するには、サポートサーバーでProまたはPro+プランの支援者ロールが必要です。\nもし既に支援済みの場合は、以下の点をご確認ください：\n1. DiscordとBooth/PixivFANBOXが連携されているか\n2. ロールが付与されるまで数分待機してみてください`,
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
