const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { pool } = require('../db');
require('dotenv').config();

const TARGET_USER_ID = process.argv[2]; // Pass user ID as argument

if (!TARGET_USER_ID) {
    console.error('Usage: node scripts/manual_dm.js <USER_ID>');
    process.exit(1);
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    try {
        const user = await client.users.fetch(TARGET_USER_ID);
        if (!user) {
            console.error('User not found.');
            process.exit(1);
        }

        console.log(`Sending test DM to ${user.tag} (${user.id})...`);

        const embed = new EmbedBuilder()
            .setTitle('📅 【テスト】サブスクリプション期限のお知らせ')
            .setDescription(`これはテスト送信です。\nご利用ありがとうございます。お使いの **Proプラン** の有効期限がまもなく終了します。`)
            .addFields(
                { name: 'サーバー', value: 'Test Server' },
                { name: '期限', value: '2026/12/31' },
                { name: '自動更新', value: '無効 (期限後にFreeプランへ移行します)' }
            )
            .setColor(0xffa500)
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('有料版をBOOTHで購入')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://imomusi0213.booth.pm/items/7935721')
            );

        await user.send({ embeds: [embed], components: [row] });
        console.log('Test DM sent successfully!');

    } catch (err) {
        console.error('Failed to send DM:', err);
    } finally {
        client.destroy();
        // Force exit as pool might keep open
        process.exit(0);
    }
});

client.login(process.env.DISCORD_TOKEN);
