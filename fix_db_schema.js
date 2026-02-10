require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function fixSchema() {
    const client = await pool.connect();
    try {
        console.log('Checking schema...');

        // Check subscriptions table columns
        const res = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'subscriptions'
        `);
        const columns = res.rows.map(r => r.column_name);
        console.log('Current columns:', columns);

        // Fix guild_id -> server_id
        if (columns.includes('guild_id') && !columns.includes('server_id')) {
            console.log('Renaming guild_id to server_id...');
            await client.query('ALTER TABLE subscriptions RENAME COLUMN guild_id TO server_id');
            console.log('Done.');
        } else if (columns.includes('server_id')) {
            console.log('Column server_id already exists.');
        }

        // Fix tier -> plan_tier
        if (columns.includes('tier') && !columns.includes('plan_tier')) {
            console.log('Renaming tier to plan_tier...');
            await client.query('ALTER TABLE subscriptions RENAME COLUMN tier TO plan_tier');
            console.log('Done.');
        } else if (columns.includes('plan_tier')) {
            console.log('Column plan_tier already exists.');
        }

        console.log('Schema fix completed.');
    } catch (err) {
        console.error('Schema fix failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

fixSchema();
