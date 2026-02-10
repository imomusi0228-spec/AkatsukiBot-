const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function initDB() {
  const client = await pool.connect();
  try {
    // subscriptions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        server_id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        plan_tier VARCHAR(50) NOT NULL,
        start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expiry_date TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        auto_renew BOOLEAN DEFAULT FALSE
      );
    `);

    // applications table
    await client.query(`
      CREATE TABLE IF NOT EXISTS applications (
        id SERIAL PRIMARY KEY,
        message_id VARCHAR(255) UNIQUE NOT NULL,
        channel_id VARCHAR(255) NOT NULL,
        author_id VARCHAR(255) NOT NULL,
        author_name VARCHAR(255),
        content TEXT,
        parsed_user_id VARCHAR(255),
        parsed_server_id VARCHAR(255),
        parsed_tier VARCHAR(50),
        parsed_booth_name VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        auto_processed BOOLEAN DEFAULT FALSE,
        license_key VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // user_sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        session_id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        username VARCHAR(255),
        avatar VARCHAR(255),
        discriminator VARCHAR(255),
        expiry TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // license_keys table (for BOTH custom keys and validated booth order numbers)
    await client.query(`
      CREATE TABLE IF NOT EXISTS license_keys (
        key_id VARCHAR(50) PRIMARY KEY,
        plan_tier VARCHAR(50) NOT NULL,
        duration_months INTEGER NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        used_by_user VARCHAR(255),
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT
      );
    `);


    console.log('Database tables initialized.');
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    client.release();
  }
}

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = {
  query,
  initDB,
  pool
};
