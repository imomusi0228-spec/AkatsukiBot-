const db = require('../db');
const { MessageFlags } = require('discord.js');
const { sendWebhookNotification } = require('../services/notif');

/**
 * Handles messages in the #ライセンス申請 channel
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
        // Check for existing application by same user and guild
        const existing = await db.query(
            'SELECT id FROM applications WHERE parsed_user_id = $1 AND parsed_guild_id = $2',
            [parsed.userId, parsed.guildId]
        );

        if (existing.rows.length > 0) {
            // Update existing
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
                message.id, message.channel.id, message.author.id, message.author.tag, content,
                parsed.tier, parsed.boothName, existing.rows[0].id
            ]);
            console.log(`[App] Existing application updated (ID: ${existing.rows[0].id})`);
        } else {
            // Insert new - use ON CONFLICT to avoid errors on duplicate message process
            await db.query(`
                INSERT INTO applications (
                    message_id, channel_id, author_id, author_name, content,
                    parsed_user_id, parsed_guild_id, parsed_tier, parsed_booth_name
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (message_id) DO NOTHING
            `, [
                message.id, message.channel.id, message.author.id, message.author.tag, content,
                parsed.userId, parsed.guildId, parsed.tier, parsed.boothName
            ]);
            console.log('[App] New application saved.');
        }

        // React to show it's being processed
        await message.react('👀').catch(() => { });

        // Notify admins via webhook
        await sendWebhookNotification({
            title: '📝 新規ライセンス申請 (メッセージ)',
            description: `新しいライセンス申請がメッセージから届きました。`,
            color: 0x00ff00,
            fields: [
                { name: '申請者', value: `${message.author.tag} (${message.author.id})`, inline: true },
                { name: '希望プラン', value: parsed.tier, inline: true },
                { name: 'サーバーID', value: `\`${parsed.guildId}\``, inline: true },
                { name: 'Booth名', value: parsed.boothName, inline: true }
            ]
        });
    } catch (err) {
        console.error('[App] Error saving application:', err);
    }
}

function parseApplication(content) {
    // Handling both full-width and half-width symbols (brackets, colons)
    const boothMatch = content.match(/購入者名[(（]BOOTH[)）][:：]\s*(.+)/);
    const userMatch = content.match(/ユーザーID[:：]\s*(\d+)/);
    const serverMatch = content.match(/サーバーID[:：]\s*(\d+)/);
    const tierMatch = content.match(/希望プラン[(（]Pro\s*[\/\s]*Pro\+[)）][:：]\s*((?:Trial\s+)?Pro\+?)/i);

    if (!userMatch || !serverMatch || !tierMatch) return null;

    const rawTier = tierMatch[1].trim();
    let tier = rawTier;
    if (rawTier.toLowerCase() === 'pro') tier = 'Pro';
    else if (rawTier.toLowerCase() === 'pro+') tier = 'Pro+';
    else if (rawTier.toLowerCase() === 'trial pro') tier = 'Trial Pro';
    else if (rawTier.toLowerCase() === 'trial pro+') tier = 'Trial Pro+';

    return {
        boothName: boothMatch ? boothMatch[1].trim() : 'Unknown',
        userId: userMatch[1].trim(),
        guildId: serverMatch[1].trim(),
        tier: tier
    };
}

async function handleApplicationModal(interaction) {
    // 1. Defer immediately to avoid timeout
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const boothName = interaction.fields.getTextInputValue('booth_name');
    const userId = interaction.fields.getTextInputValue('user_id');
    const guildId = interaction.fields.getTextInputValue('guild_id');

    // Extract tier from customId (format: application_modal:TierName)
    const tierRaw = interaction.customId.split(':')[1] || 'Pro';
    let tier = tierRaw;
    if (tierRaw.toLowerCase() === 'pro') tier = 'Pro';
    else if (tierRaw.toLowerCase() === 'pro+') tier = 'Pro+';
    else if (tierRaw.toLowerCase() === 'trial pro') tier = 'Trial Pro';
    else if (tierRaw.toLowerCase() === 'trial pro+') tier = 'Trial Pro+';

    try {
        const messageId = `modal-${interaction.id}`;

        // Check for existing application by same user and guild
        const existing = await db.query(
            'SELECT id FROM applications WHERE parsed_user_id = $1 AND parsed_guild_id = $2',
            [userId, guildId]
        );

        if (existing.rows.length > 0) {
            // Update existing
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
                messageId,
                interaction.channel.id,
                interaction.user.id,
                interaction.user.tag,
                `Modal Submission: ${boothName} / ${tier}`,
                tier,
                boothName,
                existing.rows[0].id
            ]);
            console.log(`[App] Existing modal application updated (ID: ${existing.rows[0].id})`);
        } else {
            // Insert new - handle potential race condition with ON CONFLICT
            await db.query(`
                INSERT INTO applications (
                    message_id, channel_id, author_id, author_name, content,
                    parsed_user_id, parsed_guild_id, parsed_tier, parsed_booth_name, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (message_id) DO UPDATE SET
                    status = 'pending',
                    created_at = CURRENT_TIMESTAMP
            `, [
                messageId,
                interaction.channel.id,
                interaction.user.id,
                interaction.user.tag,
                `Modal Submission: ${boothName} / ${tier}`,
                userId,
                guildId,
                tier,
                boothName,
                'pending'
            ]);
            console.log('[App] Modal application processed.');
        }

        // Notify admins via webhook
        await sendWebhookNotification({
            title: '📝 新規ライセンス申請 (モーダル)',
            description: `新しいライセンス申請がフォームから届きました。`,
            color: 0x00ff00,
            fields: [
                { name: '申請者', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                { name: '希望プラン', value: tier, inline: true },
                { name: 'サーバーID', value: `\`${guildId}\``, inline: true },
                { name: 'Booth名', value: boothName, inline: true }
            ]
        });

        await interaction.editReply({
            content: '✅ **申請を受け付けました！**\n以前の申請がある場合は最新の内容に更新されました。管理者が確認次第、ライセンスを発行いたします。'
        });

        // Log to console
        console.log(`[App] New modal application from ${interaction.user.tag} for ${tier}`);

    } catch (err) {
        console.error('[App] Modal Save Error:', err);
        try {
            await interaction.editReply({
                content: '❌ 申請の保存中にエラーが発生しました。時間を置いて再度お試しください。'
            });
        } catch (replyErr) {
            console.error('[App] Failed to send error reply:', replyErr);
        }
    }
}

module.exports = { handleApplicationMessage, handleApplicationModal };
