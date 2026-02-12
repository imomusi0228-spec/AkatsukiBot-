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
      SELECT column_name
      FROM information_schema.columns 
      WHERE table_name = 'license_keys'
    `);
        console.log('--- COLUMNS START ---');
        res.rows.forEach(r => console.log(r.column_name));
        console.log('--- COLUMNS END ---');
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        pool.end();
    }
}

inspect();
