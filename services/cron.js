const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cron = require('node-cron');
const db = require('../db');
const { updateMemberRoles } = require('../sync');

const TIER_VALUE_FREE = 'Free';
const BOOTH_URL = 'https://imomusi0213.booth.pm/items/7935721';

// Schedule: Run every 6 hours (0 */6 * * *) or for testing, every minute (* * * * *)
// Let's settle on every hour for this use case
const SCHEDULE = '0 * * * *';

function startCron(client) {
    console.log(`[Cron] Scheduled expiry check task (${SCHEDULE})`);

    // Expiry check still runs regularly, but we also check for scheduled announcements
    // Change to every minute to handle scheduled posts accurately
    const EVERY_MINUTE = '* * * * *';
    console.log(`[Cron] Scheduled task runner (${EVERY_MINUTE})`);

    cron.schedule(EVERY_MINUTE, async () => {
        const now = new Date();
        // Only run expiry check at the top of the hour (maintain original logic)
        if (now.getMinutes() === 0) {
            console.log('[Cron] Running hourly expiry check...');
            try {
                // ... (Helper and existing expiry check logic)
                const getTierName = (t) => {
                    if (t === '1' || t === 1) return 'Pro';
                    if (t === '2' || t === 2) return 'Pro (Yearly)';
                    if (t === '3' || t === 3) return 'Pro+';
                    if (t === '4' || t === 4) return 'Pro+ (Yearly)';
                    return t || 'Free';
                };

                // A. Standard Tiers (Pro/Pro+): 7 days warning
                const standardRes = await db.query(`
                    SELECT guild_id, user_id, tier, expiry_date, auto_renew 
                    FROM subscriptions 
                    WHERE is_active = TRUE 
                    AND expiry_date <= NOW() + INTERVAL '7 days' 
                    AND expiry_warning_sent = FALSE 
                    AND tier NOT IN ('Free', '0')
                    AND tier NOT LIKE 'Trial%'
                `);

                // B. Trial Tiers (Trial Pro/Pro+): 1 day warning
                const trialRes = await db.query(`
                    SELECT guild_id, user_id, tier, expiry_date, auto_renew 
                    FROM subscriptions 
                    WHERE is_active = TRUE 
                    AND expiry_date <= NOW() + INTERVAL '1 day' 
                    AND expiry_warning_sent = FALSE 
                    AND tier LIKE 'Trial%'
                `);

                const warningTargets = [...standardRes.rows, ...trialRes.rows];

                for (const sub of warningTargets) {
                    const guildId = sub.guild_id;
                    const tierName = getTierName(sub.tier);
                    const isTrial = String(sub.tier).startsWith('Trial');

                    try {
                        const guild = await client.guilds.fetch(guildId).catch(() => null);
                        const user = await client.users.fetch(sub.user_id).catch(() => null);

                        if (user) {
                            const description = isTrial
                                ? `ご利用ありがとうございます。お使いの **${tierName}プラン** の有効期限がまもなく終了します。\n継続してご利用いただくには、BOOTHにて有料版の購入をご検討ください。`
                                : `ご利用ありがとうございます。お使いの **${tierName}プラン** の有効期限がまもなく終了します。`;

                            const embed = new EmbedBuilder()
                                .setTitle('📅 サブスクリプション期限のお知らせ')
                                .setDescription(description)
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
                        }
                    } catch (err) {
                        console.error(`[Cron] Failed to process warning for guild ${guildId}:`, err.message);
                    }
                }

                // 2. Process expired and handle auto-renew
                const expiredRes = await db.query("SELECT guild_id, user_id, tier, auto_renew FROM subscriptions WHERE is_active = TRUE AND expiry_date <= NOW()");

                for (const sub of expiredRes.rows) {
                    const guildId = sub.guild_id;
                    if (sub.auto_renew) {
                        const newExpiry = new Date();
                        newExpiry.setMonth(newExpiry.getMonth() + 1);
                        await db.query('UPDATE subscriptions SET expiry_date = $1, expiry_warning_sent = FALSE WHERE guild_id = $2', [newExpiry, guildId]);
                    } else {
                        await db.query('UPDATE subscriptions SET tier = $1, is_active = TRUE, expiry_date = NULL, auto_renew = FALSE WHERE guild_id = $2', [String(TIER_VALUE_FREE), guildId]);
                        const user = await client.users.fetch(sub.user_id).catch(() => null);
                        if (user) {
                            await user.send(`【通知】サブスクリプションの有効期限が終了したため、サーバー (ID: ${guildId}) をFreeプランへ移行しました。`).catch(() => null);
                        }
                        const SUPPORT_GUILD_ID = process.env.SUPPORT_GUILD_ID;
                        if (SUPPORT_GUILD_ID) {
                            const supportGuild = await client.guilds.fetch(SUPPORT_GUILD_ID).catch(() => null);
                            if (supportGuild) {
                                await updateMemberRoles(supportGuild, sub.user_id, 'Free');
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('[Cron] Error in expiry check:', err);
            }
        }

        // --- NEW: Handle Scheduled Announcements ---
        try {
            const pendingAnnounce = await db.query(`
                SELECT id, title, content, type, associated_tasks 
                FROM scheduled_announcements 
                WHERE sent_at IS NULL AND scheduled_at <= NOW()
            `);

            for (const announce of pendingAnnounce.rows) {
                const channelId = process.env.ANNOUNCEMENT_CHANNEL_ID;
                if (!channelId) {
                    console.error('[Cron] ANNOUNCEMENT_CHANNEL_ID not set, skipping scheduled post.');
                    break;
                }

                const channel = await client.channels.fetch(channelId).catch(() => null);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setTitle(announce.title)
                        .setDescription(announce.content)
                        .setColor(announce.type === 'important' ? 0xff0000 : 0x00ff00)
                        .setTimestamp()
                        .setFooter({ text: 'AkatsukiBot Update System' });

                    await channel.send({ embeds: [embed] });
                    await db.query('UPDATE scheduled_announcements SET sent_at = NOW() WHERE id = $1', [announce.id]);
                    console.log(`[Cron] Posted scheduled announcement: ${announce.title}`);

                    // Execute associated tasks
                    const { executeAnnouncementTasks } = require('../routes/misc');
                    if (announce.associated_tasks && Array.isArray(announce.associated_tasks)) {
                        executeAnnouncementTasks(client, announce.associated_tasks);
                    }
                }
            }
        } catch (err) {
            console.error('[Cron] Error processing scheduled announcements:', err);
        }

        // --- NEW: Handle Milestone Auto-Unlock ---
        try {
            // Find subscriptions with auto_unlock enabled that haven't reached M5 (max)
            // and where it's been at least 7 days since the last update
            const milestoneRes = await db.query(`
                SELECT guild_id, current_milestone 
                FROM subscriptions 
                WHERE auto_unlock_enabled = TRUE 
                AND current_milestone < 5 
                AND updated_at <= NOW() - INTERVAL '7 days'
            `);

            for (const sub of milestoneRes.rows) {
                const nextM = (sub.current_milestone || 0) + 1;
                await db.query('UPDATE subscriptions SET current_milestone = $1, updated_at = NOW() WHERE guild_id = $2', [nextM, sub.guild_id]);
                console.log(`[Cron] Auto-unlocked milestone M${nextM} for guild ${sub.guild_id}`);
            }
        } catch (err) {
            console.error('[Cron] Error processing milestone auto-unlock:', err);
        }

        // --- NEW: Handle Automatic Update Check (GitHub) ---
        // Run daily at 3:00 AM
        if (now.getHours() === 3 && now.getMinutes() === 0) {
            try {
                const { checkForUpdates } = require('./updates');
                await checkForUpdates(client);
            } catch (err) {
                console.error('[Cron] Error checking for updates:', err);
            }
        }
    });
}

module.exports = { startCron };
