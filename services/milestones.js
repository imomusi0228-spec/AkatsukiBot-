/**
 * Milestone contents definition for announcement templates
 */
const MILESTONE_DEFINITIONS = {
    M1: {
        title: 'M1: 登録 & VC基本',
        content: '・ボットの初期登録プロセス\n・ボイスチャンネルの基本操作\n・サポート用VCの作成・削除'
    },
    M2: {
        title: 'M2: 多言語 & 監査',
        content: '・多言語対応（自動翻訳機能）\n・詳細な監査ログ（Audit Logs）の記録\n・アクション履歴の拡張'
    },
    M3: {
        title: 'M3: 分析 & データ',
        content: '・ユーザー利用統計の分析\n・サーバー成長データの可視化\n・詳細なアナリティクスダッシュボード'
    },
    M4: {
        title: 'M4: 高度なセキュリティ',
        content: '・不審なアクティビティの自動検知\n・高度な権限管理システム\n・セキュリティレポートの生成'
    },
    M5: {
        title: 'M5: すべて開放',
        content: '・予定されているすべての機能のアンロック\n・最優先サポートの提供\n・ベータ機能への早期アクセス'
    }
};

/**
 * Replaces placeholders in content with milestone details
 * @param {string} content 
 * @returns {string} processed content
 */
function replaceMilestonePlaceholders(content) {
    if (!content) return content;

    let processedContent = content;
    for (const [key, detail] of Object.entries(MILESTONE_DEFINITIONS)) {
        const placeholder = `{{${key}}}`;
        if (processedContent.includes(placeholder)) {
            const replacement = `**${detail.title}**\n${detail.content}`;
            processedContent = processedContent.replaceAll(placeholder, replacement);
        }
    }

    return processedContent;
}

module.exports = {
    MILESTONE_DEFINITIONS,
    replaceMilestonePlaceholders
};
