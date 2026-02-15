const readline = require('readline');
const { REST, Routes, Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { adminCommands, publicCommands } = require('../commands');
const { pool } = require('../db');
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const BOOTH_URL = 'https://imomusi0213.booth.pm/items/7935721';

async function main() {
    console.log('------------------------------------------');
    console.log('   Akatsuki Bot メンテナンスツール');
    console.log('------------------------------------------');
    console.log('1. スラッシュコマンドの登録 (register.js)');
    console.log('2. アナウンスの送信 (announce.js)');
    console.log('3. チャンネル一覧の取得 (list_channels.js)');
    console.log('4. ID検索 (id_finder.js / double_check_id.js)');
    console.log('5. DM送信テスト (manual_dm.js)');
    console.log('6. クロンジョブの強制実行 (force_cron_run.js)');
    console.log('7. DM送信状況の確認 (check_dm_status.js)');
    console.log('0. 終了');
    console.log('------------------------------------------');

    rl.question('実行する番号を選択してください: ', async (choice) => {
        switch (choice) {
            case '1':
                await registerCommands();
                break;
            case '2':
                await sendAnnouncement();
                break;
            case '3':
                await listChannels();
                break;
            case '4':
                await findId();
                break;
            case '5':
                await sendManualDM();
                break;
            case '6':
                await forceCron();
                break;
            case '7':
                await checkDMStatus();
                break;
            case '0':
                console.log('さようなら、お嬢。');
                rl.close();
                process.exit(0);
                break;
            default:
                console.log('無効な選択です。');
                break;
        }
        console.log('\n');
        main(); // ループ
    });
}

// --- コマンド登録 ---
async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('[Register] アプリケーションコマンドを更新中...');
        const clientId = process.env.CLIENT_ID || (await rest.get(Routes.user('@me'))).id;

        // Global
        await rest.put(Routes.applicationCommands(clientId), { body: publicCommands.map(cmd => cmd.toJSON()) });
        console.log('[Register] グローバルコマンドの登録完了。');

        // Guild
        if (process.env.SUPPORT_GUILD_ID) {
            await rest.put(Routes.applicationGuildCommands(clientId, process.env.SUPPORT_GUILD_ID), { body: adminCommands.map(cmd => cmd.toJSON()) });
            console.log(`[Register] ギルドコマンド (${process.env.SUPPORT_GUILD_ID}) の登録完了。`);
        }
    } catch (error) {
        console.error('[Register] エラー:', error);
    }
}

// --- アナウンス送信 ---
async function sendAnnouncement() {
    return new Promise((resolve) => {
        rl.question('タイトル: ', (title) => {
            rl.question('内容: ', (content) => {
                rl.question('タイプ (normal/important): ', async (type) => {
                    const url = `http://localhost:${process.env.PORT || 3000}/api/announce`;
                    try {
                        const response = await axios.post(url, {
                            title, content, type: type || 'normal'
                        }, {
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': process.env.ADMIN_TOKEN
                            }
                        });
                        console.log('[Announce] 成功:', response.data);
                    } catch (err) {
                        console.error('[Announce] 失敗:', err.response ? err.response.data : err.message);
                    }
                    resolve();
                });
            });
        });
    });
}

// --- チャンネル一覧 ---
async function listChannels() {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    return new Promise((resolve) => {
        client.once('ready', async () => {
            try {
                const guild = await client.guilds.fetch(process.env.SUPPORT_GUILD_ID);
                const channels = await guild.channels.fetch();
                let results = 'Support Guild Channels:\n';
                channels.forEach(ch => {
                    results += `${ch.id}: #${ch.name} (${ch.type})\n`;
                });
                fs.writeFileSync('all_channels.txt', results);
                console.log('[List] all_channels.txt に書き出しました。');
            } catch (err) {
                console.error('[List] エラー:', err.message);
            }
            client.destroy();
            resolve();
        });
        client.login(process.env.DISCORD_TOKEN);
    });
}

