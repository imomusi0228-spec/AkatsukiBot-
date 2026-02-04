const { ChannelType, PermissionsBitField, MessageFlags } = require('discord.js');

async function handleSupportVCButton(interaction) {
    const guild = interaction.guild;
    const user = interaction.user;

    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const channelName = `support-${user.username}`;
        const parentCategory = interaction.channel.parent;

        const vc = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildVoice,
            parent: parentCategory ? parentCategory.id : null,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: user.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak],
                },
            ],
        });

        const owner = await guild.fetchOwner();
        try {
            await owner.send({
                content: `🔔 **サポートVC作成通知**\n\n**サーバー:** ${guild.name}\n**ユーザー:** ${user.tag} (${user.id})\n**チャンネル:** ${vc.url}`
            });
        } catch (dmError) {
            console.error('Failed to send DM to owner:', dmError);
        }

        await interaction.editReply({
            content: `✅ **サポート用ボイスチャンネルを作成しました。**\n\nここをクリックして移動: <#${vc.id}>`
        });

    } catch (error) {
        console.error('Error creating support VC:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'エラーが発生しました。', flags: MessageFlags.Ephemeral });
        } else {
            await interaction.editReply({ content: 'エラーが発生しました。' });
        }
    }
}

async function handleDeleteVCButton(interaction) {
    const guild = interaction.guild;
    const user = interaction.user;

    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const channelName = `support-${user.username}`.toLowerCase();
        const channel = guild.channels.cache.find(c =>
            (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildText) &&
            c.name.toLowerCase() === channelName
        );

        if (!channel) {
            return await interaction.editReply({
                content: `❌ **サポート用ボイスチャンネルが見つかりませんでした。**\n名前: \`${channelName}\``
            });
        }

        await channel.delete(`Support VC closed by ${user.tag}`);

        const owner = await guild.fetchOwner();
        try {
            await owner.send({
                content: `🗑️ **サポートVC削除通知**\n\n**サーバー:** ${guild.name}\n**ユーザー:** ${user.tag} (${user.id})\n**チャンネル:** ${channelName} (削除済み)`
            });
        } catch (dmError) {
            console.error('Failed to send DM to owner on deletion:', dmError);
        }

        await interaction.editReply({
            content: `✅ **サポート用ボイスチャンネルを削除しました。**`
        });

    } catch (error) {
        console.error('Error deleting support VC:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'エラーが発生しました。', flags: MessageFlags.Ephemeral });
        } else {
            await interaction.editReply({ content: 'エラーが発生しました。' });
        }
    }
}

module.exports = {
    handleSupportVCButton,
    handleDeleteVCButton
};
