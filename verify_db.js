require('dotenv').config();
const db = require('./db');

async function test() {
    try {
        console.log('Testing DB access...');
        // Test 1: Select from subscriptions
        // Explicitly selecting fixed columns to ensure they exist
        const res = await db.query('SELECT server_id, plan_tier FROM subscriptions LIMIT 1');
        console.log('Query successful. Rows:', res.rows.length);
        if (res.rows.length > 0) {
            console.log('Sample row:', res.rows[0]);
        } else {
            console.log('No rows in subscriptions, but query executed fine.');
        }
        process.exit(0);
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}

test();
