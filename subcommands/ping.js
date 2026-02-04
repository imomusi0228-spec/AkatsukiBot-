const { MessageFlags } = require('discord.js');

module.exports = async (interaction) => {
    await interaction.reply({ content: '🏓 Pong! ボットは正常に動作しています。', flags: MessageFlags.Ephemeral });
};
