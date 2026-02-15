const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function initDB() {
  const client = await pool.connect();
  try {
    // 1. Initial Migrations (Legacy field normalization)
    // server_id -> guild_id, plan_tier -> tier
    const allowedTables = ['subscriptions', 'license_keys', 'applications'];
    for (const table of allowedTables) {
      try {
        const colsRes = await client.query('SELECT column_name FROM information_schema.columns WHERE table_name = $1', [table]);
        const cols = colsRes.rows.map(r => r.column_name);

        if (cols.includes('server_id') && !cols.includes('guild_id')) {
          await client.query(`ALTER TABLE ${table} RENAME COLUMN server_id TO guild_id`);
        }
        if (cols.includes('parsed_server_id') && !cols.includes('parsed_guild_id')) {
          await client.query(`ALTER TABLE ${table} RENAME COLUMN parsed_server_id TO parsed_guild_id`);
        }
        if (cols.includes('plan_tier') && !cols.includes('tier')) {
          await client.query(`ALTER TABLE ${table} RENAME COLUMN plan_tier TO tier`);
        }
      } catch (e) {
        console.warn(`[DB Migration] Table ${table} normalization warning:`, e.message);
      }
    }

    // 2. Define Tables
    const tables = {
      subscriptions: `
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
        cached_username VARCHAR(255),
        cached_servername VARCHAR(255),
        current_milestone INTEGER DEFAULT 1,
        auto_unlock_enabled BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `,
      applications: `
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
      `,
      user_sessions: `
        session_id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        username VARCHAR(255),
        avatar VARCHAR(255),
        discriminator VARCHAR(255),
        expiry TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `,
      license_keys: `
        key_id VARCHAR(50) PRIMARY KEY,
        tier VARCHAR(50) NOT NULL,
        duration_months INTEGER NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        used_by_user VARCHAR(255),
        used_at TIMESTAMP,
        reserved_user_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT
      `,
      operation_logs: `
        id SERIAL PRIMARY KEY,
        operator_id VARCHAR(255) NOT NULL,
        operator_name VARCHAR(255),
        target_id VARCHAR(255),
        target_name VARCHAR(255),
        action_type VARCHAR(50) NOT NULL,
        details TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `,
      bot_system_settings: `
        key VARCHAR(255) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `,
      scheduled_announcements: `
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'normal',
        scheduled_at TIMESTAMP NOT NULL,
        sent_at TIMESTAMP,
        associated_tasks JSONB DEFAULT '[]',
        is_draft BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `
    };

    for (const [name, schema] of Object.entries(tables)) {
      await client.query(`CREATE TABLE IF NOT EXISTS ${name} (${schema})`);
    }

    // 3. Ensure Columns (Handle additions for existing tables)
    const essentialColumns = {
      subscriptions: [
        ['current_milestone', 'INTEGER DEFAULT 1'],
        ['auto_unlock_enabled', 'BOOLEAN DEFAULT FALSE'],
        ['updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP']
      ],
      scheduled_announcements: [
        ['associated_tasks', "JSONB DEFAULT '[]'"],
        ['is_draft', "BOOLEAN DEFAULT FALSE"]
      ],
      operation_logs: [
        ['target_name', 'VARCHAR(255)'],
        ['metadata', 'JSONB']
      ]
    };

    for (const [table, columns] of Object.entries(essentialColumns)) {
      for (const [colName, colDef] of columns) {
        await client.query(`
          DO $$ 
          BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='${table}' AND column_name='${colName}') THEN
              ALTER TABLE ${table} ADD COLUMN ${colName} ${colDef};
            END IF;
          END $$;
        `);
      }
    }

    // 4. Performance: Indexes
    const indexes = [
      'idx_subscriptions_user_id ON subscriptions(user_id)',
      'idx_subscriptions_is_active ON subscriptions(is_active)',
      'idx_applications_status ON applications(status)',
      'idx_operation_logs_created_at ON operation_logs(created_at DESC)'
    ];
    for (const idx of indexes) {
      await client.query(`CREATE INDEX IF NOT EXISTS ${idx}`);
    }

    console.log('[DB] Initialization and consolidation complete.');
  } catch (err) {
    console.error('[DB Error]', err);
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
