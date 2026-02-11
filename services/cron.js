const cron = require('node-cron');
const db = require('../db');
const { updateMemberRoles } = require('../sync');

// Schedule: Run every 6 hours (0 */6 * * *) or for testing, every minute (* * * * *)
// Let's settle on every hour for this use case
const SCHEDULE = '0 * * * *';

function startCron(client) {
    console.log(`[Cron] Scheduled expiry check task (${SCHEDULE})`);

    cron.schedule(SCHEDULE, async () => {
        console.log('[Cron] Running expiry check...');
        try {
            // 1. Check for subscriptions expiring within 7 days (warning notification)
            const warningRes = await db.query(`
                SELECT * FROM subscriptions 
                WHERE is_active = TRUE 
                AND plan_tier != 'Free'
                AND expiry_date IS NOT NULL
                AND expiry_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
                AND expiry_warning_sent = FALSE
            `);

            const warningSubs = warningRes.rows;
            console.log(`[Cron] Found ${warningSubs.length} subscriptions expiring within 7 days.`);

            const SUPPORT_GUILD_ID = process.env.SUPPORT_GUILD_ID;
            const boothUrl = process.env.BOOTH_URL || 'https://booth.pm/';

            for (const sub of warningSubs) {
                try {
                    if (client && SUPPORT_GUILD_ID) {
                        const guild = await client.guilds.fetch(SUPPORT_GUILD_ID).catch(() => null);
                        if (guild) {
                            const member = await guild.members.fetch(sub.user_id).catch(() => null);
                            if (member) {
                                const expiryDate = new Date(sub.expiry_date).toLocaleDateString('ja-JP');

                                let messageContent = `**【お知らせ】☾ サブスクリプション失効予告**\n\n平素より☾をご利用いただきありがとうございます。\n\nBotを導入しているサーバー (ID: ${sub.server_id}) の**${sub.plan_tier}プラン**が、**${expiryDate}**に失効予定です。\n\nプランが失効すると、自動的に**Freeプラン**へ変更され、Pro/Pro+機能がご利用いただけなくなります。\n継続してご利用いただくには、期限前にサブスクリプションの更新をお願いいたします。\n\n🛒 **プランの購入・更新はこちら:**\n${boothUrl}`;

                                if (sub.plan_tier.includes('Trial')) {
                                    messageContent = `**【お知らせ】☾ お試し期間終了間近**\n\nお嬢様／旦那様、☾ のフル機能を気に入っていただけましたか？\n\n現在ご利用中の**${sub.plan_tier}（お試し版）**は、**${expiryDate}**に期限を迎えます。\n期限が切れると一部の高度な機能が制限されますが、ご安心ください。本契約をいただければ、引き続きすべての機能をお楽しみいただけますよ。\n\nぜひ、この機会に本契約をご検討ください！ボクがお待ちしています。\n\n🛒 **本契約はこちらから:**\n${boothUrl}`;
                                }

                                await member.send({ content: messageContent }).catch(e => console.warn(`[Cron] Failed to send warning DM to ${member.user.tag}: ${e.message}`));

                                // Mark as sent
                                await db.query('UPDATE subscriptions SET expiry_warning_sent = TRUE WHERE server_id = $1', [sub.server_id]);

                                // Log operation
                                await db.query(`
                                    INSERT INTO operation_logs (operator_id, operator_name, target_id, action_type, details)
                                    VALUES ($1, $2, $3, $4, $5)
                                `, ['SYSTEM', 'AutoWarning', sub.server_id, 'EXPIRY_WARNING', `Plan: ${sub.plan_tier}, Expiry: ${expiryDate}${sub.plan_tier.includes('Trial') ? ' (Trial Solicit)' : ''}`]);

                                console.log(`[Cron] Sent ${sub.plan_tier.includes('Trial') ? 'trial solicit' : 'expiry warning'} to user ${sub.user_id} for server ${sub.server_id}`);
                            }
                        }
                    }
                } catch (err) {
                    console.error(`[Cron] Error sending warning for ${sub.server_id}:`, err);
                }
            }

            // 2. Find expired subscriptions that are still active
            const res = await db.query(`
                SELECT * FROM subscriptions 
                WHERE is_active = TRUE 
                AND expiry_date < NOW()
            `);

            const expiredSubs = res.rows;
            console.log(`[Cron] Found ${expiredSubs.length} expired subscriptions.`);

            for (const sub of expiredSubs) {
                if (sub.auto_renew) {
                    // AUTO-RENEW Logic
                    const newExpiry = new Date();
                    newExpiry.setMonth(newExpiry.getMonth() + 1);

                    await db.query('UPDATE subscriptions SET expiry_date = $1, is_active = TRUE, expiry_warning_sent = FALSE WHERE server_id = $2', [newExpiry, sub.server_id]);

                    // Log operation
                    await db.query(`
                        INSERT INTO operation_logs (operator_id, operator_name, target_id, action_type, details)
                        VALUES ($1, $2, $3, $4, $5)
                    `, ['SYSTEM', 'AutoRenew', sub.server_id, 'AUTO_RENEW', `Plan: ${sub.plan_tier}, New Expiry: ${newExpiry.toLocaleDateString('ja-JP')}`]);

                    console.log(`[Cron] Auto-renewed subscription for ${sub.server_id}`);
                } else {
                    // 1. Transition to Free tier in DB
                    await db.query('UPDATE subscriptions SET plan_tier = $1, is_active = TRUE, expiry_date = NULL, auto_renew = FALSE WHERE server_id = $2', ['Free', sub.server_id]);

                    // 2. Log operation
                    await db.query(`
                        INSERT INTO operation_logs (operator_id, operator_name, target_id, action_type, details)
                        VALUES ($1, $2, $3, $4, $5)
                    `, ['SYSTEM', 'AutoExpired', sub.server_id, 'AUTO_EXPIRE', `Plan: ${sub.plan_tier} -> Free`]);

                    // 3. Remove roles in Support Server (Sync to Free)
                    if (client && SUPPORT_GUILD_ID) {
                        const guild = await client.guilds.fetch(SUPPORT_GUILD_ID).catch(() => null);
                        if (guild) await updateMemberRoles(guild, sub.user_id, 'Free');
                    }
                    console.log(`[Cron] Transitioned expired subscription for ${sub.server_id} to Free tier.`);
                }
            }
        } catch (err) {
            console.error('[Cron] Error in expiry check:', err);
        }
    });
}

module.exports = { startCron };
