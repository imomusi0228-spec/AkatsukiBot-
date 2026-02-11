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
    // 1. Migration: guild_id -> server_id
    try {
      const res = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'subscriptions' AND column_name = 'guild_id'
      `);
      if (res.rows.length > 0) {
        await client.query('ALTER TABLE subscriptions RENAME COLUMN guild_id TO server_id');
        console.log('[DB] Migrated guild_id to server_id');
      }
    } catch (e) {
      console.error('[DB] Guild ID Migration Error:', e.message);
    }

    // 2. Migration: tier -> plan_tier
    try {
      const res = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'subscriptions' AND column_name = 'tier'
      `);
      if (res.rows.length > 0) {
        await client.query('ALTER TABLE subscriptions RENAME COLUMN tier TO plan_tier');
        console.log('[DB] Migrated tier to plan_tier');
      }
    } catch (e) {
      console.error('[DB] Tier Migration Error:', e.message);
    }

    // subscriptions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        server_id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        plan_tier VARCHAR(50) NOT NULL,
        start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expiry_date TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        auto_renew BOOLEAN DEFAULT FALSE,
        expiry_warning_sent BOOLEAN DEFAULT FALSE
      );
    `);

    // Ensure expiry_warning_sent column exists (migration for existing table)
    try {
      await client.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='expiry_warning_sent') THEN
            ALTER TABLE subscriptions ADD COLUMN expiry_warning_sent BOOLEAN DEFAULT FALSE;
          END IF;
        END $$;
      `);
    } catch (err) {
      console.warn('[DB] Migration failed (expiry_warning_sent column might already exist):', err.message);
    }

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

    // Ensure license_key column exists (migration for existing table)
    try {
      await client.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='license_key') THEN
            ALTER TABLE applications ADD COLUMN license_key VARCHAR(50);
          END IF;
        END $$;
      `);
    } catch (err) {
      console.warn('[DB] Migration failed (license_key column might already exist):', err.message);
    }

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
        reserved_user_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT
      );
    `);

    // Ensure reserved_user_id column exists
    try {
      await client.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='license_keys' AND column_name='reserved_user_id') THEN
            ALTER TABLE license_keys ADD COLUMN reserved_user_id VARCHAR(255);
          END IF;
        END $$;
      `);
    } catch (err) {
      console.warn('[DB] Migration failed (reserved_user_id):', err.message);
    }


    // operation_logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS operation_logs (
        id SERIAL PRIMARY KEY,
        operator_id VARCHAR(255) NOT NULL,
        operator_name VARCHAR(255),
        target_id VARCHAR(255),
        action_type VARCHAR(50) NOT NULL,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
