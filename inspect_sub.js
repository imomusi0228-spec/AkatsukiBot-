const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function inspect() {
    const client = await pool.connect();
    try {
        const res = await client.query(`
      SELECT server_id, user_id, plan_tier, is_active
      FROM subscriptions
      WHERE server_id = '1231263255935324322'
    `);
        console.log('Subscriptions for server 1231263255935324322:', res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        pool.end();
    }
}

inspect();
