const { Client } = require('discord.js');
const db = require('./db');
require('dotenv').config();

const SUPPORT_GUILD_ID = process.env.SUPPORT_GUILD_ID;
const ROLES = {
    'ProMonthly': (process.env.ROLE_PRO_MONTHLY || '').trim(),
    'ProYearly': (process.env.ROLE_PRO_YEARLY || '').trim(),
    'ProPlusMonthly': (process.env.ROLE_PRO_PLUS_MONTHLY || '').trim(),
    'ProPlusYearly': (process.env.ROLE_PRO_PLUS_YEARLY || '').trim()
};

/**
 * Updates member roles based on the given tier.
 * @param {import('discord.js').Guild} guild 
 * @param {string} userId 
 * @param {string} tier 
 */
async function updateMemberRoles(guild, userId, tier) {
    try {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
            console.warn(`User ${userId} not found in guild ${guild.id}.`);
            return false;
        }

        const rolesToRemove = [
            ROLES['ProMonthly'], ROLES['ProYearly'],
            ROLES['ProPlusMonthly'], ROLES['ProPlusYearly']
        ].filter(id => id); // Remove empty/null strings

        let rolesToAdd = [];
        if (tier === 'Pro+') {
            // Favor Yearly if both might exist, but usually just one
            rolesToAdd = [ROLES['ProPlusMonthly'], ROLES['ProPlusYearly']].filter(id => id);
        } else if (tier === 'Pro') {
            rolesToAdd = [ROLES['ProMonthly'], ROLES['ProYearly']].filter(id => id);
        }

        // To be safe, we only add the roles the user *actually* should have based on current roles if we wanted to be precise,
        // but typically we just add what corresponds to the tier.
        // Actually, if we are sync-ing TIERS, we should probably know WHICH exact role they have.
        // But for updateMemberRoles(web), let's just make sure they have at least one of the tier roles.

        await member.roles.remove(rolesToRemove);
        if (rolesToAdd.length > 0) {
            // Add the first valid role for that tier
            await member.roles.add(rolesToAdd[0]);
        }

        console.log(`Updated roles for ${member.user.tag} to ${tier}`);
        return true;
    } catch (err) {
        console.error(`Failed to update roles for ${userId}:`, err);
        return false;
    }
}

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

    // Fetch all members
    let members;
    try {
        console.log(`Fetching all members for guild ${SUPPORT_GUILD_ID}...`);
        members = await guild.members.fetch();
        console.log(`Fetched ${members.size} members.`);
    } catch (fetchError) {
        console.error('Failed to fetch members for sync:', fetchError);
        return { success: false, message: 'Failed to fetch members (possibly Rate Limited).', error: fetchError };
    }

    let updatedCount = 0;
    let errors = [];

    for (const [memberId, member] of members) {
        let tier = 'Free';
        if (member.roles.cache.has(ROLES['ProPlusYearly']) || member.roles.cache.has(ROLES['ProPlusMonthly'])) {
            tier = 'Pro+';
        } else if (member.roles.cache.has(ROLES['ProYearly']) || member.roles.cache.has(ROLES['ProMonthly'])) {
            tier = 'Pro';
        }

        if (tier !== 'Free') {
            try {
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
                }
            } catch (err) {
                console.error(`Error syncing user ${memberId}:`, err);
                errors.push(`Error syncing ${member.user.tag}`);
            }
        } else {
            const res = await db.query('SELECT server_id, plan_tier FROM subscriptions WHERE user_id = $1 AND is_active = TRUE', [memberId]);
            for (const row of res.rows) {
                if (row.plan_tier === 'Pro' || row.plan_tier === 'Pro+') {
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

module.exports = { syncSubscriptions, updateMemberRoles };

