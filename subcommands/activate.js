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

    const inputServerId = interaction.options.getString('guild_id');
    const inputKey = interaction.options.getString('key');
    const guildId = inputServerId ? inputServerId.trim() : interaction.guildId;
    const userId = interaction.user.id;

    if (!guildId) {
        return interaction.editReply({ content: '❌ サーバーIDを指定するか、サーバー内でコマンドを実行してください。' });
    }

    if (!inputKey) {
        return interaction.editReply({ content: '❌ **ライセンスキーを入力してください。**\nBOOTHで送られたキーが必要です。' });
    }

    if (!/^\d{17,20}$/.test(guildId)) {
        return interaction.editReply({ content: '❌ **無効なサーバーIDです。**\n正しいIDを入力してください。' });
    }

    let tier = null;
    let durationMonths = 0;
    let durationDays = 0;
    let usedKey = null;

    // --- 1. Key Verification ---
    if (inputKey) {
        try {
            const trimmedKey = inputKey.trim().toUpperCase();
            const keyCheck = await db.query('SELECT * FROM license_keys WHERE key_id = $1', [trimmedKey]);

            if (keyCheck.rows.length > 0) {
                const row = keyCheck.rows[0];

                if (row.is_used) {
                    return interaction.editReply({ content: '❌ **このライセンスキーは既に使用済みです。**\n一度使ったキーは再利用できません。' });
                }

                // Restriction Check
                if (row.reserved_user_id && row.reserved_user_id !== userId) {
                    return interaction.editReply({
                        content: '❌ **このライセンスキーは他のユーザー専用に発行されています。**\n申請した本人のアカウントで実行してください。'
                    });
                }

                // Normalize tier casing
                const lowerTier = row.tier ? row.tier.toLowerCase() : '';
                if (lowerTier === 'pro') tier = 'Pro';
                else if (lowerTier === 'pro+') tier = 'Pro+';
                else if (lowerTier === 'trial pro') tier = 'Trial Pro';
                else if (lowerTier === 'trial pro+') tier = 'Trial Pro+';
                else tier = row.tier; // Fallback



                durationMonths = row.duration_months;
                durationDays = row.duration_days; // New field
                usedKey = row.key_id;
            } else {
                return interaction.editReply({ content: '❌ **無効なキーまたは注文番号です。**\n入力が間違っている可能性があります。' });
            }
        } catch (err) {
            console.error('[Activate] Key check error:', err);
            return interaction.editReply({ content: 'エラーが発生しました（キー照合失敗）。' });
        }
    }

    if (!tier) {
        return interaction.editReply({
            content: `❌ **有効なサブスクリプションが見つかりませんでした。**\n管理者から発行された正しいキーを入力してください。`
        });
    }

    // Check existing subscriptions for this user
    try {
        const existingResult = await db.query('SELECT * FROM subscriptions WHERE user_id = $1 AND is_active = TRUE', [userId]);
        const existingSubs = existingResult.rows;

        // Check migration availability if this is a reactivation
        const conflictRes = await db.query('SELECT * FROM subscriptions WHERE guild_id = $1', [guildId]);
        if (conflictRes.rows.length > 0 && !conflictRes.rows[0].is_active) {
            // This is a reactivation of a previously moved/deactivated sub
            // We allow it if they just moved it here
        }

        const isCurrentServerRegistered = existingSubs.some(s => s.guild_id === guildId);

        if (!isCurrentServerRegistered) {
            // Check limits for new server registration
            let maxLimit = 1;

            const isProPlus = (t) => {
                if (!t) return false;
                const s = String(t).toLowerCase();
                return s === 'pro+' || s === '3' || s === '4';
            };

            const hasProPlus = isProPlus(tier) || existingSubs.some(s => isProPlus(s.tier));
            if (hasProPlus) maxLimit = 3;

            if (existingSubs.length >= maxLimit) {
                return interaction.editReply({
                    content: `❌ **登録制限エラー**\nお使いのプラン (${hasProPlus ? 'Pro+' : 'Pro'}) では最大 ${maxLimit} サーバーまで登録可能です。\n現在の登録数: ${existingSubs.length}\n別のサーバーから移動する場合は、旧サーバーで \`/move\` を実行してください。`
                });
            }
        }

        // Calculate expiry
        const exp = new Date();
        if (durationDays) {
            exp.setDate(exp.getDate() + durationDays);
        } else {
            exp.setMonth(exp.getMonth() + durationMonths);
        }

        await db.query(`
            INSERT INTO subscriptions (guild_id, user_id, tier, expiry_date, is_active, updated_at)
            VALUES ($1, $2, $3, $4, TRUE, NOW())
            ON CONFLICT (guild_id) DO UPDATE 
            SET user_id = EXCLUDED.user_id, 
                tier = EXCLUDED.tier, 
                expiry_date = EXCLUDED.expiry_date, 
                is_active = TRUE,
                updated_at = NOW()
        `, [guildId, userId, tier, exp]).catch(err => {
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

        await interaction.editReply({ content: `✅ サーバー (ID: ${guildId}) を有効化しました！\n**Tier:** ${tier}\n**有効期限:** ${exp.toLocaleDateString()}\n**方法:** ライセンスキー\n\nサポートサーバーのロールも同期されました。` });

    } catch (err) {
        console.error(err);
        await interaction.editReply({ content: 'エラーが発生しました。管理者に連絡してください。' });
    }
};

