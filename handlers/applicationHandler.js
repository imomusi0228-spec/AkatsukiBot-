const db = require('../db');

const APPLICATION_CHANNEL_ID = process.env.APPLICATION_CHANNEL_ID;

/**
 * Handle application messages from the application channel
 */
async function handleApplicationMessage(message, client) {
    // Ignore bot messages
    if (message.author.bot) return;

    // Only process messages from the application channel
    if (message.channelId !== APPLICATION_CHANNEL_ID) return;

    // Ignore pinned messages (Stickied Message)
    if (message.pinned) {
        console.log(`[Application] Ignoring pinned message: ${message.id}`);
        return;
    }

    console.log(`[Application] Processing message from ${message.author.tag}: ${message.content}`);

    // Parse the application message
    const parsed = parseApplicationMessage(message.content);

    if (!parsed.userId || !parsed.serverId || !parsed.tier) {
        console.log(`[Application] Failed to parse message: ${message.id}`);
        return;
    }

    try {
        // Check if this message was already processed
        const existing = await db.query(
            'SELECT id FROM applications WHERE message_id = $1',
            [message.id]
        );

        if (existing.rows.length > 0) {
            console.log(`[Application] Message already processed: ${message.id}`);
            return;
        }

        // Save application to database
        const result = await db.query(
            `INSERT INTO applications 
            (message_id, channel_id, author_id, author_name, content, parsed_user_id, parsed_server_id, parsed_tier, parsed_booth_name, status, auto_processed) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
            RETURNING id`,
            [
                message.id,
                message.channelId,
                message.author.id,
                message.author.tag,
                message.content,
                parsed.userId,
                parsed.serverId,
                parsed.tier,
                parsed.boothName,
                'pending',
                false
            ]
        );

        const applicationId = result.rows[0].id;
        console.log(`[Application] Saved application ID: ${applicationId}`);

        // Check if this is an existing user (by user_id)
        const existingSub = await db.query(
            'SELECT server_id, expiry_date, plan_tier FROM subscriptions WHERE user_id = $1',
            [parsed.userId]
        );

        if (existingSub.rows.length > 0) {
            // Existing user - auto extend
            console.log(`[Application] Existing user detected: ${parsed.userId}`);

            const currentSub = existingSub.rows[0];
            let currentExpiry = currentSub.expiry_date ? new Date(currentSub.expiry_date) : new Date();
            if (currentExpiry < new Date()) currentExpiry = new Date();

            // Extend by 1 month
            currentExpiry.setMonth(currentExpiry.getMonth() + 1);

            await db.query(
                'UPDATE subscriptions SET expiry_date = $1, is_active = TRUE WHERE user_id = $2',
                [currentExpiry, parsed.userId]
            );

            // Update application status
            await db.query(
                'UPDATE applications SET status = $1, auto_processed = $2 WHERE id = $3',
                ['approved', true, applicationId]
            );

            console.log(`[Application] Auto-extended subscription for user ${parsed.userId} to ${currentExpiry}`);

            // Send confirmation message
            try {
                await message.reply(`✅ サブスクリプションを自動延長しました！\n有効期限: ${currentExpiry.toLocaleDateString('ja-JP')}`);
            } catch (e) {
                console.error('[Application] Failed to send reply:', e);
            }

        } else {
            // New user - manual approval required
            console.log(`[Application] New user detected: ${parsed.userId} - manual approval required`);

            // Send notification message
            try {
                await message.reply(`📋 申請を受け付けました。管理者による承認をお待ちください。`);
            } catch (e) {
                console.error('[Application] Failed to send reply:', e);
            }
        }

    } catch (error) {
        console.error('[Application] Error processing application:', error);
    }
}

/**
 * Parse application message content
 */
function parseApplicationMessage(content) {
    const result = {
        boothName: null,
        userId: null,
        serverId: null,
        tier: null
    };

    // Extract BOOTH name
    const boothMatch = content.match(/購入者名[（(]BOOTH[)）][:：]\s*(.+)/);
    if (boothMatch) result.boothName = boothMatch[1].trim();

    // Extract User ID
    const userIdMatch = content.match(/ユーザーID[:：]\s*(\d+)/);
    if (userIdMatch) result.userId = userIdMatch[1].trim();

    // Extract Server ID
    const serverIdMatch = content.match(/サーバーID[:：]\s*(\d+)/);
    if (serverIdMatch) result.serverId = serverIdMatch[1].trim();

    // Extract Tier
    const tierMatch = content.match(/希望プラン[（(]Pro\s*\/\s*Pro\+[)）][:：]\s*(Pro\+?)/i);
    if (tierMatch) result.tier = tierMatch[1].trim();

    return result;
}

module.exports = { handleApplicationMessage };
