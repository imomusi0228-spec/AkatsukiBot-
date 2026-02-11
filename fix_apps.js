const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function fixApps() {
    const client = await pool.connect();
    try {
        console.log('Fixing casing for applications table...');

        await client.query("UPDATE applications SET parsed_tier = 'Pro' WHERE parsed_tier = 'pro'");
        await client.query("UPDATE applications SET parsed_tier = 'Pro+' WHERE parsed_tier = 'pro+'");

        console.log('Updated applications table.');

    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        pool.end();
    }
}

fixApps();
