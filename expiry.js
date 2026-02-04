const db = require('./db');
require('dotenv').config();

const SUPPORT_GUILD_ID = process.env.SUPPORT_GUILD_ID;
const ROLES = {
    'Pro': process.env.PRO_ROLE_ID,
    'Pro+': process.env.PRO_PLUS_ROLE_ID
};

/**
 * Checks for expired subscriptions and downgrades them to Free.
 * @param {import('discord.js').Client} client 
 */
async function checkExpirations(client) {
    console.log('Checking for expired subscriptions...');
    try {
        // Find subscriptions that have expired and are not Free
        // We assume 'is_active' is true for them. If is_active is false, we ignore them or they are already cancelled.
        // We want to transition them to Free, so we keep is_active = TRUE but change tier to Free.
        const res = await db.query(`
            SELECT * FROM subscriptions 
            WHERE plan_tier != 'Free' 
            AND is_active = TRUE 
            AND expiry_date IS NOT NULL 
            AND expiry_date < NOW()
        `);

        if (res.rows.length === 0) {
            console.log('No expired subscriptions found.');
            return;
        }

        const guild = await client.guilds.fetch(SUPPORT_GUILD_ID).catch(console.error);
        if (!guild) {
            console.error(`Support guild ${SUPPORT_GUILD_ID} not found for expiry check.`);
            return;
        }

        for (const sub of res.rows) {
            console.log(`Processing expiry for Server: ${sub.server_id}, User: ${sub.user_id}`);

            // 1. Remove Roles
            try {
                const member = await guild.members.fetch(sub.user_id).catch(() => null);
                if (member) {
                    await member.roles.remove([ROLES['Pro'], ROLES['Pro+']]);
                    console.log(`Removed roles for ${member.user.tag}`);
                } else {
                    console.warn(`User ${sub.user_id} not found in guild.`);
                }
            } catch (err) {
                console.error(`Failed to remove roles for ${sub.user_id}:`, err);
            }

            // 2. Update DB to Free
            // We clear expiry_date because Free doesn't expire (or we could set it to null)
            await db.query(`
                UPDATE subscriptions 
                SET plan_tier = 'Free', expiry_date = NULL, notes = COALESCE(notes, '') || E'\\n[Auto] Expired to Free' 
                WHERE server_id = $1
            `, [sub.server_id]);

            // 3. Log
            await db.query(`
                INSERT INTO subscription_logs (server_id, action, details) 
                VALUES ($1, $2, $3)
            `, [sub.server_id, 'EXPIRED_AUTO', `Downgraded to Free from ${sub.plan_tier}`]);
        }
        console.log(`Processed ${res.rows.length} expired subscriptions.`);

    } catch (err) {
        console.error('Error in checkExpirations:', err);
    }
}

module.exports = { checkExpirations };
