const { EmbedBuilder } = require('discord.js');

module.exports = async (interaction) => {
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor(((uptime % 86400) % 3600) / 60);
    const seconds = Math.floor(((uptime % 86400) % 3600) % 60);

    const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('System Status')
        .addFields(
            { name: 'Uptime', value: uptimeString, inline: true },
            { name: 'Memory Usage', value: `${memoryUsage.toFixed(2)} MB`, inline: true },
            { name: 'Ping', value: `${interaction.client.ws.ping}ms`, inline: true },
            { name: 'Node Version', value: process.version, inline: true },
            { name: 'Keep-Alive Target', value: process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'Not Set', inline: true }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
};
