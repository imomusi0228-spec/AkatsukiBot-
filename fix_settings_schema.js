const db = require('./db');
async function run() {
    try {
        console.log('Checking settings table schema...');
        const res = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'settings'");
        const columns = res.rows.map(r => r.column_name);
        console.log('Current columns:', columns);

        if (!columns.includes('value')) {
            console.log('Column "value" is missing. Adding it...');
            // In case it's named differently (e.g. content)
            if (columns.includes('content')) {
                await db.query('ALTER TABLE settings RENAME COLUMN content TO value');
                console.log('Renamed content to value');
            } else {
                await db.query('ALTER TABLE settings ADD COLUMN value TEXT');
                console.log('Added column value');
            }
        } else {
            console.log('Column "value" already exists.');
        }

        const data = await db.query('SELECT * FROM settings');
        console.log('Current data:', JSON.stringify(data.rows, null, 2));

    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        process.exit();
    }
}
run();
