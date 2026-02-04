const db = require('./db');
const { updateMemberRoles } = require('./sync');

const SUPPORT_GUILD_ID = process.env.SUPPORT_GUILD_ID;

/**
 * Checks for expired subscriptions and downgrades them to Free.
 * @param {import('discord.js').Client} client 
 */
async function checkExpirations(client) {
    console.log('Checking for expired subscriptions...');
    try {
        const res = await db.query(`
            SELECT * FROM subscriptions 
            WHERE plan_tier != 'Free' 
            AND is_active = TRUE 
            AND expiry_date IS NOT NULL 
            AND expiry_date < NOW()
        `);

        if (res.rows.length === 0) {
            console.log('No expired subscriptions found.');
            return;
        }

        const guild = await client.guilds.fetch(SUPPORT_GUILD_ID).catch(console.error);
        if (!guild) {
            console.error(`Support guild ${SUPPORT_GUILD_ID} not found for expiry check.`);
            return;
        }

        for (const sub of res.rows) {
            console.log(`Processing expiry for Server: ${sub.server_id}, User: ${sub.user_id}`);

            // 1. Remove Roles & Notify
            try {
                await updateMemberRoles(guild, sub.user_id, 'Free');

                const member = await guild.members.fetch(sub.user_id).catch(() => null);
                if (member) {
                    // Send DM
                    const boothUrl = process.env.BOOTH_URL || 'https://booth.pm/';
                    await member.send({
                        content: `**【重要】AkatsukiBot サブスクリプション期限切れのお知らせ**\n\n平素よりAkatsukiBotをご利用いただきありがとうございます。\n\nBotを導入しているサーバー (ID: ${sub.server_id}) のプラン有効期限が切れ、**Freeプラン**へ変更されました。\nPro/Pro+機能を引き続きご利用いただくには、再度サブスクリプションの購入をお願いいたします。\n\n🛒 **プランの購入・更新はこちら:**\n${boothUrl}`
                    }).catch(e => console.warn(`Failed to send DM to ${member.user.tag}: ${e.message}`));
                }
            } catch (err) {
                console.error(`Failed to notify/remove roles for ${sub.user_id}:`, err);
            }


            // 2. Update DB to Free
            // We clear expiry_date because Free doesn't expire (or we could set it to null)
            await db.query(`
                UPDATE subscriptions 
                SET plan_tier = 'Free', expiry_date = NULL, notes = COALESCE(notes, '') || E'\\n[Auto] Expired to Free' 
                WHERE server_id = $1
            `, [sub.server_id]);

            // 3. Log
            await db.query(`
                INSERT INTO subscription_logs (server_id, action, details) 
                VALUES ($1, $2, $3)
            `, [sub.server_id, 'EXPIRED_AUTO', `Downgraded to Free from ${sub.plan_tier}`]);
        }
        console.log(`Processed ${res.rows.length} expired subscriptions.`);

    } catch (err) {
        console.error('Error in checkExpirations:', err);
    }
}

module.exports = { checkExpirations };
