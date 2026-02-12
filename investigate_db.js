const db = require('./db');
async function run() {
    try {
        const columns = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'subscriptions'");
        console.log('Columns:', JSON.stringify(columns.rows, null, 2));

        const subs = await db.query('SELECT * FROM subscriptions LIMIT 5');
        console.log('Subscriptions:', JSON.stringify(subs.rows, null, 2));

        const logs = await db.query("SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT 10");
        console.log('Logs:', JSON.stringify(logs.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
