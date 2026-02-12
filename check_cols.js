const db = require('./db');
async function run() {
    try {
        const tablesRes = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log('Tables in DB:', tablesRes.rows.map(r => r.table_name));

        const res = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'settings'");
        console.log('Columns in settings table:', res.rows.map(r => r.column_name));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
