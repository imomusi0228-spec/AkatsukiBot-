const db = require('./db');
async function run() {
    try {
        console.log('Verifying table existence...');
        const res = await db.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'bot_system_settings'");
        console.log('Result:', JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
