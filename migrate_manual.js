const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Beginning manual migration...');

        // 1. Check if 'guild_id' exists and 'server_id' does not
        const checkGuildId = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'subscriptions' AND column_name = 'guild_id'
    `);

        const checkServerId = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'subscriptions' AND column_name = 'server_id'
      `);

        if (checkGuildId.rows.length > 0 && checkServerId.rows.length === 0) {
            console.log('Found "guild_id", renaming to "server_id"...');
            await client.query('ALTER TABLE subscriptions RENAME COLUMN guild_id TO server_id');
            console.log('SUCCESS: Renamed guild_id -> server_id');
        } else {
            console.log('Skipping guild_id migration: "guild_id" not found or "server_id" already exists.');
        }

        // 2. Check if 'tier' exists and 'plan_tier' does not
        const checkTier = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'subscriptions' AND column_name = 'tier'
    `);

        const checkPlanTier = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'subscriptions' AND column_name = 'plan_tier'
      `);

        if (checkTier.rows.length > 0 && checkPlanTier.rows.length === 0) {
            console.log('Found "tier", renaming to "plan_tier"...');
            await client.query('ALTER TABLE subscriptions RENAME COLUMN tier TO plan_tier');
            console.log('SUCCESS: Renamed tier -> plan_tier');
        } else {
            console.log('Skipping tier migration: "tier" not found or "plan_tier" already exists.');
        }

        console.log('Migration check complete.');

    } catch (err) {
        console.error('Migration Failed:', err);
    } finally {
        client.release();
        pool.end();
    }
}

migrate();
