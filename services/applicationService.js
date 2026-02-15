const db = require('../db');
const { sendWebhookNotification } = require('./notif');

/**
 * Saves or updates a license application.
 * @param {Object} appData 
 * @returns {Promise<Object>} The saved application data
 */
async function saveApplication(appData) {
    const {
        messageId,
        channelId,
        authorId,
        authorName,
        content,
        userId,
        guildId,
        tier,
        boothName,
        sourceType // 'message' or 'modal'
    } = appData;

    try {
        // Check for existing application by same user and guild
        const existing = await db.query(
            'SELECT id FROM applications WHERE parsed_user_id = $1 AND parsed_guild_id = $2',
            [userId, guildId]
        );

        let resultId;
        if (existing.rows.length > 0) {
            resultId = existing.rows[0].id;
            await db.query(`
                UPDATE applications SET
                    message_id = $1,
                    channel_id = $2,
                    author_id = $3,
                    author_name = $4,
                    content = $5,
                    parsed_tier = $6,
                    parsed_booth_name = $7,
                    status = 'pending',
                    created_at = CURRENT_TIMESTAMP
                WHERE id = $8
            `, [
                messageId, channelId, authorId, authorName, content,
                tier, boothName, resultId
            ]);
            console.log(`[AppService] Existing application updated (ID: ${resultId}, Source: ${sourceType})`);
        } else {
            const res = await db.query(`
                INSERT INTO applications (
                    message_id, channel_id, author_id, author_name, content,
                    parsed_user_id, parsed_guild_id, parsed_tier, parsed_booth_name
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (message_id) DO NOTHING
                RETURNING id
            `, [
                messageId, channelId, authorId, authorName, content,
                userId, guildId, tier, boothName
            ]);
            resultId = res.rows[0]?.id;
            console.log(`[AppService] New application saved (Source: ${sourceType})`);
        }

        // Notify admins via webhook
        await sendWebhookNotification({
            title: `📝 新規ライセンス申請 (${sourceType === 'modal' ? 'モーダル' : 'メッセージ'})`,
            description: `新しいライセンス申請が届きました。`,
            color: 0x00ff00,
            fields: [
                { name: '申請者', value: `${authorName} (${authorId})`, inline: true },
                { name: '希望プラン', value: tier, inline: true },
                { name: 'サーバーID', value: `\`${guildId}\``, inline: true },
                { name: 'Booth名', value: boothName, inline: true }
            ]
        });

        return { success: true, id: resultId };
    } catch (err) {
        console.error('[AppService] Error saving application:', err);
        throw err;
    }
}

module.exports = { saveApplication };
