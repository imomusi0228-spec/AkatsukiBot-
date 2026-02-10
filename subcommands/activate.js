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

    if (!inputKey) {
        return interaction.editReply({ content: '❌ **ライセンスキーを入力してください。**\nBOOTHで送られたキーが必要です。' });
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
            // Check if the key exists and is not used
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

    // --- 2. Verification Cleanup (Removed Role Fallback) ---

    if (!tier) {
        return interaction.editReply({
            content: `❌ **有効なサブスクリプションが見つかりませんでした。**\n\n入力されたキーが正しいか確認してください。\nライセンスの適用には、管理者から発行されたキーが必須です。`
        });
    }

    // Check existing subscriptions for this user
    try {
        const existingResult = await db.query('SELECT * FROM subscriptions WHERE user_id = $1 AND is_active = TRUE', [userId]);
        const existingSubs = existingResult.rows;

        // Use fallback column names for logic
        const isCurrentServerRegistered = existingSubs.some(s => s.server_id === serverId);

        if (!isCurrentServerRegistered) {
            // Check limits for new server registration
            let maxLimit = 1;
            const hasProPlus = (tier === 'Pro+') || existingSubs.some(s => s.plan_tier === 'Pro+');
            if (hasProPlus) maxLimit = 3;

            if (existingSubs.length >= maxLimit) {
                return interaction.editReply({
                    content: `❌ **登録制限エラー**\nお使いのプラン (${hasProPlus ? 'Pro+' : 'Pro'}) では最大 ${maxLimit} サーバーまで登録可能です。\n現在の登録数: ${existingSubs.length}`
                });
            }
        }

        // Calculate expiry
        const exp = new Date();
        exp.setMonth(exp.getMonth() + durationMonths);

        await db.query(`
            INSERT INTO subscriptions (server_id, user_id, plan_tier, expiry_date, is_active)
            VALUES ($1, $2, $3, $4, TRUE)
            ON CONFLICT (server_id) DO UPDATE 
            SET user_id = EXCLUDED.user_id, 
                plan_tier = EXCLUDED.plan_tier, 
                expiry_date = EXCLUDED.expiry_date, 
                is_active = TRUE
        `, [serverId, userId, tier, exp]).catch(err => {
            console.error('[Activate] Insert failed:', err);
            throw err;
        });

        if (usedKey) {
            await db.query('UPDATE license_keys SET is_used = TRUE, used_by_user = $1, used_at = CURRENT_TIMESTAMP WHERE key_id = $2', [userId, usedKey]);
        }

        // --- 4. Immediate Role Sync ---
        const { updateMemberRoles } = require('../sync');
        const SUPPORT_GUILD_ID = process.env.SUPPORT_GUILD_ID;
        if (SUPPORT_GUILD_ID) {
            try {
                const supportGuild = await interaction.client.guilds.fetch(SUPPORT_GUILD_ID);
                await updateMemberRoles(supportGuild, userId, tier);
            } catch (err) {
                console.error('[Activate] Failed to sync roles immediately:', err);
            }
        }

        await interaction.editReply({ content: `✅ サーバー (ID: ${serverId}) を有効化しました！\n**Tier:** ${tier}\n**有効期限:** ${exp.toLocaleDateString()}\n**方法:** ライセンスキー\n\nサポートサーバーのロールも同期されました。` });

    } catch (err) {
        console.error(err);
        await interaction.editReply({ content: 'エラーが発生しました。管理者に連絡してください。' });
    }
};

