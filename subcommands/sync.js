const { syncSubscriptions } = require('../sync');

module.exports = async (interaction) => {
    await interaction.deferReply({ ephemeral: true });
    const result = await syncSubscriptions(interaction.client);
    if (result.success) {
        await interaction.editReply(`同期完了。更新数: ${result.updated}`);
    } else {
        await interaction.editReply(`同期エラー: ${result.message || '不明なエラー'}`);
    }
};
