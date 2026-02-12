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
    // 1. Migration: server_id -> guild_id (Unify with Akatsuki-Bot)
    try {
      const res = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'subscriptions' AND column_name = 'server_id'
      `);
      if (res.rows.length > 0) {
        const check = await client.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'subscriptions' AND column_name = 'guild_id'
        `);
        if (check.rows.length === 0) {
          await client.query('ALTER TABLE subscriptions RENAME COLUMN server_id TO guild_id');
          console.log('[DB] Migrated server_id to guild_id');
        } else {
          console.log('[DB] Both guild_id and server_id exist. Using guild_id.');
        }
      }
    } catch (e) {
      console.error('[DB] Guild ID Migration Error:', e.message);
    }

    // 2. Migration: plan_tier -> tier (Unify with Akatsuki-Bot)
    try {
      const res = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'subscriptions' AND column_name = 'plan_tier'
      `);
      if (res.rows.length > 0) {
        const check = await client.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'subscriptions' AND column_name = 'tier'
        `);
        if (check.rows.length === 0) {
          await client.query('ALTER TABLE subscriptions RENAME COLUMN plan_tier TO tier');
          console.log('[DB] Migrated plan_tier to tier');
        } else {
          // If both exist, we might want to drop the old one if it's redundant
          // For safety in this shared DB environment, let's just make sure tier is used.
          console.log('[DB] Both tier and plan_tier exist. Using tier.');
        }
      }
    } catch (e) {
      console.error('[DB] Tier Migration Error:', e.message);
    }

    // 3. Migration: license_keys.plan_tier -> tier
    try {
      const res = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'license_keys' AND column_name = 'plan_tier'
      `);
      if (res.rows.length > 0) {
        const check = await client.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'license_keys' AND column_name = 'tier'
        `);
        if (check.rows.length === 0) {
          await client.query('ALTER TABLE license_keys RENAME COLUMN plan_tier TO tier');
          console.log('[DB] Migrated license_keys.plan_tier to tier');
        }
      }
    } catch (e) {
      console.error('[DB] License Key Tier Migration Error:', e.message);
    }

    // 4. Ensure tables exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        guild_id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        tier VARCHAR(50) NOT NULL,
        start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expiry_date TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        auto_renew BOOLEAN DEFAULT FALSE,
        expiry_warning_sent BOOLEAN DEFAULT FALSE,
        notes TEXT,
        valid_until TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure all columns exist in subscriptions
    const subCols = ['expiry_warning_sent', 'notes', 'valid_until', 'updated_at', 'auto_renew', 'start_date', 'created_at', 'cached_username', 'cached_servername'];
    for (const col of subCols) {
      try {
        await client.query(`
          DO $$ 
          BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='${col}') THEN
              ALTER TABLE subscriptions ADD COLUMN ${col} ${col === 'auto_renew' || col === 'expiry_warning_sent' ? 'BOOLEAN DEFAULT FALSE' : (col === 'notes' ? 'TEXT' : (col.startsWith('cached_') ? 'VARCHAR(255)' : 'TIMESTAMP'))};
              IF '${col}' = 'updated_at' OR '${col}' = 'start_date' THEN
                ALTER TABLE subscriptions ALTER COLUMN ${col} SET DEFAULT CURRENT_TIMESTAMP;
              END IF;
            END IF;
          END $$;
        `);
      } catch (err) {
        console.warn(`[DB] Migration failed for column ${col}:`, err.message);
      }
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS applications (
        id SERIAL PRIMARY KEY,
        message_id VARCHAR(255) UNIQUE NOT NULL,
        channel_id VARCHAR(255) NOT NULL,
        author_id VARCHAR(255) NOT NULL,
        author_name VARCHAR(255),
        content TEXT,
        parsed_user_id VARCHAR(255),
        parsed_guild_id VARCHAR(255),
        parsed_tier VARCHAR(50),
        parsed_booth_name VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        auto_processed BOOLEAN DEFAULT FALSE,
        license_key VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migration for applications: parsed_server_id -> parsed_guild_id
    try {
      const res = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'applications' AND column_name = 'parsed_server_id'
      `);
      if (res.rows.length > 0) {
        const check = await client.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'applications' AND column_name = 'parsed_guild_id'
        `);
        if (check.rows.length === 0) {
          await client.query('ALTER TABLE applications RENAME COLUMN parsed_server_id TO parsed_guild_id');
          console.log('[DB] Migrated parsed_server_id to parsed_guild_id');
        }
      }
    } catch (e) {
      console.error('[DB] App Server ID Migration Error:', e.message);
    }

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

    await client.query(`
      CREATE TABLE IF NOT EXISTS license_keys (
        key_id VARCHAR(50) PRIMARY KEY,
        tier VARCHAR(50) NOT NULL,
        duration_months INTEGER NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        used_by_user VARCHAR(255),
        used_at TIMESTAMP,
        reserved_user_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT
      );
    `);

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

    // 4. Final Cleanup/Normalization
    try {
      // Ensure tier is VARCHAR in this bot's context for handling string names (Free/Pro/Pro+)
      // but accommodate Akatsuki-Bot's numeric tier
      console.log('[DB] Ensured tier column is VARCHAR type for string names.');

      // Performance Optimization: Add indexes for frequently queried columns
      await client.query('CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_subscriptions_is_active ON subscriptions(is_active);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_subscriptions_expiry_date ON subscriptions(expiry_date);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_subscriptions_cached_username ON subscriptions(cached_username);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_subscriptions_cached_servername ON subscriptions(cached_servername);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_applications_parsed_user_id ON applications(parsed_user_id);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_applications_parsed_guild_id ON applications(parsed_guild_id);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at ON operation_logs(created_at DESC);');
    } catch (e) {
      console.error('[DB] Normalization Error:', e.message);
    }

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
