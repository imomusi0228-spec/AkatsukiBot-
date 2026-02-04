const { MessageFlags } = require('discord.js');
require('dotenv').config();

module.exports = async (interaction) => {
    const url = process.env.PUBLIC_URL || 'http://localhost:3000';
    await interaction.reply({
        content: `管理機能はWeb UIに統合されました。\n以下のURLからアクセスしてください。\n${url}`,
        flags: MessageFlags.Ephemeral
    });
};
