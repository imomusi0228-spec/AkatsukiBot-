const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../db');
const { updateMemberRoles } = require('../sync');

const TIER_VALUE_FREE = 'Free';
const BOOTH_URL = 'https://imomusi0213.booth.pm/items/7935721';

// Schedule: Run every 6 hours (0 */6 * * *) or for testing, every minute (* * * * *)
// Let's settle on every hour for this use case
const SCHEDULE = '0 * * * *';

function startCron(client) {
    console.log(`[Cron] Scheduled expiry check task (${SCHEDULE})`);

    cron.schedule(SCHEDULE, async () => {
        console.log('[Cron] Running expiry check...');
        try {
            // Helper to get tier name from numeric or string tier
            const getTierName = (t) => {
                if (t === '1' || t === 1) return 'Pro';
                if (t === '2' || t === 2) return 'Pro (Yearly)';
                if (t === '3' || t === 3) return 'Pro+';
                if (t === '4' || t === 4) return 'Pro+ (Yearly)';
                return t || 'Free';
            };

            // 1. Check for subscriptions expiring within 7 days (warning notification)
            const res = await db.query("SELECT guild_id, user_id, tier, expiry_date, auto_renew FROM subscriptions WHERE is_active = TRUE AND expiry_date <= NOW() + INTERVAL '7 days' AND expiry_warning_sent = FALSE AND tier NOT IN ('Free', '0', 0)");

            for (const sub of res.rows) {
                const guildId = sub.guild_id;
                const tierName = getTierName(sub.tier);

                try {
                    const guild = await client.guilds.fetch(guildId).catch(() => null);
                    const user = await client.users.fetch(sub.user_id).catch(() => null);

                    if (user) {
                        const embed = new EmbedBuilder()
                            .setTitle('📅 サブスクリプション期限のお知らせ')
                            .setDescription(`ご利用ありがとうございます。お使いの **${tierName}プラン** の有効期限がまもなく終了します。`)
                            .addFields(
                                { name: 'サーバー', value: guild ? guild.name : `ID: ${guildId}` },
                                { name: '期限', value: new Date(sub.expiry_date).toLocaleDateString() },
                                { name: '自動更新', value: sub.auto_renew ? '有効 (自動的に更新されます)' : '無効 (期限後にFreeプランへ移行します)' }
                            )
                            .setColor(sub.auto_renew ? 0x00ff00 : 0xffa500)
                            .setTimestamp();

                        const row = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setLabel('有料版をBOOTHで購入')
                                    .setStyle(ButtonStyle.Link)
                                    .setURL(BOOTH_URL)
                            );

                        await user.send({ embeds: [embed], components: [row] }).catch(() => null);
                        await db.query('UPDATE subscriptions SET expiry_warning_sent = TRUE WHERE guild_id = $1', [guildId]);
                        console.log(`[Cron] Warning sent to user ${user.tag} for guild ${guildId}`);
                    }
                } catch (err) {
                    console.error(`[Cron] Failed to process warning for guild ${guildId}:`, err.message);
                }
            }

            // 2. Process expired and handle auto-renew
            const expiredRes = await db.query("SELECT guild_id, user_id, tier, auto_renew FROM subscriptions WHERE is_active = TRUE AND expiry_date <= NOW()");

            for (const sub of expiredRes.rows) {
                const guildId = sub.guild_id;
                const tierName = getTierName(sub.tier);

                if (sub.auto_renew) {
                    // Extend by 1 month
                    const newExpiry = new Date();
                    newExpiry.setMonth(newExpiry.getMonth() + 1);
                    await db.query('UPDATE subscriptions SET expiry_date = $1, expiry_warning_sent = FALSE WHERE guild_id = $2', [newExpiry, guildId]);
                    console.log(`[Cron] Auto-renewed subscription for guild ${guildId} until ${newExpiry.toLocaleDateString()}`);
                } else {
                    // Move to Free
                    await db.query('UPDATE subscriptions SET tier = $1, is_active = TRUE, expiry_date = NULL, auto_renew = FALSE WHERE guild_id = $2', [String(TIER_VALUE_FREE), guildId]);

                    // Final announcement
                    const user = await client.users.fetch(sub.user_id).catch(() => null);
                    if (user) {
                        await user.send(`【通知】サブスクリプションの有効期限が終了したため、サーバー (ID: ${guildId}) をFreeプランへ移行しました。`).catch(() => null);
                    }
                    console.log(`[Cron] Expired subscription for guild ${guildId}, moved to Free.`);

                    // Update roles
                    const SUPPORT_GUILD_ID = process.env.SUPPORT_GUILD_ID;
                    if (SUPPORT_GUILD_ID) {
                        const supportGuild = await client.guilds.fetch(SUPPORT_GUILD_ID).catch(() => null);
                        if (supportGuild) {
                            // updateMemberRoles is already imported at the top
                            await updateMemberRoles(supportGuild, sub.user_id, 'Free');
                        }
                    }
                }
            }
        } catch (err) {
            console.error('[Cron] Error in expiry check:', err);
        }
    });
}

module.exports = { startCron };
