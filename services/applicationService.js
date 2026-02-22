const db = require('../db');
const { sendWebhookNotification } = require('./notif');
const crypto = require('crypto');

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

        // Check for Auto-Approval rules
        const ruleCheck = await checkAutoApproval(boothName, content, authorName);
        if (ruleCheck) {
            console.log(`[AppService] Auto-approval triggered for App ID: ${resultId}`);
            await approveApplication(resultId, 'SYSTEM_AUTO', 'System (Auto)', true);
            await db.query('UPDATE applications SET auto_processed = TRUE WHERE id = $1', [resultId]);
        }

        return { success: true, id: resultId, auto_processed: !!ruleCheck };
    } catch (err) {
        console.error('[AppService] Error saving application:', err);
        throw err;
    }
}

/**
 * Checks if an application matches any auto-approval rules.
 */
async function checkAutoApproval(boothName, content, authorName = '') {
    try {
        const rules = await db.query('SELECT * FROM auto_approval_rules WHERE is_active = TRUE');
        for (const rule of rules.rows) {
            const matchType = rule.match_type || 'regex';
            let isMatch = false;

            if (matchType === 'name_match') {
                // Check if authorName exactly matches boothName (case-insensitive)
                if (authorName && boothName && authorName.toLowerCase().trim() === boothName.toLowerCase().trim()) {
                    isMatch = true;
                }
            } else if (matchType === 'exact') {
                if (boothName && boothName.toLowerCase().trim() === (rule.pattern || '').toLowerCase().trim()) {
                    isMatch = true;
                }
            } else {
                // Default: regex
                const pattern = new RegExp(rule.pattern, 'i');
                if (pattern.test(boothName) || pattern.test(content)) {
                    isMatch = true;
                }
            }

            if (isMatch) {
                // Extra safety: If tier_mode is follow_app, ensure we actually have a valid tier
                // If the app tier is missing or "Free", we might want to skip auto-approval
                // This will be handled in approveApplication, but we could return null here too.
                return rule;
            }
        }
    } catch (err) {
        console.error('[AppService] Error checking auto-approval:', err);
    }
    return null;
}

/**
 * Handles the approval process for an application.
 */
async function approveApplication(appId, operatorId, operatorName, isAuto = false) {
    const appRes = await db.query('SELECT * FROM applications WHERE id = $1', [appId]);
    if (appRes.rows.length === 0) throw new Error('Application not found');
    const app = appRes.rows[0];

    // 1. Determine Tier and Duration
    let tier = app.parsed_tier || 'Pro';
    let durationMonths = 1;
    let durationDays = null;

    // Check if it was auto-approved and use rule settings if available
    if (isAuto) {
        const rule = await checkAutoApproval(app.parsed_booth_name, app.content, app.author_name);
        if (rule) {
            // Priority: If tier_mode is follow_app, use app.parsed_tier
            if (rule.tier_mode === 'follow_app' && app.parsed_tier && app.parsed_tier !== 'Free') {
                tier = app.parsed_tier;
            } else {
                tier = rule.tier;
            }
            durationMonths = rule.duration_months;
            durationDays = rule.duration_days;
        }
    } else {
        // Default legacy logic for manual approval
        if (tier === 'Trial Pro') {
            durationMonths = 0;
            durationDays = 14;
        } else if (tier === 'Trial Pro+') {
            durationMonths = 0;
            durationDays = 7;
        }
    }

    // 2. Generate Key
    const randomBuffer = crypto.randomBytes(4);
    const key = `AK-${randomBuffer.toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const reservedUser = app.parsed_user_id || null;

    // 3. Insert into license_keys
    await db.query(`
        INSERT INTO license_keys (key_id, tier, duration_months, duration_days, reserved_user_id, notes)
        VALUES ($1, $2, $3, $4, $5, $6)
    `, [key, tier, durationMonths, durationDays, reservedUser, `Generated for App ID: ${appId} (${app.parsed_booth_name})`]);

    // 4. Update application status
    await db.query('UPDATE applications SET status = \'approved\', license_key = $1 WHERE id = $2', [key, appId]);

    // 5. Log
    const targetDesc = `${app.author_name} (${app.parsed_booth_name})`;
    await db.query(`
        INSERT INTO operation_logs (operator_id, operator_name, target_id, target_name, action_type, details, metadata)
        VALUES ($1, $2, $3, $4, 'APPROVE_APP', $5, $6)
    `, [
        operatorId,
        operatorName,
        appId,
        targetDesc,
        `${isAuto ? 'Auto-approved' : 'Approved'} application for ${tier}`,
        JSON.stringify({ tier, key, author_id: app.author_id, is_auto: isAuto })
    ]);

    // 6. Notify
    await sendWebhookNotification({
        title: isAuto ? '🤖 Auto-Approval Triggered' : '✅ Application Approved',
        description: `**Author:** ${app.author_name} (\`${app.author_id}\`)\n**Booth:** ${app.parsed_booth_name}\n**Tier:** ${tier}\n**Generated Key:** \`${key}\``,
        color: isAuto ? 0x3498db : 0x2ecc71,
        fields: [{ name: 'Operator', value: operatorName, inline: true }]
    });

    return { success: true, key, tier };
}

module.exports = { saveApplication, approveApplication, checkAutoApproval };
