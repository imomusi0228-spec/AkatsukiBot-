const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function fix() {
    const client = await pool.connect();
    try {
        console.log('Fixing casing for tier names...');

        // 1. Fix subscriptions
        await client.query("UPDATE subscriptions SET plan_tier = 'Pro' WHERE plan_tier = 'pro'");
        await client.query("UPDATE subscriptions SET plan_tier = 'Pro+' WHERE plan_tier = 'pro+'");
        console.log('Updated subscriptions table.');

        // 2. Fix license_keys
        await client.query("UPDATE license_keys SET plan_tier = 'Pro' WHERE plan_tier = 'pro'");
        await client.query("UPDATE license_keys SET plan_tier = 'Pro+' WHERE plan_tier = 'pro+'");
        console.log('Updated license_keys table.');

        // Verify
        const res = await client.query(`SELECT server_id, plan_tier FROM subscriptions WHERE server_id = '1231263255935324322'`);
        console.log('Verification:', res.rows[0]);

    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        pool.end();
    }
}

fix();
