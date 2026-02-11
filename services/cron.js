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
            // Find expired subscriptions that are still active
            const res = await db.query(`
                SELECT * FROM subscriptions 
                WHERE is_active = TRUE 
                AND expiry_date < NOW()
            `);

            const expiredSubs = res.rows;
            console.log(`[Cron] Found ${expiredSubs.length} expired subscriptions.`);

            for (const sub of expiredSubs) {
                // 1. Deactivate in DB
                await db.query('UPDATE subscriptions SET is_active = FALSE WHERE server_id = $1', [sub.server_id]);

                // 2. Log operation
                await db.query(`
                    INSERT INTO operation_logs (operator_id, operator_name, target_id, action_type, details)
                    VALUES ($1, $2, $3, $4, $5)
                `, ['SYSTEM', 'AutoExpired', sub.server_id, 'AUTO_EXPIRE', `Plan: ${sub.plan_tier}`]);

                // 3. Remove roles in Support Server if applicable
                const SUPPORT_GUILD_ID = process.env.SUPPORT_GUILD_ID;
                if (client && SUPPORT_GUILD_ID) {
                    const guild = await client.guilds.fetch(SUPPORT_GUILD_ID).catch(() => null);
                    // Force remove roles by passing null or handling logic in updateMemberRoles
                    // Actually updateMemberRoles checks DB, so since we set is_active = FALSE, calling it should remove roles.
                    if (guild) await updateMemberRoles(guild, sub.user_id, sub.plan_tier);
                }
            }
        } catch (err) {
            console.error('[Cron] Error in expiry check:', err);
        }
    });
}

module.exports = { startCron };
