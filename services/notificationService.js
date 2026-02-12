const axios = require('axios');
const db = require('../db');

/**
 * Sends a notification message to the configured Discord Webhook URL.
 * @param {Object} payload { title, description, color, fields, url }
 */
async function sendWebhookNotification(payload) {
    try {
        const result = await db.query("SELECT value FROM settings WHERE key = 'webhook_url'");
        const webhookUrl = result.rows.length > 0 ? result.rows[0].value : null;

        if (!webhookUrl) {
            // No webhook configured, silently skip
            return;
        }

        const embed = {
            title: payload.title || 'System Notification',
            description: payload.description || '',
            color: payload.color || 0x0099ff, // Default blue
            timestamp: new Date().toISOString(),
            fields: payload.fields || [],
            footer: {
                text: 'Akatsuki Management System'
            }
        };

        await axios.post(webhookUrl, {
            embeds: [embed]
        });
        return { success: true };
    } catch (err) {
        console.error('[Notification Service] Failed to send webhook:', err.message);
        return { success: false, error: err.message };
    }
}

module.exports = { sendWebhookNotification };
