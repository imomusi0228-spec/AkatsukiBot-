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
                parsed_user_id, parsed_guild_id, parsed_tier, parsed_booth_name
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (message_id) DO NOTHING
        `, [
            message.id, message.channel.id, message.author.id, message.author.tag, content,
            parsed.userId, parsed.guildId, parsed.tier, parsed.boothName
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
    const boothName = interaction.fields.getTextInputValue('booth_name');
    const userId = interaction.fields.getTextInputValue('user_id');
    const guildId = interaction.fields.getTextInputValue('guild_id');
    const rawTier = interaction.fields.getTextInputValue('tier_choice');

    // Basic normalization
    let tier = rawTier.trim();
    if (tier.toLowerCase() === 'pro') tier = 'Pro';
    else if (tier.toLowerCase() === 'pro+') tier = 'Pro+';
    else if (tier.toLowerCase() === 'trial pro') tier = 'Trial Pro';
    else if (tier.toLowerCase() === 'trial pro+') tier = 'Trial Pro+';

    try {
        await db.query(`
            INSERT INTO applications (
                message_id, channel_id, author_id, author_name, content,
                parsed_user_id, parsed_guild_id, parsed_tier, parsed_booth_name, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
            `modal-${interaction.id}`,
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

        await interaction.reply({
            content: '✅ **申請を受け付けました！**\n管理者が確認次第、ライセンスを発行いたします。少々お待ちください。',
            ephemeral: true
        });

        // Log to console
        console.log(`[App] New modal application from ${interaction.user.tag} for ${tier}`);

    } catch (err) {
        console.error('[App] Modal Save Error:', err);
        await interaction.reply({
            content: '❌ 申請の保存中にエラーが発生しました。時間を置いて再度お試しください。',
            ephemeral: true
        });
    }
}

module.exports = { handleApplicationMessage, handleApplicationModal };
