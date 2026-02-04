const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const adminCommands = [
    new SlashCommandBuilder()
        .setName('sync')
        .setDescription('Manually sync subscriptions with roles')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('setup_vc')
        .setDescription('Setup Support VC creation panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('generate_key')
        .setDescription('Generate a one-time license key')
        .addStringOption(option =>
            option.setName('tier').setDescription('Plan tier (Pro/Pro+)').setRequired(true)
                .addChoices({ name: 'Pro', value: 'Pro' }, { name: 'Pro+', value: 'Pro+' }))
        .addIntegerOption(option =>
            option.setName('months').setDescription('Duration in months').setRequired(true))
        .addStringOption(option =>
            option.setName('note').setDescription('Memo for this key'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

const publicCommands = [
    new SlashCommandBuilder()
        .setName('activate')
        .setDescription('Activate subscription for a server')
        .addStringOption(option =>
            option.setName('server_id').setDescription('Server ID (Optional if used in the server)').setRequired(false))
        .addStringOption(option =>
            option.setName('key').setDescription('License Key or Booth Order Number').setRequired(false))
];


const commands = [...adminCommands, ...publicCommands];

async function handleInteraction(interaction) {
    if (interaction.isButton()) {
        if (interaction.customId === 'create_support_vc') {
            await handleSupportVCButton(interaction);
        } else if (interaction.customId === 'delete_support_vc') {
            await handleDeleteVCButton(interaction);
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    if (['sync', 'activate', 'setup_vc', 'generate_key'].includes(interaction.commandName)) {
        try {
            // Dynamic import based on command name
            // Note: Use commandName directly as filenames match (list.js, check.js, sync.js)
            const commandHandler = require(`./subcommands/${interaction.commandName}`);
            await commandHandler(interaction);
        } catch (error) {
            console.error(`Error executing command ${interaction.commandName}:`, error);
            // Only reply if not already replied/deferred
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: 'エラーが発生しました。', flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.followUp({ content: 'エラーが発生しました。', flags: MessageFlags.Ephemeral });
                }
            } catch (replyError) {
                console.error('Failed to send error message to user:', replyError);
            }
        }
    }
}

async function handleSupportVCButton(interaction) {
    const guild = interaction.guild;
    const user = interaction.user;
    const member = interaction.member;

    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Create VC
        const channelName = `support-${user.username}`;

        // Find parent category of the channel where button was clicked
        const parentCategory = interaction.channel.parent;

        const vc = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildVoice,
            parent: parentCategory ? parentCategory.id : null,
            permissionOverwrites: [
                {
                    id: guild.id, // @everyone
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: user.id, // Creator
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak],
                },
                // Add permissions for Admins/Mods if needed. 
                // By default, Admins usually have ViewChannel override.
                // Assuming "Server Admins" have Administrator permission, they see everything.
            ],
        });

        // Notify Owner
        const owner = await guild.fetchOwner();
        try {
            await owner.send({
                content: `🔔 **サポートVC作成通知**\n\n**サーバー:** ${guild.name}\n**ユーザー:** ${user.tag} (${user.id})\n**チャンネル:** ${vc.url}`
            });
        } catch (dmError) {
            console.error('Failed to send DM to owner:', dmError);
            // Optionally notify in the interaction that DM failed but VC created
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

        // Find the channel
        const channel = guild.channels.cache.find(c =>
            (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildText) &&
            c.name.toLowerCase() === channelName
        );

        if (!channel) {
            return await interaction.editReply({
                content: `❌ **サポート用ボイスチャンネルが見つかりませんでした。**\n名前: \`${channelName}\``
            });
        }

        // Delete the channel
        await channel.delete(`Support VC closed by ${user.tag}`);

        // Notify Owner
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

module.exports = { commands, adminCommands, publicCommands, handleInteraction };
