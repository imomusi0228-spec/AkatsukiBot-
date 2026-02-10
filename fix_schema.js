const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function fixSchema() {
    const client = await pool.connect();
    try {
        console.log('[Schema Fix] Starting schema verification and migration...');

        // Check current schema
        const columnsRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'subscriptions'
      ORDER BY ordinal_position;
    `);

        console.log('[Schema Fix] Current subscriptions table columns:');
        columnsRes.rows.forEach(row => {
            console.log(`  - ${row.column_name}: ${row.data_type}`);
        });

        const columnNames = columnsRes.rows.map(r => r.column_name);

        // Migration logic
        let needsGuildIdRename = columnNames.includes('guild_id') && !columnNames.includes('server_id');
        let needsTierRename = columnNames.includes('tier') && !columnNames.includes('plan_tier');

        if (needsGuildIdRename) {
            console.log('[Schema Fix] Renaming guild_id to server_id...');
            await client.query('ALTER TABLE subscriptions RENAME COLUMN guild_id TO server_id');
            console.log('[Schema Fix] ✓ Renamed guild_id to server_id');
        } else if (columnNames.includes('server_id')) {
            console.log('[Schema Fix] ✓ server_id column already exists');
        } else {
            console.log('[Schema Fix] ⚠ Neither guild_id nor server_id found!');
        }

        if (needsTierRename) {
            console.log('[Schema Fix] Renaming tier to plan_tier...');
            await client.query('ALTER TABLE subscriptions RENAME COLUMN tier TO plan_tier');
            console.log('[Schema Fix] ✓ Renamed tier to plan_tier');
        } else if (columnNames.includes('plan_tier')) {
            console.log('[Schema Fix] ✓ plan_tier column already exists');
        } else {
            console.log('[Schema Fix] ⚠ Neither tier nor plan_tier found!');
        }

        // Verify final schema
        const finalRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'subscriptions'
      ORDER BY ordinal_position;
    `);

        console.log('[Schema Fix] Final subscriptions table columns:');
        finalRes.rows.forEach(row => {
            console.log(`  - ${row.column_name}: ${row.data_type}`);
        });

        console.log('[Schema Fix] Migration completed successfully!');
    } catch (err) {
        console.error('[Schema Fix] Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

fixSchema();
