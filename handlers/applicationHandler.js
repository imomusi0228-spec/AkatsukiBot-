const db = require('../db');

/**
 * Handles messages in the #ライセンス申請 channel
 * Format expected:
 * ・購入者名(BOOTH): XXX
 * ・ユーザーID: 123
 * ・サーバーID: 456
 * ・希望プラン(Pro / Pro+): Pro
 */
async function handleApplicationMessage(message, client) {
    // Only process in the specific channel
    if (message.channel.id !== process.env.APPLICATION_CHANNEL_ID) return;
    if (message.author.bot) return;

    console.log(`[App] New message in application channel from ${message.author.tag}`);

    const content = message.content;
    const parsed = parseApplication(content);

    if (!parsed) {
        console.log('[App] Failed to parse message format.');
        return;
    }

    try {
        await db.query(`
            INSERT INTO applications (
                message_id, channel_id, author_id, author_name, content,
                parsed_user_id, parsed_server_id, parsed_tier, parsed_booth_name
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (message_id) DO NOTHING
        `, [
            message.id, message.channel.id, message.author.id, message.author.tag, content,
            parsed.userId, parsed.serverId, parsed.tier, parsed.boothName
        ]);
        console.log('[App] Application saved to database.');

        // React to show it's being processed
        await message.react('👀').catch(() => { });
    } catch (err) {
        console.error('[App] Error saving application:', err);
    }
}

function parseApplication(content) {
    // Handling both full-width and half-width symbols (brackets, colons)
    const boothMatch = content.match(/購入者名[(（]BOOTH[)）][:：]\s*(.+)/);
    const userMatch = content.match(/ユーザーID[:：]\s*(\d+)/);
    const serverMatch = content.match(/サーバーID[:：]\s*(\d+)/);
    const tierMatch = content.match(/希望プラン[(（]Pro\s*[\/\s]*Pro\+[)）][:：]\s*(Pro\+?)/i);

    if (!userMatch || !serverMatch || !tierMatch) return null;

    return {
        boothName: boothMatch ? boothMatch[1].trim() : 'Unknown',
        userId: userMatch[1].trim(),
        serverId: serverMatch[1].trim(),
        tier: tierMatch[1].trim()
    };
}

module.exports = { handleApplicationMessage };
