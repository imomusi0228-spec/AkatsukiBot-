const axios = require('axios');
const db = require('../db');
const pkg = require('../package.json');
const { EmbedBuilder } = require('discord.js');

const GITHUB_REPO = 'imomusi0228-spec/AkatsukiBot-';
const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

/**
 * Checks if the current version has been announced. If not, posts to Discord.
 * @param {import('discord.js').Client} client 
 */
async function checkForUpdates(client) {
    try {
        const currentVersion = pkg.version;
        console.log(`[Updates] Checking if version ${currentVersion} needs announcement...`);

        const settingsRes = await db.query("SELECT value FROM bot_system_settings WHERE key = 'last_announced_version'");
        const lastAnnounced = settingsRes.rows.length > 0 ? settingsRes.rows[0].value : null;

        if (currentVersion !== lastAnnounced) {
            // Special case for v1.6.0 transition: 
            // Since we already manually announced v1.6.0, we just mark it as announced in DB.
            if (currentVersion === '1.6.0' && !lastAnnounced) {
                console.log(`[Updates] Version ${currentVersion} already manually announced. Marking as done.`);
                await db.query(
                    "INSERT INTO bot_system_settings (key, value, updated_at) VALUES ('last_announced_version', $1, NOW()) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()",
                    [currentVersion]
                );
                return;
            }

            console.log(`[Updates] New version detected for announcement: ${currentVersion}`);

            // Fetch release info from GitHub for details
            let releaseNote = '新機能の追加と安定性の向上が行われました。';
            try {
                const response = await axios.get(RELEASES_API, {
                    headers: { 'Accept': 'application/vnd.github.v3+json' }
                });
                if (response.data && response.data.tag_name.includes(currentVersion)) {
                    releaseNote = response.data.body || releaseNote;
                }
            } catch (githubErr) {
                console.warn('[Updates] Could not fetch release notes from GitHub, using default message.');
            }

            const channelId = process.env.ANNOUNCEMENT_CHANNEL_ID;
            if (!channelId) {
                console.warn('[Updates] ANNOUNCEMENT_CHANNEL_ID not set. Skipping auto-announcement.');
                return;
            }

            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (channel) {
                const title = `🚀 【アップデート】AkatsukiBot v${currentVersion} 公開のお知らせ`;

                // Construct public-only content (Filtering internal info)
                const publicContent = `## 🚀 アップデート情報 (v${currentVersion})

AkatsukiBotが新しくなりました！今回の主な変更点は以下の通りです。

${releaseNote}

今後もより使いやすくなるよう改善を続けてまいります。ぜひご活用ください。`;

                const processedTitle = title;
                const processedContent = publicContent;

                const embed = new EmbedBuilder()
                    .setAuthor({
                        name: 'AkatsukiBot Update System',
                        iconURL: 'https://cdn.discordapp.com/emojis/1150654483737526312.png'
                    })
                    .setTitle(processedTitle)
                    .setDescription(processedContent)
                    .setColor(0x7aa2f7)
                    .setTimestamp()
                    .setFooter({
                        text: `AkatsukiBot | Version ${currentVersion}`,
                        iconURL: client.user.displayAvatarURL()
                    });

                await channel.send({ embeds: [embed] });
                console.log(`[Updates] Auto-announced version ${currentVersion}`);

                // Update database
                await db.query(
                    "INSERT INTO bot_system_settings (key, value, updated_at) VALUES ('last_announced_version', $1, NOW()) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()",
                    [currentVersion]
                );
            }
        }
    } catch (err) {
        console.error('[Updates] Error in auto-announcement:', err.message);
    }
}

module.exports = { checkForUpdates };
