const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cron = require('node-cron');
const db = require('../db');
const { updateMemberRoles } = require('../sync');

const TIER_VALUE_FREE = 'Free';
const BOOTH_URL = 'https://imomusi0213.booth.pm/items/7935721';

// Schedule: Run every 6 hours (0 */6 * * *) or for testing, every minute (* * * * *)
const SCHEDULE = '0 * * * *';

function startCron(client) {
    console.log(`[Cron] Scheduled expiry check task (${SCHEDULE})`);

    const EVERY_MINUTE = '* * * * *';
    console.log(`[Cron] Scheduled task runner (${EVERY_MINUTE})`);

    cron.schedule(EVERY_MINUTE, async () => {
        const now = new Date();

        // 1. Hourly Expiry Check & Warnings
        if (now.getMinutes() === 0) {
            console.log('[Cron] Running hourly expiry check...');
            try {
                // Check if DM reminders are enabled in settings
                const dmSettingRes = await db.query("SELECT value FROM bot_system_settings WHERE key = 'dm_reminders_enabled'");
                const dmEnabled = dmSettingRes.rows.length > 0 ? dmSettingRes.rows[0].value === 'true' : true;

                if (dmEnabled) {
                    const getTierName = (t) => {
                        if (t === '1' || t === 1) return 'Pro';
                        if (t === '2' || t === 2) return 'Pro (Yearly)';
                        if (t === '3' || t === 3) return 'Pro+';
                        if (t === '4' || t === 4) return 'Pro+ (Yearly)';
                        return t || 'Free';
                    };

                    const standardRes = await db.query(`
                        SELECT guild_id, user_id, tier, expiry_date, auto_renew 
                        FROM subscriptions 
                        WHERE is_active = TRUE 
                        AND expiry_date <= NOW() + INTERVAL '7 days' 
                        AND expiry_warning_sent = FALSE 
                        AND tier NOT IN ('Free', '0')
                        AND tier NOT LIKE 'Trial%'
                    `);

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
                        try {
                            const user = await client.users.fetch(sub.user_id).catch(() => null);
                            if (user) {
                                const tierName = getTierName(sub.tier);
                                const isTrial = String(sub.tier).startsWith('Trial');
                                const description = isTrial
                                    ? `ご利用ありがとうございます。お使いの **${tierName}プラン** の有効期限がまもなく終了します。\n継続してご利用いただくには、BOOTHにて有料版の購入をご検討ください。`
                                    : `ご利用ありがとうございます。お使いの **${tierName}プラン** の有効期限がまもなく終了します。`;

                                const embed = new EmbedBuilder()
                                    .setTitle('📅 サブスクリプション期限のお知らせ')
                                    .setDescription(description)
                                    .addFields(
                                        { name: 'サーバーID', value: sub.guild_id },
                                        { name: '期限', value: new Date(sub.expiry_date).toLocaleDateString() },
                                        { name: '自動更新', value: sub.auto_renew ? '有効 (自動的に更新されます)' : '無効 (期限後はFreeプランへ移行します)' }
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
                                await db.query('UPDATE subscriptions SET expiry_warning_sent = TRUE WHERE guild_id = $1', [sub.guild_id]);
                            }
                        } catch (err) {
                            console.error(`[Cron] Error processing warning for ${sub.guild_id}:`, err.message);
                        }
                    }
                }

                // 2. Process Expired Subscriptions
                const expiredRes = await db.query("SELECT guild_id, user_id, tier, auto_renew FROM subscriptions WHERE is_active = TRUE AND expiry_date <= NOW()");
                for (const sub of expiredRes.rows) {
                    if (sub.auto_renew) {
                        const newExpiry = new Date();
                        newExpiry.setMonth(newExpiry.getMonth() + 1);
                        await db.query('UPDATE subscriptions SET expiry_date = $1, expiry_warning_sent = FALSE WHERE guild_id = $2', [newExpiry, sub.guild_id]);
                        console.log(`[Cron] Auto-renewed subscription for guild ${sub.guild_id}`);
                    } else {
                        await db.query('UPDATE subscriptions SET tier = $1, is_active = TRUE, expiry_date = NULL, auto_renew = FALSE WHERE guild_id = $2', [String(TIER_VALUE_FREE), sub.guild_id]);
                        const user = await client.users.fetch(sub.user_id).catch(() => null);
                        if (user) {
                            await user.send(`【通知】サブスクリプションの有効期限が終了したため、サーバー (ID: ${sub.guild_id}) をFreeプランへ移行しました。`).catch(() => null);
                        }
                        const SUPPORT_GUILD_ID = process.env.SUPPORT_GUILD_ID;
                        if (SUPPORT_GUILD_ID) {
                            const supportGuild = await client.guilds.fetch(SUPPORT_GUILD_ID).catch(() => null);
                            if (supportGuild) {
                                await updateMemberRoles(supportGuild, sub.user_id, 'Free');
                            }
                        }
                        console.log(`[Cron] Expired subscription for guild ${sub.guild_id}, moved to Free.`);
                    }
                }
            } catch (err) {
                console.error('[Cron] Error in hourly expiry check:', err);
            }
        }

        // 3. Scheduled Announcements
        try {
            const pendingAnnounce = await db.query(`
                SELECT id, title, content, type 
                FROM scheduled_announcements 
                WHERE sent_at IS NULL AND scheduled_at <= NOW()
            `);

            for (const announce of pendingAnnounce.rows) {
                const channelId = process.env.ANNOUNCEMENT_CHANNEL_ID;
                if (!channelId) break;

                const channel = await client.channels.fetch(channelId).catch(() => null);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setTitle(announce.title)
                        .setDescription(announce.content)
                        .setColor(announce.type === 'important' ? 0xff0000 : 0x00ff00)
                        .setTimestamp();

                    await channel.send({ embeds: [embed] });
                    await db.query('UPDATE scheduled_announcements SET sent_at = NOW() WHERE id = $1', [announce.id]);
                }
            }
        } catch (err) {
            console.error('[Cron] Error in scheduled announcements:', err);
        }

        // 4. Daily Tasks
        if (now.getHours() === 3 && now.getMinutes() === 0) {
            try {
                const { checkForUpdates } = require('./updates');
                await checkForUpdates(client);
            } catch (err) {
                console.error('[Cron] Error checking for updates:', err);
            }
        }

        if (now.getHours() === 0 && now.getMinutes() === 5) {
            try {
                const activeSubs = await db.query('SELECT guild_id FROM subscriptions WHERE is_active = TRUE');
                for (const sub of activeSubs.rows) {
                    const guild = await client.guilds.fetch(sub.guild_id).catch(() => null);
                    if (guild) {
                        await db.query('INSERT INTO guild_member_snapshots (guild_id, member_count) VALUES ($1, $2)', [sub.guild_id, guild.memberCount]);
                    }
                }
            } catch (err) {
                console.error('[Cron] Error capturing snapshots:', err);
            }
        }
    });
}

module.exports = { startCron };
