const { Client } = require('discord.js');
const db = require('./db');
require('dotenv').config();

const SUPPORT_GUILD_ID = process.env.SUPPORT_GUILD_ID;
const ROLES = {
    'Pro': process.env.PRO_ROLE_ID,
    'Pro+': process.env.PRO_PLUS_ROLE_ID
};

/**
 * Syncs subscriptions based on roles in the support server.
 * @param {Client} client 
 */
async function syncSubscriptions(client) {
    console.log('Starting subscription sync...');
    const guild = await client.guilds.fetch(SUPPORT_GUILD_ID).catch(console.error);
    if (!guild) {
        console.error(`Support guild ${SUPPORT_GUILD_ID} not found.`);
        return { success: false, message: 'Support guild not found.' };
    }

    // Fetch all members (ensure permission/intent)
    const members = await guild.members.fetch();
    let updatedCount = 0;
    let errors = [];

    for (const [memberId, member] of members) {
        let tier = 'Free';
        // Determine highest tier
        if (member.roles.cache.has(ROLES['Pro+'])) tier = 'Pro+';
        else if (member.roles.cache.has(ROLES['Pro'])) tier = 'Pro';

        if (tier !== 'Free') {
            try {
                // Find which server this user owns or is associated with.
                // NOTE: In this basic version, we might assume the User ID is the key for now, 
                // OR we need a mapping. 
                // However, the current DB uses server_id as PK. 
                // If the user hasn't registered a server via /sub add, we can't guess the server ID.
                // 
                // STRATEGY:
                // 1. Check if there's an existing active subscription for this user_id.
                // 2. If yes, update it.
                // 3. If no, we can't create one because we don't know the server_id.
                //    (Unless we want to store user-based subs directly, but schema is server_id based)

                // Let's modify the query to find ANY subscription owned by this user.
                const res = await db.query('SELECT server_id, plan_tier FROM subscriptions WHERE user_id = $1', [memberId]);

                if (res.rows.length > 0) {
                    for (const row of res.rows) {
                        if (row.plan_tier !== tier) {
                            await db.query(
                                'UPDATE subscriptions SET plan_tier = $1, is_active = TRUE, notes = COALESCE(notes, \'\') || E\'\\n[Auto-Sync] Role update\' WHERE server_id = $2',
                                [tier, row.server_id]
                            );
                            await db.query('INSERT INTO subscription_logs (server_id, action, details) VALUES ($1, $2, $3)',
                                [row.server_id, 'SYNC_UPDATE', `Updated to ${tier} via Role Sync`]);
                            updatedCount++;
                        }
                    }
                } else {
                    // User has role but no registered server in DB.
                    // We could log this or ignore.
                    // errors.push(`User ${member.user.tag} has ${tier} role but no registered server.`);
                }

            } catch (err) {
                console.error(`Error syncing user ${memberId}:`, err);
                errors.push(`Error syncing ${member.user.tag}`);
            }
        } else {
            // User is Free (no roles).
            // Check if they had a Pro/Pro+ sub that should be downgraded/cancelled?
            // Only if it was auto-renew/role-managed? 
            // For safety, we might NOT auto-cancel unless we are sure it was role-based.
            // But the request implies "server management" so let's allow downgrading if found.

            const res = await db.query('SELECT server_id, plan_tier FROM subscriptions WHERE user_id = $1 AND is_active = TRUE', [memberId]);
            for (const row of res.rows) {
                // Check if current tier is one of the paid ones we manage
                if (row.plan_tier === 'Pro' || row.plan_tier === 'Pro+') {
                    // Downgrade or expire?
                    // Let's set expiry to NOW if it was previously undefined or future, 
                    // effectively cancelling it, or just mark inactive?
                    // Let's just log it for now to be safe, or set is_active false.
                    // "Role removed -> cancel"

                    await db.query('UPDATE subscriptions SET is_active = FALSE, notes = COALESCE(notes, \'\') || E\'\\n[Auto-Sync] Role removed\' WHERE server_id = $1', [row.server_id]);
                    await db.query('INSERT INTO subscription_logs (server_id, action, details) VALUES ($1, $2, $3)',
                        [row.server_id, 'SYNC_CANCEL', 'Role removed, subscription deactivated']);
                    updatedCount++;
                }
            }
        }
    }

    console.log(`Sync completed. Updated members: ${updatedCount}`);
    return { success: true, updated: updatedCount, errors };
}

module.exports = { syncSubscriptions };
