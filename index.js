require('dotenv').config(); // Load env vars FIRST
const { Client, GatewayIntentBits, Events, ActivityType } = require('discord.js');

// Enviroment Variable Check
const envVars = [
    'DATABASE_URL',
    'DISCORD_TOKEN',
    'CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'ADMIN_TOKEN',
    'PUBLIC_URL'
];
console.log('>>> Environment Check:');
envVars.forEach(key => {
    const val = process.env[key];
    console.log(`[Env] ${key}: ${val ? (key.includes('TOKEN') || key.includes('SECRET') || key.includes('URL') ? (val.length > 10 ? val.substring(0, 5) + '...' : '***') : val) : 'MISSING'}`);
});
const db = require('./db');
const { commands, handleInteraction } = require('./commands');
const { syncSubscriptions } = require('./sync');
const { checkExpirations } = require('./expiry');
const { startServer } = require('./server');

console.log('>>> Starting Bot Application...');

// 1. Initialize Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Debug Logging (Optional)
if (process.env.DEBUG_DISCORD === 'true') {
    client.on('debug', info => console.log(`[Discord Debug] ${info}`));
}


// Presence Helper
const setBotPresence = () => {
    if (client.user) {
        client.user.setPresence({
            activities: [{ name: '/help | 管理ツール', type: ActivityType.Playing }],
            status: 'online'
        });
    }
};

// Event Handlers
client.once(Events.ClientReady, async () => {
    console.log(`>>> [Discord] Logged in as ${client.user.tag}!`);
    setBotPresence();

    // Start background tasks
    const runBackgroundTasks = async () => {
        try {
            console.log('[Background] Running sync and expiry check...');
            await syncSubscriptions(client);
            await checkExpirations(client);
        } catch (err) {
            console.error('[Background] Tasks failed:', err.message);
        }
    };

    runBackgroundTasks();
    setInterval(runBackgroundTasks, 300000); // 5 mins
    console.log('[Background] Periodic tasks scheduled (5m).');
});

client.on('interactionCreate', handleInteraction);

client.on('messageCreate', async (message) => {
    // Import handler here to avoid circular dependencies
    const { handleApplicationMessage } = require('./handlers/applicationHandler');
    await handleApplicationMessage(message, client);
});

client.on('error', error => console.error('[Discord] Client Error:', error));
client.on('shardError', error => console.error('[Discord] WS Error:', error));
client.on('shardDisconnect', (event, id) => console.log(`[Discord] Shard ${id} disconnected.`));
client.on('shardReady', (id) => {
    console.log(`[Discord] Shard ${id} is ready.`);
    setBotPresence();
});

// Auto Role sync on Member Join
client.on(Events.GuildMemberAdd, async (member) => {
    if (member.guild.id !== process.env.SUPPORT_GUILD_ID) return;

    console.log(`[Discord] Member joined support guild: ${member.user.tag}`);
    try {
        // 1. Assign initial "User" role
        const initialRoleId = process.env.ROLE_USER_ID;
        if (initialRoleId) {
            await member.roles.add(initialRoleId).catch(e => console.error('[Discord] Failed to add User role:', e));
        }

        const res = await db.query('SELECT plan_tier FROM subscriptions WHERE user_id = $1 AND is_active = TRUE', [member.id]);
        if (res.rows.length > 0) {
            // Find highest tier
            let tier = 'Pro';
            if (res.rows.some(r => r.plan_tier === 'Pro+')) tier = 'Pro+';

            const { updateMemberRoles } = require('./sync');
            await updateMemberRoles(member.guild, member.id, tier);
            console.log(`[Discord] Auto-assigned ${tier} role to joined member ${member.user.tag}`);
        }
    } catch (err) {
        console.error('[Discord] Error in auto-role assignment on join:', err);
    }
});

// Main Startup Flow
async function main() {
    try {
        // 2. Start Web Server
        startServer(client);
        console.log('[Web] Server started.');

        // 3. Initialize Database
        await db.initDB();
        console.log('[DB] Database initialized.');

        // 4. Setup Keep-Alive (Render Support)
        // 4. Setup Public URL Log
        const PUBLIC_URL = process.env.PUBLIC_URL;
        if (PUBLIC_URL) {
            console.log(`[Config] Public URL configured: ${PUBLIC_URL}`);
        } else {
            console.warn('[Config] PUBLIC_URL is not set. OAuth redirects may fail.');
        }

        // 5. Login to Discord
        if (!process.env.DISCORD_TOKEN) {
            throw new Error('DISCORD_TOKEN is missing from environment variables!');
        }
        const token = process.env.DISCORD_TOKEN.trim();

        // DEBUG: Token Validation Log
        const tokenLength = token.length;
        const tokenStart = token.substring(0, 5);
        console.log(`[Debug] Token check: Length=${tokenLength}, StartsWith=${tokenStart}...`);

        console.log('[Discord] Attempting login...');
        await client.login(token);
        console.log('[Discord] Login call completed (waiting for ClientReady).');

    } catch (error) {
        console.error('FATAL STARTUP ERROR:', error);
        process.exit(1);
    }
}

// Global Error Handlers (Safety Net)
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Execute Main
main();
