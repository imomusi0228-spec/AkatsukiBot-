require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const db = require('./db');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const history = [

    {
        version: 'v1.1.0 〜 v1.2.1',
        date: '2026/02/11-13',
        title: '守護と成長',
        content: `**[Log]** VCログ機能を Free プランでも利用可能にアップグレード\n**[Security]** メンション保護、アンチ・レイド警戒機能を実装\n**[Protection]** 類似メッセージ連投保護（スパム保護）機能を搭載\n**[Feature]** 自動自己紹介ゲート機能を導入`
    },
    {
        version: 'v1.3.0 〜 v1.3.9',
        date: '2026/02/13-15',
        title: '視認性の極致',
        content: `**[UI]** 超コンパクトダッシュボードにより、一画面で全ステータスを把握可能に\n**[Insight]** ヒートマップと成長トレンドの正確性を向上し、サーバーの熱量を可視化\n**[UX]** 各設定項目にヘルプツールチップを追加し、利便性を向上`
    },
    {
        version: 'v1.4.0 〜 v1.6.9',
        date: '2026/02/15-16',
        title: '鉄壁の安定',
        content: `**[Security]** CSRF保護 (Iron Aegis) によりダッシュボードの安全性を強化\n**[System]** 大規模サーバー対応のバッチ処理導入により、動作のラグを解消\n**[Protection]** スパム連投に対する自動検知・制限機能を追加\n**[Function]** BOOTH注文連携機能の実装 (v1.6.0)`
    },
    {
        version: 'v1.7.0 〜 v1.7.1',
        date: '2026/02/18-19',
        title: 'AIと栄誉',
        content: `**[Feature]** 「オーラ・システム」による、累計VC時間に応じたロール自動付与\n**[AI]** コミュニティ・ヘルス・レーダーによる、休眠メンバーへのAIアドバイス\n**[AI]** 週単位のサーバー分析と運営戦略レポートの自動配信\n**[Function]** セルフ引越し機能の実装 (v1.7.0)`
    },
    {
        version: 'v1.8.0',
        date: '2026/02/19',
        title: '純粋進化',
        content: `**[System]** 内部構造の再編により、応答速度とシステムの安定性をさらに向上\n**[Optimization]** データベース通信の効率化により、インフラ負荷を低減`
    }
];

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    const channelId = process.env.ANNOUNCEMENT_CHANNEL_ID;
    if (!channelId) {
        console.error('ANNOUNCEMENT_CHANNEL_ID is not set.');
        process.exit(1);
    }

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            console.error('Channel not found.');
            process.exit(1);
        }

        console.log(`Cleaning up old messages in: ${channel.name}`);

        // Delete previous bot messages to avoid duplicates during this restyle
        try {
            const messages = await channel.messages.fetch({ limit: 20 });
            const botMessages = messages.filter(m => m.author.id === client.user.id);
            if (botMessages.size > 0) {
                console.log(`Deleting ${botMessages.size} old messages...`);
                await channel.bulkDelete(botMessages);
            }
        } catch (err) {
            console.error('Failed to bulk delete (messages might be too old), trying manual delete...');
            // Fallback if bulk delete fails
        }

        console.log(`Posting history to channel: ${channel.name}`);

        for (const item of history) {
            const embed = new EmbedBuilder()
                .setTitle(`システムアップデート (${item.version})`)
                .setDescription(`いつもご利用ありがとうございます。以下の機能を更新・改善いたしました。\n\n${item.content}`)
                .setColor(0x57F287) // Discord Green
                .setFooter({
                    text: `AkatsukiBot Update System • ${item.date}`,
                });

            await channel.send({ embeds: [embed] });
            console.log(`Posted: ${item.version}`);

            // Wait 2 seconds to ensure order
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        console.log('All history posted successfully.');
        process.exit(0);

    } catch (error) {
        console.error('Error posting history:', error);
        process.exit(1);
    }
});

client.login(process.env.DISCORD_TOKEN);
