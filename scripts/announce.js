const axios = require('axios');
require('dotenv').config();

const [, , title, content, type] = process.argv;

if (!title || !content) {
    console.error('Usage: node announce.js "Title" "Content" [normal|important]');
    process.exit(1);
}

async function send() {
    const url = `http://localhost:${process.env.PORT || 3000}/api/announce`;
    try {
        const response = await axios.post(url, {
            title, content, type: type || 'normal'
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': process.env.ADMIN_TOKEN
            }
        });
        console.log(response.data);
    } catch (err) {
        console.error('Failed to send announcement:', err.response ? err.response.data : err.message);
    }
}

send();
