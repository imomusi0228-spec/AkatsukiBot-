const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const adminCommands = [
    new SlashCommandBuilder()
        .setName('list')
        .setDescription('List all active subscriptions')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('check')
        .setDescription('Check subscription status for a server')
        .addStringOption(option =>
            option.setName('server_id').setDescription('Server ID').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('sync')
        .setDescription('Manually sync subscriptions with roles')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('setup_vc')
        .setDescription('Setup Support VC creation panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

const publicCommands = [
    new SlashCommandBuilder()
        .setName('activate')
        .setDescription('Activate subscription for a server')
        .addStringOption(option =>
            option.setName('server_id').setDescription('Server ID').setRequired(false))
];

const commands = [...adminCommands, ...publicCommands]; // For backward compatibility if needed, or simple iteration

async function handleInteraction(interaction) {
    if (interaction.isButton()) {
        if (interaction.customId === 'create_support_vc') {
            await handleSupportVCButton(interaction);
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    if (['list', 'check', 'sync', 'activate', 'setup_vc'].includes(interaction.commandName)) {
        try {
            // Dynamic import based on command name
            // Note: Use commandName directly as filenames match (list.js, check.js, sync.js)
            const commandHandler = require(`./subcommands/${interaction.commandName}`);
            await commandHandler(interaction);
        } catch (error) {
            console.error(`Error executing command ${interaction.commandName}:`, error);
            // Only reply if not already replied/deferred
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'エラーが発生しました。', flags: MessageFlags.Ephemeral });
            } else {
                await interaction.followUp({ content: 'エラーが発生しました。', flags: MessageFlags.Ephemeral });
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

module.exports = { commands, adminCommands, publicCommands, handleInteraction };
