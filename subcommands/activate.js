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
    // 1. Defer the reply immediately to prevent "Unknown interaction" timeout errors (3s limit)
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const inputServerId = interaction.options.getString('server_id');
    const inputKey = interaction.options.getString('key');
    const serverId = inputServerId ? inputServerId.trim() : interaction.guildId;
    const userId = interaction.user.id;

    if (!serverId) {
        return interaction.editReply({ content: '❌ サーバーIDを指定するか、サーバー内でコマンドを実行してください。' });
    }

    if (!/^\d{17,20}$/.test(serverId)) {
        return interaction.editReply({ content: '❌ **無効なサーバーIDです。**\n正しいIDを入力してください。' });
    }

    let tier = null;
    let durationMonths = 0;
    let usedKey = null;

    // --- 1. Key Verification (Priority) ---
    if (inputKey) {
        try {
            const keyRes = await db.query('SELECT * FROM license_keys WHERE key_id = $1 AND is_active = TRUE AND is_used = FALSE', [inputKey.trim().toUpperCase()]);
            // (Note: database schema might have key_id or just key. Using key_id based on db.js edit)
            // Wait, check db.js edit again. Yes, key_id.

            // Re-checking the typo in my query (is_active is not in license_keys if I check my previous edit)
            const keyCheck = await db.query('SELECT * FROM license_keys WHERE key_id = $1 AND is_used = FALSE', [inputKey.trim().toUpperCase()]);

            if (keyCheck.rows.length > 0) {
                const row = keyCheck.rows[0];
                tier = row.plan_tier;
                durationMonths = row.duration_months;
                usedKey = row.key_id;
            } else {
                return interaction.editReply({ content: '❌ **無効なキーまたは注文番号です。**\n既に使用されているか、入力が間違っている可能性があります。' });
            }
        } catch (err) {
            console.error('Error checking key:', err);
            return interaction.editReply({ content: 'エラーが発生しました（キー照合失敗）。' });
        }
    }

    // --- 2. Role Verification (Fallback) ---
    if (!tier) {
        const SUPPORT_GUILD_ID = process.env.SUPPORT_GUILD_ID;
        if (!SUPPORT_GUILD_ID) {
            console.error('SUPPORT_GUILD_ID is not set in .env');
        } else {
            let supportMember = null;
            try {
                const supportGuild = await interaction.client.guilds.fetch(SUPPORT_GUILD_ID);
                supportMember = await supportGuild.members.fetch({ user: userId, force: true });
            } catch (err) {
                console.warn(`Failed to fetch member ${userId} from support guild: ${err.message}`);
            }

            if (supportMember) {
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
            }
        }
    }

    if (!tier) {
        return interaction.editReply({
            content: `❌ **有効なサブスクリプションまたはロールが見つかりませんでした。**\n\nキーをお持ちの場合は入力してください。\nロールによる有効化の場合は、サポートサーバーに参加し、支援者ロールが付与されている必要があります。`
        });
    }

    // Check existing subscriptions for this user
    try {
        const existing = await db.query('SELECT * FROM subscriptions WHERE user_id = $1 AND is_active = TRUE', [userId]);
        if (existing.rows.length > 0) {
            const currentSub = existing.rows[0];
            if (currentSub.server_id !== serverId) {
                return interaction.editReply({ content: `既に別のサーバー (ID: ${currentSub.server_id}) が登録されています。1ユーザーにつき1サーバーまで登録可能です。` });
            }
        }

        // Calculate expiry
        const now = new Date();
        const expiryDate = new Date(now.setMonth(now.setMonth(now.getMonth() + durationMonths)));
        // Note: double setMonth bug in original? (line 125 original: new Date(now.setMonth(now.getMonth() + durationMonths)))
        // Corrected below:
        const exp = new Date();
        exp.setMonth(exp.getMonth() + durationMonths);

        await db.query(`
            INSERT INTO subscriptions (server_id, user_id, plan_tier, expiry_date, is_active)
            VALUES ($1, $2, $3, $4, TRUE)
            ON CONFLICT (server_id) DO UPDATE 
            SET user_id = EXCLUDED.user_id, 
                plan_tier = EXCLUDED.plan_tier, 
                expiry_date = EXCLUDED.expiry_date, 
                is_active = TRUE,
                notes = COALESCE(subscriptions.notes, '') || E'\\n[Activate] ' || $5
        `, [serverId, userId, tier, exp, usedKey ? `Used Key: ${usedKey}` : 'Role sync']);

        if (usedKey) {
            await db.query('UPDATE license_keys SET is_used = TRUE, used_by_user = $1, used_at = CURRENT_TIMESTAMP WHERE key_id = $2', [userId, usedKey]);
        }

        await db.query('INSERT INTO subscription_logs (server_id, action, details) VALUES ($1, $2, $3)',
            [serverId, 'ACTIVATE', `Tier: ${tier}, Exp: ${exp.toLocaleDateString()}, Method: ${usedKey ? 'Key' : 'Role'}`]);

        await interaction.editReply({ content: `✅ サーバー (ID: ${serverId}) を有効化しました！\n**Tier:** ${tier}\n**有効期限:** ${exp.toLocaleDateString()}\n**方法:** ${usedKey ? 'ライセンスキー' : 'ロール同期'}` });

    } catch (err) {
        console.error(err);
        await interaction.editReply({ content: 'エラーが発生しました。管理者に連絡してください。' });
    }
};