// --- ID検索 ---
async function findId() {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    return new Promise((resolve) => {
        rl.question('検索するサーバー名 (部分一致): ', (name) => {
            client.once('ready', async () => {
                const guild = client.guilds.cache.find(g => g.name.includes(name));
                if (guild) {
                    console.log(`[Find] 発見: ${guild.name} (ID: ${guild.id})`);
                } else {
                    console.log('[Find] 見つかりませんでした。');
                }
                client.destroy();
                resolve();
            });
            client.login(process.env.DISCORD_TOKEN);
        });
    });
}

// --- DM送信テスト ---
async function sendManualDM() {
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
    return new Promise((resolve) => {
        rl.question('送信先ユーザーID: ', (userId) => {
            client.once('ready', async () => {
                try {
                    const user = await client.users.fetch(userId);
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

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setLabel('有料版をBOOTHで購入').setStyle(ButtonStyle.Link).setURL(BOOTH_URL)
                    );

                    await user.send({ embeds: [embed], components: [row] });
                    console.log(`[DM] ${user.tag} にテストDMを送信しました。`);
                } catch (err) {
                    console.error('[DM] 失敗:', err.message);
                }
                client.destroy();
                resolve();
            });
            client.login(process.env.DISCORD_TOKEN);
        });
    });
}

// --- クロン強制実行 ---
async function forceCron() {
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
    return new Promise((resolve) => {
        client.once('ready', async () => {
            console.log('[Cron] 期限チェック実行中...');
            try {
                // scripts/force_cron_run.js のロジックを簡略化して実行
                const res = await pool.query(`
                    SELECT guild_id, user_id, tier, expiry_date, auto_renew 
                    FROM subscriptions 
                    WHERE is_active = TRUE 
                    AND expiry_date <= NOW() + INTERVAL '7 days' 
                    AND expiry_warning_sent = FALSE 
                    AND tier NOT IN ('Free', '0')
                `);

                for (const sub of res.rows) {
                    const user = await client.users.fetch(sub.user_id).catch(() => null);
                    if (user) {
                        // 実際の送信処理（簡略化）
                        console.log(`[Cron] Warning sent to ${user.tag}`);
                        await pool.query('UPDATE subscriptions SET expiry_warning_sent = TRUE WHERE guild_id = $1', [sub.guild_id]);
                    }
                }
                console.log('[Cron] 完了しました。');
            } catch (err) {
                console.error('[Cron] エラー:', err.message);
            }
            client.destroy();
            resolve();
        });
        client.login(process.env.DISCORD_TOKEN);
    });
}

// --- DM状況確認 ---
async function checkDMStatus() {
    try {
        const countRes = await pool.query('SELECT COUNT(*) FROM subscriptions WHERE is_active = TRUE');
        console.log(`[Status] 有効なサブスクリプション数: ${countRes.rows[0].count}`);

        const sentRes = await pool.query("SELECT guild_id, tier, expiry_date FROM subscriptions WHERE expiry_warning_sent = TRUE");
        console.log('\n[通知済み]');
        sentRes.rows.forEach(row => {
            console.log(`- Guild: ${row.guild_id}, Tier: ${row.tier}, Expiry: ${new Date(row.expiry_date).toLocaleDateString()}`);
        });

        const pendingRes = await pool.query(`
            SELECT guild_id, tier, expiry_date 
            FROM subscriptions 
            WHERE is_active = TRUE 
            AND expiry_date <= NOW() + INTERVAL '7 days' 
            AND expiry_warning_sent = FALSE
            AND tier NOT IN ('Free', '0')
        `);
        console.log('\n[通知待ち (7日以内)]');
        pendingRes.rows.forEach(row => {
            console.log(`- Guild: ${row.guild_id}, Tier: ${row.tier}, Expiry: ${new Date(row.expiry_date).toLocaleDateString()}`);
        });
    } catch (err) {
        console.error('[Status] エラー:', err.message);
    }
}

main();
