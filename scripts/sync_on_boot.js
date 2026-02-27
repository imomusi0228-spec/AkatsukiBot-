const fs = require('fs/promises');
const path = require('path');
const db = require('../db');

/**
 * 起動時にお知らせチャンネルを初期化し、履歴を同期する
 */
async function syncOnBoot(client) {
    try {
        const syncFlagPath = path.join(__dirname, '..', '.synced_v2.9.0');

        // 既に同期済みならスキップ（重複投稿防止）
        try {
            await fs.access(syncFlagPath);
            console.log('[SyncOnBoot] Already synced. Skipping.');
            return;
        } catch (e) {
            // Not synced yet
        }

        console.log('[SyncOnBoot] Starting channel reset and history sync...');

        const channelId = process.env.ANNOUNCEMENT_CHANNEL_ID;
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) {
            console.error('[SyncOnBoot] Announcement channel not found.');
            return;
        }

        // 1. 自身のメッセージを削除
        let messages = await channel.messages.fetch({ limit: 100 });
        for (const msg of messages.values()) {
            if (msg.author.id === client.user.id) {
                await msg.delete().catch(() => { });
            }
        }
        console.log('[SyncOnBoot] Channel cleared.');

        // 2. 履歴を読み込み
        const logData = await fs.readFile(path.join(__dirname, '..', 'UPDATE_LOG_SYNC.md'), 'utf-8');
        const sections = logData.split(/\n---\n/).filter(s => s.trim().startsWith("## v"));
        const reversedSections = sections.reverse();

        // 3. 順次投稿
        for (const section of reversedSections) {
            const match = section.match(/## (v[\d.〜]+)/);
            if (!match) continue;

            const version = match[1];
            const isFix = section.includes("システム修正");
            const title = isFix
                ? `システム修正のお知らせ（${version}）`
                : `システムアップデートのお知らせ（${version}）`;
            const content = section.replace(/^## .*?\n/, "").trim();

            const embed = {
                author: {
                    name: 'AkatsukiBot Update System',
                    icon_url: 'https://cdn.discordapp.com/emojis/1150654483737526312.png'
                },
                title: `🚀 ${title}`,
                description: content,
                color: isFix ? 0xF1C40F : 0x2ECC71,
                timestamp: new Date().toISOString(),
                footer: {
                    text: `AkatsukiBot | Official Announcement`,
                    icon_url: client.user.displayAvatarURL()
                }
            };

            await channel.send({ embeds: [embed] });
            await new Promise(r => setTimeout(r, 1000));
        }

        // DBの送信済み履歴もリセット
        await db.query("DELETE FROM scheduled_announcements WHERE sent_at IS NOT NULL");

        // 同期完了フラグを作成（RailwayのEphemeralなファイルシステムなので、再デプロイ時には再実行されるが
        // 通常の再起動では抑止される。本番で一度走れば良いのでこれで十分）
        await fs.writeFile(syncFlagPath, 'synced').catch(() => { });

        console.log('[SyncOnBoot] History sync completed successfully.');
    } catch (err) {
        console.error('[SyncOnBoot] Error during sync:', err);
    }
}

module.exports = syncOnBoot;
