const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { pool } = require('../db');
require('dotenv').config();

const TIER_VALUE_FREE = 'Free';
const BOOTH_URL = 'https://imomusi0213.booth.pm/items/7935721';

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once('ready', async () => {
    console.log(`[ForceCron] Logged in as ${client.user.tag}`);
    await runCronLogic(client);
    console.log('[ForceCron] Finished.');
    client.destroy();
    process.exit(0);
});

async function runCronLogic(client) {
    console.log('[ForceCron] Running expiry check logic...');
    try {
        const getTierName = (t) => {
            if (t === '1' || t === 1) return 'Pro';
            if (t === '2' || t === 2) return 'Pro (Yearly)';
            if (t === '3' || t === 3) return 'Pro+';
            if (t === '4' || t === 4) return 'Pro+ (Yearly)';
            return t || 'Free';
        };

        // 1. Check for subscriptions expiring within 7 days (warning notification)
        const res = await pool.query(`
            SELECT guild_id, user_id, tier, expiry_date, auto_renew 
            FROM subscriptions 
            WHERE is_active = TRUE 
            AND expiry_date <= NOW() + INTERVAL '7 days' 
            AND expiry_warning_sent = FALSE 
            AND tier NOT IN ('Free', '0')
        `);


        if (res.rows.length === 0) {
            console.log('[ForceCron] No subscriptions found needing 7-day warning.');
        } else {
            console.log(`[ForceCron] Found ${res.rows.length} subscriptions to warn.`);
        }

        for (const sub of res.rows) {
            const guildId = sub.guild_id;
            const tierName = getTierName(sub.tier);

            try {
                const guild = await client.guilds.fetch(guildId).catch(() => null);
                // Try fetching user even if not in cache
                const user = await client.users.fetch(sub.user_id).catch(() => null);

                if (user) {
                    const embed = new EmbedBuilder()
                        .setTitle('📅 サブスクリプション期限のお知らせ')
                        .setDescription(`ご利用ありがとうございます。お使いの **${tierName}プラン** の有効期限がまもなく終了します。`)
                        .addFields(
                            { name: 'サーバー', value: guild ? guild.name : `ID: ${guildId}` },
                            { name: '期限', value: new Date(sub.expiry_date).toLocaleDateString() },
                            { name: '自動更新', value: sub.auto_renew ? '有効 (自動的に更新されます)' : '無効 (期限後にFreeプランへ移行します)' }
                        )
                        .setColor(sub.auto_renew ? 0x00ff00 : 0xffa500)
                        .setTimestamp();

                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setLabel('有料版をBOOTHで購入')
                                .setStyle(ButtonStyle.Link)
                                .setURL(BOOTH_URL)
                        );

                    await user.send({ embeds: [embed], components: [row] }).catch((e) => console.error(`Failed to DM user ${user.id}:`, e.message));
                    await pool.query('UPDATE subscriptions SET expiry_warning_sent = TRUE WHERE guild_id = $1', [guildId]);
                    console.log(`[ForceCron] Warning sent to user ${user.tag} for guild ${guildId}`);
                } else {
                    console.log(`[ForceCron] User ${sub.user_id} not found.`);
                }
            } catch (err) {
                console.error(`[ForceCron] Failed to process warning for guild ${guildId}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[ForceCron] Error in logic:', err);
    }
}

client.login(process.env.DISCORD_TOKEN);
