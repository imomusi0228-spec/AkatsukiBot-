const axios = require('axios');
const db = require('../db');
const pkg = require('../package.json');

const GITHUB_REPO = 'imomusi0228-spec/AkatsukiBot-';
const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

/**
 * Checks for updates on GitHub and creates a draft announcement if a new version is found.
 * @param {import('discord.js').Client} client 
 * @returns {Promise<{newVersion: string|null, created: boolean}>}
 */
async function checkForUpdates(client) {
    try {
        console.log('[Updates] Checking GitHub for latest version...');
        const response = await axios.get(RELEASES_API, {
            headers: { 'Accept': 'application/vnd.github.v3+json' }
        });

        const latestRelease = response.data;
        const latestVersion = latestRelease.tag_name.replace(/^v/, '');
        const currentVersion = pkg.version;

        if (isNewerVersion(latestVersion, currentVersion)) {
            // Check if we've already notified about this version
            const settingsRes = await db.query("SELECT value FROM bot_system_settings WHERE key = 'last_notified_version'");
            const lastNotified = settingsRes.rows.length > 0 ? settingsRes.rows[0].value : null;

            if (lastNotified !== latestVersion) {
                console.log(`[Updates] New version found: ${latestVersion} (Current: ${currentVersion})`);

                // Create a draft announcement
                const title = `🚀 【アップデート予告】バージョン ${latestVersion} が公開されました`;
                const content = latestRelease.body || '新機能の追加と不具合の修正が行われました。詳細はGitHubを確認してください。';

                await db.query(
                    'INSERT INTO scheduled_announcements (title, content, type, scheduled_at, associated_tasks, is_draft) VALUES ($1, $2, $3, $4, $5, $6)',
                    [title, content, 'normal', new Date(), JSON.stringify([]), true]
                );

                // Update last notified version
                await db.query(
                    "INSERT INTO bot_system_settings (key, value, updated_at) VALUES ('last_notified_version', $1, NOW()) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()",
                    [latestVersion]
                );

                return { newVersion: latestVersion, created: true };
            }
        }

        return { newVersion: latestVersion, created: false };
    } catch (err) {
        console.error('[Updates] Error checking for updates:', err.message);
        return { newVersion: null, created: false };
    }
}

/**
 * Simple semver comparison (assuming x.y.z format)
 */
function isNewerVersion(latest, current) {
    const l = latest.split('.').map(Number);
    const c = current.split('.').map(Number);

    for (let i = 0; i < Math.max(l.length, c.length); i++) {
        const v1 = l[i] || 0;
        const v2 = c[i] || 0;
        if (v1 > v2) return true;
        if (v1 < v2) return false;
    }
    return false;
}

module.exports = { checkForUpdates };
