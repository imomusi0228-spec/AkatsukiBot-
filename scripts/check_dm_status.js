const { pool } = require('../db');
require('dotenv').config();

async function checkDMStatus() {
    try {
        console.log('--- DB Check Start (Updated) ---');

        // Check 1: Count total active subs
        const countRes = await pool.query('SELECT COUNT(*) FROM subscriptions WHERE is_active = TRUE');
        console.log(`Total Active Initialized: ${countRes.rows[0].count}`);

        // Check 2: Subs with warning ALREADY sent
        console.log('\n[Checking subscriptions with expiry_warning_sent = TRUE]');
        const sentRes = await pool.query("SELECT guild_id, user_id, tier, expiry_date, updated_at FROM subscriptions WHERE expiry_warning_sent = TRUE");

        if (sentRes.rows.length === 0) {
            console.log('-> None.');
        } else {
            sentRes.rows.forEach(row => {
                console.log(`- Guild: ${row.guild_id}, Tier: ${row.tier}, Expiry: ${new Date(row.expiry_date).toLocaleDateString()}, Updated: ${new Date(row.updated_at).toLocaleString()}`);
            });
        }

        // Check 3: Subs eligible for warning (Active, <= 7 days, Warning NOT sent, Not Free)
        console.log('\n[Checking subscriptions ELIGIBLE for warning (<= 7 days)]');
        // Note: Postgres interval syntax is sensitive. Let's use a safer query.
        const pendingRes = await pool.query(`
            SELECT guild_id, user_id, tier, expiry_date, expiry_warning_sent 
            FROM subscriptions 
            WHERE is_active = TRUE 
            AND expiry_date <= NOW() + INTERVAL '7 days' 
            AND tier NOT IN ('Free', '0', '0', 0)
        `);

        if (pendingRes.rows.length === 0) {
            console.log('-> None found matching criteria.');
        } else {
            pendingRes.rows.forEach(row => {
                const isSent = row.expiry_warning_sent;
                console.log(`- Guild: ${row.guild_id}, Tier: ${row.tier}, Expiry: ${new Date(row.expiry_date).toLocaleDateString()}, WarningSent: ${isSent}`);

                if (!isSent) {
                    console.log('  -> !!! THIS USER SHOULD RECEIVE A DM !!!');
                } else {
                    console.log('  -> Already sent.');
                }
            });
        }

        console.log('--- DB Check End ---');

    } catch (err) {
        console.error('Error checking DM status:', err);
    } finally {
        // Force exit
        process.exit(0);
    }
}

checkDMStatus();
