// Only load dotenv if not in Firebase Functions environment
// Firebase Functions uses environment variables directly, not .env files
if (!process.env.FUNCTION_TARGET && !process.env.FUNCTION_NAME && !process.env.K_SERVICE) {
  try {
    require('dotenv').config();
  } catch (e) {
    // dotenv might fail if .env doesn't exist - that's okay
  }
}
const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder } = require('discord.js');
const { initializeRoleIds, getReward, formatRewardsEmbed } = require('./rewards');
const { 
  getUserCredits, 
  getDiscordLink, 
  linkDiscordAccount,
  unlinkDiscordAccount,
  deductCredits,
  logRedemption,
  getUserByEmail,
  getCreditTransactions,
  getUserRedemptions,
  processRefund,
  getUserTasks,
  createTask,
  updateTask,
  getUserRoutines,
  getUserStats,
  searchTasks,
  getUserNotificationSettings,
  updateUserNotificationSettings,
  unlockAnimation,
} = require('./firebase-utils');
const { sendRedemptionAlert, sendWelcomeMessage } = require('./notifications');
const logger = require('./logger');
const { adminCommands, handleAdminCredits, handleAdminLink, handleAdminRedemptions, handleAdminStats } = require('./admin-commands');
const { handleAIConversation, clearHistory } = require('./ai-chat');
const { detectTimezone, getUserTimezone, saveUserTimezone } = require('./timezone-utils');
const { runNotificationChecks } = require('./task-notifications');

const { Partials } = require('discord.js');

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message], // Required for DMs and threads
});

client.commands = new Collection();

// Store users in timezone setup process
// Map<userId, { state: 'awaiting_time' | 'awaiting_confirmation', detectedTimezone: {...} }>
const timezoneSetupState = new Map();

// Define user commands
const commands = [
  {
    name: 'link',
    description: 'Link your Discord account to your Lunchbox account',
    options: [
      {
        name: 'email',
        type: 3, // STRING
        description: 'Your Lunchbox account email',
        required: true,
      },
    ],
  },
  {
    name: 'oauth',
    description: 'Get OAuth link to securely link your account',
  },
  {
    name: 'credits',
    description: 'Check your credit balance',
  },
  {
    name: 'redeem',
    description: 'Redeem a reward with your credits',
    options: [
      {
        name: 'reward',
        type: 3, // STRING
        description: 'Reward ID to redeem',
        required: true,
        choices: [
          { name: '🥉 Bronze Badge (500 credits)', value: 'bronze-badge' },
          { name: '🥈 Silver Badge (1500 credits)', value: 'silver-badge' },
          { name: '🥇 Gold Badge (2500 credits)', value: 'gold-badge' },
          { name: '💎 Premium (5000 credits)', value: 'premium' },
          { name: '🌙 Better Dark (1200 credits)', value: 'dark-premium' },
          { name: '✨ Neon Theme (2500 credits)', value: 'neon-theme' },
          { name: '🌊 Ocean Theme (4000 credits)', value: 'ocean-theme' },
          { name: '🎯 Bounce Animation (6000 credits)', value: 'animation-bounce' },
          { name: '💫 Pulse Animation (8000 credits)', value: 'animation-pulse' },
          { name: '🌀 Rotate Animation (10000 credits)', value: 'animation-rotate' },
        ],
      },
    ],
  },
  {
    name: 'rewards',
    description: 'View available rewards',
  },
  {
    name: 'history',
    description: 'View your credit transaction history',
  },
  {
    name: 'unlink',
    description: 'Unlink your Discord account from Lunchbox',
  },
  {
    name: 'refund',
    description: 'Refund a redeemed reward and get 75% credits back',
    options: [
      {
        name: 'reward',
        type: 3, // STRING
        description: 'Reward ID to refund',
        required: true,
        choices: [
          { name: '🥉 Bronze Badge', value: 'bronze-badge' },
          { name: '🥈 Silver Badge', value: 'silver-badge' },
          { name: '🥇 Gold Badge', value: 'gold-badge' },
          { name: '💎 Premium', value: 'premium' },
          { name: '🌙 Better Dark', value: 'dark-premium' },
          { name: '✨ Neon Theme', value: 'neon-theme' },
          { name: '🌊 Ocean Theme', value: 'ocean-theme' },
        ],
      },
    ],
  },
  {
    name: 'converse',
    description: 'Chat with Lunchbox AI assistant (can manage tasks if linked)',
    options: [
      {
        name: 'message',
        type: 3, // STRING
        description: 'Your message to the AI',
        required: true,
      },
      {
        name: 'visibility',
        type: 3, // STRING
        description: 'Who can see the response?',
        required: false,
        choices: [
          { name: 'Private (Only you)', value: 'private' },
          { name: 'Public (Everyone)', value: 'public' },
        ],
      },
    ],
  },
  {
    name: 'timezone',
    description: 'Set or change your timezone for accurate task times',
    options: [
      {
        name: 'action',
        type: 3, // STRING
        description: 'Set or view your timezone',
        required: false,
        choices: [
          { name: 'Change timezone', value: 'change' },
          { name: 'View current timezone', value: 'view' },
        ],
      },
    ],
  },
  {
    name: 'task-notify',
    description: 'Add or remove watchers for ALL your task completion notifications',
    options: [
      {
        name: 'action',
        type: 3, // STRING
        description: 'Add or remove a watcher, or view current watchers',
        required: true,
        choices: [
          { name: 'Add watcher', value: 'add' },
          { name: 'Remove watcher', value: 'remove' },
          { name: 'View watchers', value: 'view' },
        ],
      },
      {
        name: 'user',
        type: 3, // STRING
        description: 'Discord user mention (@username) or Discord user ID (for add/remove)',
        required: false,
      },
    ],
  },
  // High Priority Commands
  {
    name: 'tasks',
    description: 'View your tasks from Discord',
    options: [
      {
        name: 'filter',
        type: 3, // STRING
        description: 'Filter tasks',
        required: false,
        choices: [
          { name: 'All tasks', value: 'all' },
          { name: 'Pending tasks', value: 'pending' },
          { name: 'Completed tasks', value: 'completed' },
          { name: 'Overdue tasks', value: 'overdue' },
          { name: 'Today', value: 'today' },
          { name: 'This week', value: 'this-week' },
        ],
      },
      {
        name: 'limit',
        type: 4, // INTEGER
        description: 'Number of tasks to show (default: 10)',
        required: false,
      },
    ],
  },
  {
    name: 'task-create',
    description: 'Create a new task directly from Discord',
    options: [
      {
        name: 'text',
        type: 3, // STRING
        description: 'Task description',
        required: true,
      },
      {
        name: 'due-date',
        type: 3, // STRING
        description: 'Due date (e.g., "tomorrow 5pm", "next Monday")',
        required: false,
      },
      {
        name: 'tags',
        type: 3, // STRING
        description: 'Comma-separated tags',
        required: false,
      },
      {
        name: 'priority',
        type: 3, // STRING
        description: 'Task priority',
        required: false,
        choices: [
          { name: 'Low', value: 'low' },
          { name: 'Medium', value: 'medium' },
          { name: 'High', value: 'high' },
        ],
      },
    ],
  },
  {
    name: 'stats',
    description: 'View your productivity statistics',
    options: [
      {
        name: 'period',
        type: 3, // STRING
        description: 'Time period for statistics',
        required: false,
        choices: [
          { name: 'Today', value: 'today' },
          { name: 'This week', value: 'week' },
          { name: 'This month', value: 'month' },
          { name: 'All time', value: 'all-time' },
        ],
      },
    ],
  },
  {
    name: 'notifications',
    description: 'Manage your notification preferences',
    options: [
      {
        name: 'action',
        type: 3, // STRING
        description: 'Action to perform',
        required: true,
        choices: [
          { name: 'View settings', value: 'view' },
          { name: 'Enable notifications', value: 'enable' },
          { name: 'Disable notifications', value: 'disable' },
        ],
      },
      {
        name: 'type',
        type: 3, // STRING
        description: 'Notification type',
        required: false,
        choices: [
          { name: 'Due soon', value: 'due-soon' },
          { name: 'Overdue', value: 'overdue' },
          { name: 'Daily summary', value: 'daily-summary' },
          { name: 'Completions', value: 'completions' },
        ],
      },
    ],
  },
  // Medium Priority Commands
  {
    name: 'routines',
    description: 'View your routines and their status',
    options: [
      {
        name: 'filter',
        type: 3, // STRING
        description: 'Filter routines',
        required: false,
        choices: [
          { name: 'All routines', value: 'all' },
          { name: 'Active routines', value: 'active' },
          { name: 'Completed today', value: 'completed' },
          { name: 'Pending', value: 'pending' },
        ],
      },
    ],
  },
  {
    name: 'search',
    description: 'Search your tasks, routines, or notes',
    options: [
      {
        name: 'query',
        type: 3, // STRING
        description: 'Search term',
        required: true,
      },
      {
        name: 'type',
        type: 3, // STRING
        description: 'What to search',
        required: false,
        choices: [
          { name: 'Tasks', value: 'tasks' },
          { name: 'Routines', value: 'routines' },
          { name: 'All', value: 'all' },
        ],
      },
      {
        name: 'limit',
        type: 4, // INTEGER
        description: 'Number of results (default: 10)',
        required: false,
      },
    ],
  },
  {
    name: 'calendar',
    description: 'View your task calendar',
    options: [
      {
        name: 'view',
        type: 3, // STRING
        description: 'Calendar view',
        required: false,
        choices: [
          { name: 'Day', value: 'day' },
          { name: 'Week', value: 'week' },
          { name: 'Month', value: 'month' },
        ],
      },
      {
        name: 'date',
        type: 3, // STRING
        description: 'Specific date (YYYY-MM-DD)',
        required: false,
      },
    ],
  },
  {
    name: 'achievements',
    description: 'View your achievements and badges',
    options: [
      {
        name: 'filter',
        type: 3, // STRING
        description: 'Filter achievements',
        required: false,
        choices: [
          { name: 'All achievements', value: 'all' },
          { name: 'Unlocked', value: 'unlocked' },
          { name: 'Locked', value: 'locked' },
        ],
      },
    ],
  },
];

// Bot ready event
client.once('ready', async () => {
  logger.info('Bot is ready', { username: client.user.tag });
  
  // Initialize role IDs from environment
  initializeRoleIds();
  
  // Register commands
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  
  try {
    logger.info('Registering slash commands...');
    
    // Register user commands globally
    
    // Set up scheduled task notifications
    logger.info('Setting up task notification scheduler...');
    
    // Cron job: Check for completed tasks every 30 seconds
    // This ensures notifications are sent very quickly after task completion
    setInterval(async () => {
      try {
        const { checkCompletedTasks } = require('./task-notifications');
        await checkCompletedTasks(client);
        logger.debug('Cron: Completed tasks check finished');
      } catch (error) {
        logger.error('Error in completed tasks cron check', {
          error: error.message,
          stack: error.stack,
        });
      }
    }, 30 * 1000); // Every 30 seconds
    
    // Check for upcoming/overdue tasks every 5 minutes
    setInterval(async () => {
      try {
        const { checkTasksDueInOneHour, checkOverdueTasks } = require('./task-notifications');
        await Promise.all([
          checkTasksDueInOneHour(client),
          checkOverdueTasks(client),
        ]);
        logger.debug('Cron: Upcoming/overdue tasks check finished');
      } catch (error) {
        logger.error('Error in scheduled notification check', {
          error: error.message,
          stack: error.stack,
        });
      }
    }, 5 * 60 * 1000); // Every 5 minutes
    
    // Check for daily summary every minute (to catch 5 PM in any timezone)
    setInterval(async () => {
      try {
        const { sendDailySummary } = require('./task-notifications');
        await sendDailySummary(client);
      } catch (error) {
        logger.error('Error in daily summary check', {
          error: error.message,
          stack: error.stack,
        });
      }
    }, 60 * 1000); // Every minute
    
    // Run initial check after 30 seconds (give bot time to fully initialize)
    setTimeout(async () => {
      try {
        await runNotificationChecks(client);
        logger.info('Initial notification check completed');
      } catch (error) {
        logger.error('Error in initial notification check', {
          error: error.message,
        });
      }
    }, 30 * 1000);
    
    logger.info('Task notification scheduler initialized');
    
    // Register user commands globally
    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: commands }
    );
    
    // Register admin commands to guild
    if (process.env.DISCORD_GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
        { body: adminCommands }
      );
    }
    
    logger.info('Successfully registered slash commands');
  } catch (error) {
    logger.error('Failed to register commands', { error: error.message });
  }
});

// Handle slash commands and button interactions
client.on('interactionCreate', async (interaction) => {
  // Handle button interactions (consent requests)
  if (interaction.isButton()) {
    const customId = interaction.customId;
    if (customId && customId.startsWith('task_notify_consent_')) {
      await handleTaskNotifyConsent(interaction, customId);
      return;
    }
    return; // Ignore other button interactions
  }
  
  // Handle slash commands
  if (!interaction.isChatInputCommand()) return;
  
  const { commandName } = interaction;
  
  logger.debug('Command received', {
    command: commandName,
    userId: interaction.user.id,
    username: interaction.user.username,
  });
  
  try {
    // User commands
    if (commandName === 'link') {
      await handleLink(interaction);
    } else if (commandName === 'oauth') {
      await handleOAuth(interaction);
    } else if (commandName === 'credits') {
      await handleCredits(interaction);
    } else if (commandName === 'redeem') {
      await handleRedeem(interaction);
    } else if (commandName === 'rewards') {
      await handleRewards(interaction);
    } else if (commandName === 'history') {
      await handleHistory(interaction);
    } else if (commandName === 'unlink') {
      await handleUnlink(interaction);
    } else if (commandName === 'refund') {
      await handleRefund(interaction);
    } else if (commandName === 'converse') {
      await handleConverse(interaction);
    } else if (commandName === 'timezone') {
      await handleTimezone(interaction);
    } else if (commandName === 'task-notify') {
      await handleTaskNotify(interaction);
    } else if (commandName === 'tasks') {
      await handleTasks(interaction);
    } else if (commandName === 'task-create') {
      await handleTaskCreate(interaction);
    } else if (commandName === 'stats') {
      await handleStats(interaction);
    } else if (commandName === 'notifications') {
      await handleNotifications(interaction);
    } else if (commandName === 'routines') {
      await handleRoutines(interaction);
    } else if (commandName === 'search') {
      await handleSearch(interaction);
    } else if (commandName === 'calendar') {
      await handleCalendar(interaction);
    } else if (commandName === 'achievements') {
      await handleAchievements(interaction);
    }
    // Admin commands
    else if (commandName === 'admin-credits') {
      await handleAdminCredits(interaction);
    } else if (commandName === 'admin-link') {
      await handleAdminLink(interaction);
    } else if (commandName === 'admin-redemptions') {
      await handleAdminRedemptions(interaction);
    } else if (commandName === 'admin-stats') {
      await handleAdminStats(interaction);
    }
    
    logger.logCommand(commandName, interaction.user.id, interaction.user.username, true);
  } catch (error) {
    logger.error('Command error', {
      command: commandName,
      error: error.message,
      stack: error.stack,
    });
    logger.logCommand(commandName, interaction.user.id, interaction.user.username, false, error.message);
    
    const errorMessage = '❌ An error occurred while processing your command. Please try again later.';
    
    if (interaction.deferred) {
      await interaction.editReply(errorMessage);
    } else if (!interaction.replied) {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
});

// Handle all messages for AI conversation (DMs and threads)
client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;
  
  // Ignore empty messages
  if (!message.content || message.content.trim() === '') return;
  
  // Check if user is in timezone setup
  if (timezoneSetupState.has(message.author.id)) {
    await handleTimezoneSetupMessage(message);
    return;
  }
  
  const channelType = message.channel.type;
  const isThread = channelType === 11 || channelType === 12; // 11 = PUBLIC_THREAD, 12 = PRIVATE_THREAD
  const isDM = channelType === 1; // 1 = DM
  
  // Handle DMs
  if (isDM) {
    try {
      logger.info('DM received', {
        userId: message.author.id,
        username: message.author.username,
        content: message.content.substring(0, 100)
      });
      
      await handleAIConversation(message, false);
    } catch (error) {
      logger.error('DM handling error', {
        error: error.message,
        userId: message.author.id
      });
    }
    return;
  }
  
  // Handle thread messages
  if (isThread) {
    // Check if thread was created by our bot (check thread name pattern)
    if (!message.channel.name || !message.channel.name.includes('🤖 AI Chat')) {
      return;
    }
    
    try {
      logger.info('Thread message received', {
        userId: message.author.id,
        username: message.author.username,
        threadId: message.channel.id,
        threadName: message.channel.name,
        content: message.content.substring(0, 100)
      });
      
      const isPrivate = message.channel.name.includes('(Private)');
      await handleAIConversation(message, !isPrivate);
    } catch (error) {
      logger.error('Thread message handling error', {
        error: error.message,
        userId: message.author.id,
        threadId: message.channel.id,
        stack: error.stack
      });
      
      // Send error message to user
      try {
        await message.reply('❌ Sorry, I encountered an error. Please try again or contact support if this persists.');
      } catch (e) {
        logger.error('Failed to send error message', { error: e.message });
      }
    }
    return;
  }
});

// Command Handlers

async function handleLink(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const email = interaction.options.getString('email');
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return await interaction.editReply('❌ Invalid email format.');
  }
  
  // Check if already linked
  const existingLink = await getDiscordLink(interaction.user.id);
  if (existingLink) {
    return await interaction.editReply(`⚠️ Your account is already linked to **${existingLink.email}**. Use \`/unlink\` first if you want to link a different account.`);
  }
  
  // Find Firebase user by email
  const firebaseUser = await getUserByEmail(email);
  
  if (!firebaseUser) {
    return await interaction.editReply('❌ No Lunchbox account found with that email. Please make sure you\'re using the email you signed up with.');
  }
  
  // Link accounts
  await linkDiscordAccount(
    interaction.user.id,
    email,
    firebaseUser.uid,
    interaction.user.username,
    'manual'
  );
  
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('✅ Account Linked Successfully!')
    .setDescription(`Your Discord account has been linked to **${email}**\n\n⏰ **One more step:** Let's set up your timezone for accurate task times!`)
    .addFields(
      { name: '🌍 Set Your Timezone', value: 'Please reply with your **current time**. For example:\n• "it\'s 3pm"\n• "10:30am"\n• "my time is 2:45pm"' },
      { name: 'Next Steps (After Timezone)', value: '• Use `/credits` to check your balance\n• Use `/rewards` to browse rewards\n• Use `/redeem` to claim rewards' }
    )
    .setFooter({ text: 'Welcome to Lunchbox! Please reply with your current time.' })
    .setTimestamp();
  
  await interaction.editReply({ embeds: [embed] });
  
  // Set timezone setup state
  timezoneSetupState.set(interaction.user.id, {
    state: 'awaiting_time',
    userId: firebaseUser.uid,
  });
  
  logger.info('Timezone setup initiated for new user', {
    discordId: interaction.user.id,
    userId: firebaseUser.uid,
  });
  
  // Send welcome message
  await sendWelcomeMessage(interaction.user, email);
}

async function handleOAuth(interaction) {
  const oauthUrl = `${process.env.WEBSITE_URL}/auth/discord?userId=${interaction.user.id}`;
  
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🔗 Link Your Account via OAuth')
    .setDescription('Click the button below to securely link your Discord account to Lunchbox.')
    .addFields(
      { name: '🔒 Secure', value: 'OAuth provides a secure way to link accounts without sharing passwords' },
      { name: '⚡ Quick', value: 'Just click authorize and you\'re done!' }
    )
    .setFooter({ text: 'This link is private to you' });
  
  await interaction.reply({
    embeds: [embed],
    components: [{
      type: 1, // ACTION_ROW
      components: [{
        type: 2, // BUTTON
        style: 5, // LINK
        label: 'Link Account',
        url: oauthUrl,
      }],
    }],
    ephemeral: true,
  });
}

async function handleCredits(interaction) {
  await interaction.deferReply();
  
  // Check if account is linked
  const link = await getDiscordLink(interaction.user.id);
  
  if (!link) {
    return await interaction.editReply('❌ You haven\'t linked your account yet. Use `/link` or `/oauth` to get started!');
  }
  
  // Get credits
  const credits = await getUserCredits(link.uid);
  
  if (!credits) {
    return await interaction.editReply('❌ Could not retrieve credit information. Please try again later.');
  }
  
  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('💰 Your Credit Balance')
    .addFields(
      { name: 'Total Credits', value: `**${credits.totalCredits || 0}** credits`, inline: true },
      { name: 'Daily Streak', value: `${credits.dailyStreak || 0} days 🔥`, inline: true },
      { name: 'Bonus Multiplier', value: `${credits.bonusMultiplier || 1}x`, inline: true },
      { name: 'Account Info', value: `**Email:** ${link.email}\n**User ID:** \`${link.uid}\``, inline: false }
    )
    .setFooter({ text: `Linked to ${link.email}` })
    .setTimestamp();
  
  await interaction.editReply({ embeds: [embed] });
}

async function handleRedeem(interaction) {
  await interaction.deferReply();
  
  const rewardId = interaction.options.getString('reward');
  
  // Check if account is linked
  const link = await getDiscordLink(interaction.user.id);
  
  if (!link) {
    return await interaction.editReply('❌ You haven\'t linked your account yet. Use `/link` or `/oauth` to get started!');
  }
  
  // Get reward info
  const reward = getReward(rewardId);
  
  if (!reward) {
    return await interaction.editReply('❌ Invalid reward ID.');
  }
  
  logger.info(`[handleRedeem] Reward details: ${JSON.stringify({ id: reward.id, type: reward.type, animationId: reward.animationId, name: reward.name })}`);
  
  // Get user credits
  const credits = await getUserCredits(link.uid);
  
  if (!credits || credits.totalCredits < reward.cost) {
    const shortfall = reward.cost - (credits?.totalCredits || 0);
    return await interaction.editReply(`❌ Insufficient credits. You need **${shortfall} more credits** to redeem **${reward.name}**.`);
  }
  
  // Deduct credits
  const newBalance = await deductCredits(link.uid, reward.cost, `Redeemed ${reward.name}`, {
    rewardId: reward.id,
    discordId: interaction.user.id,
  });
  
  // Assign Discord role if applicable
  if (reward.type === 'role' && reward.roleId) {
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      await member.roles.add(reward.roleId);
    } catch (error) {
      logger.error('Failed to assign role', { error: error.message, roleId: reward.roleId });
    }
  }
  
  // Unlock animation if applicable
  let animationUnlocked = false;
  logger.info(`[handleRedeem] Checking animation unlock - reward.type: ${reward.type}, reward.animationId: ${reward.animationId}`);
  
  if (reward.type === 'animation' && reward.animationId) {
    logger.info(`[handleRedeem] ✅ Condition matched! Unlocking animation ${reward.animationId} for user ${link.uid}`);
    try {
      logger.info(`[handleRedeem] Calling unlockAnimation(${link.uid}, ${reward.animationId})`);
      const unlocked = await unlockAnimation(link.uid, reward.animationId);
      logger.info(`[handleRedeem] ✅ Successfully unlocked animation ${reward.animationId} for user ${link.uid}. All unlocked animations: ${unlocked.join(', ')}`);
      animationUnlocked = true;
    } catch (error) {
      logger.error('[handleRedeem] ❌ Failed to unlock animation', { 
        error: error.message, 
        stack: error.stack,
        animationId: reward.animationId, 
        uid: link.uid 
      });
      // Don't re-throw - still show success to user, but log the error for debugging
      // The credits were already deducted, so we should still show success
    }
  } else {
    logger.info(`[handleRedeem] ⚠️ Animation unlock condition NOT matched - reward.type: ${reward.type}, reward.animationId: ${reward.animationId}`);
  }
  
  // Log redemption
  await logRedemption({
    discordId: interaction.user.id,
    uid: link.uid,
    rewardId: reward.id,
    rewardName: reward.name,
    rewardType: reward.type,
    credits: reward.cost,
    deliveryMethod: reward.deliveryMethod,
  });
  
  logger.logRedemption(interaction.user.id, interaction.user.username, reward.id, reward.cost, true);
  
  // Send confirmation
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('🎉 Reward Redeemed!')
    .setDescription(`You've successfully redeemed **${reward.name}**!`)
    .addFields(
      { name: 'Cost', value: `${reward.cost} credits`, inline: true },
      { name: 'New Balance', value: `${newBalance} credits`, inline: true },
      { name: 'Delivery', value: reward.deliveryMethod === 'discord' ? '✅ Role assigned' : '✅ Available in app', inline: false }
    )
    .setFooter({ text: 'Thank you for using Lunchbox!' })
    .setTimestamp();
  
  // Add animation unlock message if applicable
  if (animationUnlocked) {
    embed.addFields({
      name: '🎬 Animation Unlocked',
      value: `**${reward.name}** is now available in your settings! Go to Settings → Bottom Bar to use it.`,
      inline: false,
    });
  }
  
  await interaction.editReply({ embeds: [embed] });
  
  // Notify admins
  await sendRedemptionAlert(client, {
    discordId: interaction.user.id,
    rewardId: reward.id,
    rewardName: reward.name,
    rewardType: reward.type,
    credits: reward.cost,
    deliveryMethod: reward.deliveryMethod,
  });
}

async function handleRewards(interaction) {
  await interaction.deferReply();
  
  // Check if account is linked
  const link = await getDiscordLink(interaction.user.id);
  let userCredits = 0;
  
  if (link) {
    const credits = await getUserCredits(link.uid);
    userCredits = credits?.totalCredits || 0;
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle('🎁 Available Rewards')
    .setDescription(link 
      ? `Your balance: **${userCredits} credits**\n\n✅ = You can afford | 🔒 = Not enough credits`
      : '⚠️ Link your account with `/link` or `/oauth` to see your balance'
    )
    .addFields(formatRewardsEmbed(userCredits))
    .setFooter({ text: 'Use /redeem <reward> to claim a reward' })
    .setTimestamp();
  
  await interaction.editReply({ embeds: [embed] });
}

async function handleHistory(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  // Check if account is linked
  const link = await getDiscordLink(interaction.user.id);
  
  if (!link) {
    return await interaction.editReply('❌ You haven\'t linked your account yet. Use `/link` or `/oauth` to get started!');
  }
  
  // Get transactions
  const transactions = await getCreditTransactions(link.uid, 10);
  
  if (transactions.length === 0) {
    return await interaction.editReply('No transaction history found.');
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('📜 Transaction History')
    .setDescription(`Showing your last ${transactions.length} transactions`);
  
  transactions.forEach((tx, index) => {
    const icon = tx.amount > 0 ? '⬆️' : '⬇️';
    const amountStr = tx.amount > 0 ? `+${tx.amount}` : tx.amount.toString();
    const timestamp = tx.timestamp?.toDate 
      ? `<t:${Math.floor(tx.timestamp.toDate().getTime() / 1000)}:R>`
      : 'Unknown';
    
    embed.addFields({
      name: `${icon} ${amountStr} credits`,
      value: `${tx.reason}\n${timestamp}`,
      inline: false,
    });
  });
  
  await interaction.editReply({ embeds: [embed] });
}

async function handleUnlink(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  // Check if account is linked
  const link = await getDiscordLink(interaction.user.id);
  
  if (!link) {
    return await interaction.editReply('❌ Your account is not currently linked.');
  }
  
  // Unlink
  await unlinkDiscordAccount(interaction.user.id);
  
  const embed = new EmbedBuilder()
    .setColor(0xFF6347)
    .setTitle('🔓 Account Unlinked')
    .setDescription(`Your Discord account has been unlinked from **${link.email}**`)
    .addFields(
      { name: 'Note', value: 'You can link again anytime using `/link` or `/oauth`' }
    )
    .setTimestamp();
  
  await interaction.editReply({ embeds: [embed] });
}

async function handleRefund(interaction) {
  await interaction.deferReply();
  
  const rewardId = interaction.options.getString('reward');
  
  // Check if account is linked
  const link = await getDiscordLink(interaction.user.id);
  
  if (!link) {
    return await interaction.editReply('❌ You haven\'t linked your account yet. Use `/link` or `/oauth` to get started!');
  }
  
  // Get reward info
  const reward = getReward(rewardId);
  
  if (!reward) {
    return await interaction.editReply('❌ Invalid reward ID.');
  }
  
  // Check if user has redeemed this reward
  const redemptions = await getUserRedemptions(link.uid, rewardId);
  
  if (redemptions.length === 0) {
    return await interaction.editReply(`❌ You haven't redeemed **${reward.name}** yet, so there's nothing to refund.`);
  }
  
  // Get the most recent redemption
  const latestRedemption = redemptions[0];
  
  // Calculate refund amount (75% of original cost)
  const refundAmount = Math.floor(reward.cost * 0.75);
  
  // Process the refund
  try {
    const newBalance = await processRefund(
      link.uid,
      latestRedemption.id,
      refundAmount,
      `Refunded ${reward.name} (75% of ${reward.cost} credits)`
    );
    
    // Remove Discord role if applicable
    if (reward.type === 'role' && reward.roleId) {
      try {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        await member.roles.remove(reward.roleId);
      } catch (error) {
        logger.error('Failed to remove role', { error: error.message, roleId: reward.roleId });
      }
    }
    
    logger.info('Refund processed', {
      userId: interaction.user.id,
      username: interaction.user.username,
      rewardId: reward.id,
      originalCost: reward.cost,
      refundAmount: refundAmount,
    });
    
    // Send confirmation
    const embed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle('💰 Refund Processed')
      .setDescription(`You've successfully refunded **${reward.name}**!`)
      .addFields(
        { name: 'Original Cost', value: `${reward.cost} credits`, inline: true },
        { name: 'Refund Amount', value: `${refundAmount} credits (75%)`, inline: true },
        { name: 'New Balance', value: `${newBalance} credits`, inline: true },
        { name: 'Note', value: reward.type === 'role' ? '✅ Role has been removed' : '✅ Theme access revoked', inline: false }
      )
      .setFooter({ text: 'You can redeem this reward again anytime!' })
      .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Refund failed', {
      error: error.message,
      userId: interaction.user.id,
      rewardId: reward.id,
    });
    
    return await interaction.editReply(`❌ Failed to process refund: ${error.message}`);
  }
}

async function handleConverse(interaction) {
  await interaction.deferReply();
  
  const message = interaction.options.getString('message');
  const visibility = interaction.options.getString('visibility') || 'private';
  const isPrivate = visibility === 'private';
  
  try {
    // Create a thread for the conversation
    const threadName = isPrivate 
      ? `🤖 AI Chat with ${interaction.user.username} (Private)` 
      : `🤖 AI Chat with ${interaction.user.username}`;
    
    const thread = await interaction.channel.threads.create({
      name: threadName,
      autoArchiveDuration: 60, // Archive after 1 hour of inactivity
      reason: 'AI conversation thread',
    });
    
    logger.info('AI conversation thread created', {
      threadId: thread.id,
      userId: interaction.user.id,
      username: interaction.user.username,
      isPrivate
    });
    
    // Send initial message to thread
    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🤖 Lunchbox AI Assistant')
      .setDescription('Welcome to your AI conversation! I can help you with:\n\n' +
        '💬 **General Chat** - Ask me anything!\n' +
        '✅ **Task Management** - Create, update, complete, or delete tasks\n' +
        '📊 **Productivity Tips** - Get advice on organization\n' +
        '🔗 **Account Features** - Link your account for full access\n\n' +
        `**Visibility:** ${isPrivate ? '🔒 Private (Only you)' : '👥 Public (Everyone)'}\n\n` +
        'Just type your messages in this thread to continue the conversation!')
      .setFooter({ text: 'Powered by Lunchbox AI' })
      .setTimestamp();
    
    await thread.send({ embeds: [welcomeEmbed] });
    
    // Send the user's first message to the thread
    await thread.send({
      content: `**${interaction.user.username}:** ${message}`,
      allowedMentions: { parse: [] }
    });
    
    // Process the AI response
    // Create a fake message object for handleAIConversation
    const fakeMessage = {
      author: interaction.user,
      content: message,
      channel: thread,
      reply: async (options) => {
        return await thread.send(options);
      }
    };
    
    await handleAIConversation(fakeMessage, !isPrivate);
    
    // Reply to the slash command
    const responseEmbed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ Conversation Started!')
      .setDescription(`Your AI conversation thread has been created: ${thread}\n\n` +
        `**Visibility:** ${isPrivate ? '🔒 Private' : '👥 Public'}\n\n` +
        'Continue chatting in the thread!')
      .setFooter({ text: 'Type messages in the thread to continue' });
    
    await interaction.editReply({ embeds: [responseEmbed] });
    
  } catch (error) {
    logger.error('Failed to create conversation thread', {
      error: error.message,
      userId: interaction.user.id
    });
    
    await interaction.editReply('❌ Failed to start AI conversation. Please try again!');
  }
}

async function handleTimezone(interaction) {
  const action = interaction.options.getString('action') || 'view';
  
  if (action === 'view') {
    // Show current timezone
    // First check if user just set their timezone (in state) to avoid race condition
    let timezoneInfo = null;
    const state = timezoneSetupState.get(interaction.user.id);
    if (state && state.detectedTimezone) {
      // User just confirmed timezone but it might not be in Firebase yet
      // Use the state's timezone info
      timezoneInfo = {
        timezone: state.detectedTimezone.timezone,
        offset: state.detectedTimezone.offset,
        display: state.detectedTimezone.display,
      };
    } else {
      // Read from Firebase
      timezoneInfo = await getUserTimezone(interaction.user.id);
    }
    
    if (!timezoneInfo) {
      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('⏰ Timezone Not Set')
        .setDescription('You haven\'t set your timezone yet!')
        .addFields(
          { name: 'Set Your Timezone', value: 'Use `/timezone` and select "Change timezone"' }
        )
        .setFooter({ text: 'Timezone is needed for accurate task times' });
      
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('🌍 Your Current Timezone')
      .setDescription(`**${timezoneInfo.display}**`)
      .addFields(
        { name: 'Offset', value: `UTC${timezoneInfo.offset >= 0 ? '+' : ''}${timezoneInfo.offset}`, inline: true },
        { name: 'Timezone', value: timezoneInfo.timezone, inline: true }
      )
      .setFooter({ text: 'Use /timezone to change your timezone' });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else if (action === 'change') {
    // Initiate timezone change
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('⏰ Change Your Timezone')
      .setDescription('Please reply with your **current time** so I can detect your timezone.')
      .addFields(
        { name: 'Examples', value: '• "it\'s 3pm"\n• "10:30am"\n• "my time is 2:45pm"' }
      )
      .setFooter({ text: 'Reply with your current time' });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    
    // Set timezone setup state
    timezoneSetupState.set(interaction.user.id, {
      state: 'awaiting_time',
      userId: interaction.user.id,
    });
    
    logger.info('Timezone change initiated', { userId: interaction.user.id });
  }
}

async function handleTimezoneSetupMessage(message) {
  const state = timezoneSetupState.get(message.author.id);
  
  if (!state) return;
  
  if (state.state === 'awaiting_time') {
    // Try to detect timezone from user's time input
    const detected = detectTimezone(message.content);
    
    if (!detected) {
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Could Not Understand Time')
        .setDescription('I couldn\'t understand that time format. Please try again!')
        .addFields(
          { name: 'Valid Formats', value: '• "it\'s 3pm"\n• "10:30am"\n• "2:45pm"\n• "my time is 9am"' }
        )
        .setFooter({ text: 'Reply with your current time' });
      
      await message.reply({ embeds: [embed] });
      return;
    }
    
    if (!detected.timezone) {
      // Unknown timezone offset
      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('⚠️ Uncommon Timezone')
        .setDescription(`I detected your timezone as **${detected.display}**, but I don't have a specific timezone name for it.`)
        .addFields(
          { name: 'Offset', value: `UTC${detected.offset >= 0 ? '+' : ''}${detected.offset}` }
        )
        .setFooter({ text: 'Tasks will still work with this offset' });
      
      await message.reply({ embeds: [embed] });
      timezoneSetupState.delete(message.author.id);
      return;
    }
    
    // Ask for confirmation
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🌍 Confirm Your Timezone')
      .setDescription(`Based on your time, you're in **${detected.display}**`)
      .addFields(
        { name: 'Timezone', value: detected.timezone, inline: true },
        { name: 'Offset', value: `UTC${detected.offset >= 0 ? '+' : ''}${detected.offset}`, inline: true },
        { name: 'Confirm?', value: 'Reply **yes** to confirm or tell me your current time again to retry' }
      )
      .setFooter({ text: 'Reply "yes" to confirm or provide a different time' });
    
    await message.reply({ embeds: [embed] });
    
    // Update state to awaiting confirmation
    timezoneSetupState.set(message.author.id, {
      state: 'awaiting_confirmation',
      userId: state.userId,
      detectedTimezone: detected,
    });
    
  } else if (state.state === 'awaiting_confirmation') {
    const response = message.content.toLowerCase().trim();
    
    if (response === 'yes' || response === 'y' || response === 'confirm') {
      // Save timezone
      const success = await saveUserTimezone(state.userId, state.detectedTimezone);
      
      if (success) {
        const embed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('✅ Timezone Set Successfully!')
          .setDescription(`Your timezone has been set to **${state.detectedTimezone.display}**`)
          .addFields(
            { name: '⏰ All Set!', value: 'Task times will now be accurate for your timezone!' },
            { name: 'Change Anytime', value: 'Use `/timezone` to view or change your timezone' }
          )
          .setFooter({ text: 'You\'re all set up!' });
        
        await message.reply({ embeds: [embed] });
        
        logger.info('Timezone set successfully', {
          userId: state.userId,
          timezone: state.detectedTimezone.timezone,
        });
        
        // Keep timezone in state for a short period to avoid race condition
        // This allows /timezone command to read from state if used immediately after saving
        // Clear the state after 5 seconds to allow Firebase to sync
        setTimeout(() => {
          timezoneSetupState.delete(message.author.id);
        }, 5000);
      } else {
        await message.reply('❌ Failed to save timezone. Please try `/timezone` again.');
        // Clear state on failure
        timezoneSetupState.delete(message.author.id);
      }
    } else {
      // User wants to retry - go back to awaiting_time
      const detected = detectTimezone(message.content);
      
      if (!detected) {
        await message.reply('Please reply **yes** to confirm, or tell me your current time to retry (e.g., "it\'s 3pm")');
        return;
      }
      
      // Same flow as awaiting_time
      if (!detected.timezone) {
        const embed = new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle('⚠️ Uncommon Timezone')
          .setDescription(`I detected your timezone as **${detected.display}**`)
          .setFooter({ text: 'Tasks will work with this offset' });
        
        await message.reply({ embeds: [embed] });
        timezoneSetupState.delete(message.author.id);
        return;
      }
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🌍 Confirm Your Timezone')
        .setDescription(`Based on your time, you're in **${detected.display}**`)
        .addFields(
          { name: 'Timezone', value: detected.timezone, inline: true },
          { name: 'Offset', value: `UTC${detected.offset >= 0 ? '+' : ''}${detected.offset}`, inline: true },
          { name: 'Confirm?', value: 'Reply **yes** to confirm' }
        );
      
      await message.reply({ embeds: [embed] });
      
      timezoneSetupState.set(message.author.id, {
        state: 'awaiting_confirmation',
        userId: state.userId,
        detectedTimezone: detected,
      });
    }
  }
}

async function handleTaskNotify(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const action = interaction.options.getString('action');
  const targetUserInput = interaction.options.getString('user');
  
  // Check if account is linked
  const link = await getDiscordLink(interaction.user.id);
  if (!link) {
    return await interaction.editReply('❌ You need to link your Discord account first! Use `/link` or `/oauth` to link your account.');
  }
  
  const { initializeFirebase } = require('./firebase-utils');
  const admin = require('firebase-admin');
  const db = initializeFirebase();
  
  try {
    const userId = link.uid;
    
    // Validate action
    if (!action || !['view', 'add', 'remove'].includes(action)) {
      return await interaction.editReply('❌ Invalid action. Use `/task-notify view`, `/task-notify add`, or `/task-notify remove`.');
    }
    
    // Get current watchers from user_settings
    const userSettingsDoc = await db.collection('user_settings').doc(userId).get();
    const userSettings = userSettingsDoc.data() || {};
    const currentWatchers = userSettings.taskWatchers || []; // Array of Firebase UIDs
    
    if (action === 'view') {
      // View current watchers
      if (currentWatchers.length === 0) {
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('👥 Task Completion Watchers')
          .setDescription('No watchers added yet. Use `/task-notify add` to add watchers.')
          .addFields(
            { name: 'What are watchers?', value: 'Watchers will be notified via DM when you complete ANY task. Great for team collaboration!' }
          )
          .setFooter({ text: 'Watchers will be notified when you complete tasks' });
        
        return await interaction.editReply({ embeds: [embed] });
      }
      
      // Get Discord usernames for watchers
      const watcherInfo = [];
      for (const watcherUid of currentWatchers) {
        const discordLinkSnapshot = await db.collection('discord_links')
          .where('uid', '==', watcherUid)
          .limit(1)
          .get();
        
        if (!discordLinkSnapshot.empty) {
          const discordLink = discordLinkSnapshot.docs[0].data();
          try {
            const user = await client.users.fetch(discordLink.discordId);
            watcherInfo.push(`• ${user.username}`);
          } catch (err) {
            watcherInfo.push(`• User (ID: ${watcherUid.substring(0, 8)}...)`);
          }
        } else {
          watcherInfo.push(`• User (ID: ${watcherUid.substring(0, 8)}...)`);
        }
      }
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('👥 Task Completion Watchers')
        .setDescription('These users will be notified when you complete ANY task:')
        .addFields(
          { name: `Watchers (${currentWatchers.length})`, value: watcherInfo.join('\n') || 'None' }
        )
        .setFooter({ text: 'They will be notified when you complete tasks' });
      
      return await interaction.editReply({ embeds: [embed] });
    }
    
    if (action === 'add') {
      if (!targetUserInput) {
        return await interaction.editReply('❌ Please specify a user to add as watcher. Use `/task-notify add user:@username` or `/task-notify add user:123456789012345678`.');
      }
      
      let targetDiscordId = null;
      let targetUsername = null;
      
      // Check if it's a Discord user ID (numeric string) or mention
      const userInput = targetUserInput.trim();
      
      // Check if it's a mention format: <@123456789012345678> or <@!123456789012345678>
      const mentionMatch = userInput.match(/<@!?(\d+)>/);
      if (mentionMatch) {
        targetDiscordId = mentionMatch[1];
      } else if (/^\d+$/.test(userInput)) {
        // It's a raw Discord user ID
        targetDiscordId = userInput;
      } else {
        return await interaction.editReply('❌ Invalid format. Use `/task-notify add user:@username` or `/task-notify add user:123456789012345678`.');
      }
      
      // Get target user's Discord link
      const targetLinkSnapshot = await db.collection('discord_links')
        .where('discordId', '==', targetDiscordId)
        .limit(1)
        .get();
      
      if (targetLinkSnapshot.empty) {
        return await interaction.editReply(`❌ User with Discord ID ${targetDiscordId} hasn't linked their Discord account yet. They need to use \`/link\` or \`/oauth\` first.`);
      }
      
      // Fetch Discord user to get username
      try {
        const discordUser = await client.users.fetch(targetDiscordId);
        targetUsername = discordUser.username;
      } catch (err) {
        targetUsername = `User (${targetDiscordId.substring(0, 8)}...)`;
      }
      
      const targetLink = targetLinkSnapshot.docs[0].data();
      const targetUid = targetLink.uid;
      
      // Check if already a watcher
      if (currentWatchers.includes(targetUid)) {
        return await interaction.editReply(`❌ ${targetUsername} is already a watcher for your tasks.`);
      }
      
      // Check if trying to add themselves
      if (targetUid === userId) {
        return await interaction.editReply(`❌ You're already the task owner. You'll automatically be notified when tasks are completed.`);
      }
      
      // Send consent request DM to the target user
      const consentEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('👥 Task Completion Watcher Request')
        .setDescription(`**${interaction.user.username}** wants to add you as a watcher for their task completions.`)
        .addFields(
          { name: 'What does this mean?', value: 'You will receive a DM notification whenever they complete ANY task.' },
          { name: 'Do you consent?', value: 'Click a button below to accept or decline this request.' }
        )
        .setFooter({ text: 'This request will expire if not responded to' })
        .setTimestamp();
      
      const consentButtons = {
        type: 1, // ACTION_ROW
        components: [
          {
            type: 2, // BUTTON
            style: 3, // SUCCESS (green)
            label: 'Yes!!',
            custom_id: `task_notify_consent_yes_${userId}_${targetUid}`,
          },
          {
            type: 2, // BUTTON
            style: 4, // DANGER (red)
            label: 'No, I dont consent!',
            custom_id: `task_notify_consent_no_${userId}_${targetUid}`,
          },
        ],
      };
      
      try {
        const targetDiscordUser = await client.users.fetch(targetDiscordId);
        await targetDiscordUser.send({
          embeds: [consentEmbed],
          components: [consentButtons],
        });
        
        // Store pending consent request (store as map with userId as key for easier lookup)
        const targetUserSettingsDoc = await db.collection('user_settings').doc(targetUid).get();
        const targetUserSettings = targetUserSettingsDoc.data() || {};
        const pendingRequests = targetUserSettings.pendingWatcherRequests || {};
        pendingRequests[userId] = {
          fromDiscordId: interaction.user.id,
          fromUsername: interaction.user.username,
          requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        
        await db.collection('user_settings').doc(targetUid).set({
          pendingWatcherRequests: pendingRequests,
        }, { merge: true });
        
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('📨 Consent Request Sent!')
          .setDescription(`**${targetUsername}** has been sent a consent request via DM.`)
          .addFields(
            { name: 'Status', value: '⏳ Waiting for their response...', inline: false },
            { name: 'What happens next?', value: 'They will receive a DM with buttons to accept or decline. You\'ll be notified once they respond.' }
          )
          .setFooter({ text: 'The request will expire if not responded to' });
        
        return await interaction.editReply({ embeds: [embed] });
        
      } catch (error) {
        logger.error('Failed to send consent request DM', {
          error: error.message,
          targetDiscordId,
        });
        
        return await interaction.editReply(`❌ Failed to send consent request to ${targetUsername}. They may have DMs disabled or blocked the bot.`);
      }
    }
    
    if (action === 'remove') {
      if (!targetUserInput) {
        return await interaction.editReply('❌ Please specify a user to remove as watcher. Use `/task-notify remove user:@username` or `/task-notify remove user:123456789012345678`.');
      }
      
      let targetDiscordId = null;
      let targetUsername = null;
      
      // Check if it's a Discord user ID (numeric string) or mention
      const userInput = targetUserInput.trim();
      
      // Check if it's a mention format: <@123456789012345678> or <@!123456789012345678>
      const mentionMatch = userInput.match(/<@!?(\d+)>/);
      if (mentionMatch) {
        targetDiscordId = mentionMatch[1];
      } else if (/^\d+$/.test(userInput)) {
        // It's a raw Discord user ID
        targetDiscordId = userInput;
      } else {
        return await interaction.editReply('❌ Invalid format. Use `/task-notify remove user:@username` or `/task-notify remove user:123456789012345678`.');
      }
      
      // Get target user's Discord link
      const targetLinkSnapshot = await db.collection('discord_links')
        .where('discordId', '==', targetDiscordId)
        .limit(1)
        .get();
      
      if (targetLinkSnapshot.empty) {
        return await interaction.editReply(`❌ User with Discord ID ${targetDiscordId} not found in linked accounts.`);
      }
      
      // Fetch Discord user to get username
      try {
        const discordUser = await client.users.fetch(targetDiscordId);
        targetUsername = discordUser.username;
      } catch (err) {
        targetUsername = `User (${targetDiscordId.substring(0, 8)}...)`;
      }
      
      const targetLink = targetLinkSnapshot.docs[0].data();
      const targetUid = targetLink.uid;
      
      // Check if is a watcher
      if (!currentWatchers.includes(targetUid)) {
        return await interaction.editReply(`❌ ${targetUsername} is not a watcher for your tasks.`);
      }
      
      // Remove watcher
      const updatedWatchers = currentWatchers.filter(uid => uid !== targetUid);
      
      await db.collection('user_settings').doc(userId).set({
        taskWatchers: updatedWatchers,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      
      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('🗑️ Watcher Removed!')
        .setDescription(`**${targetUsername}** has been removed as a watcher for your tasks.`)
        .addFields(
          { name: 'Remaining Watchers', value: updatedWatchers.length.toString(), inline: true }
        )
        .setFooter({ text: 'They will no longer receive notifications for your tasks' });
      
      return await interaction.editReply({ embeds: [embed] });
    }
    
  } catch (error) {
    logger.error('Error handling task-notify command', {
      error: error.message,
      stack: error.stack,
      userId: interaction.user.id,
    });
    
    return await interaction.editReply('❌ An error occurred while managing task watchers. Please try again later.');
  }
}

async function handleTaskNotifyConsent(interaction, customId) {
  await interaction.deferReply({ ephemeral: true });
  
  const parts = customId.split('_');
  const consent = parts[3]; // 'yes' or 'no'
  const fromUserId = parts[4]; // Firebase UID
  const targetUid = parts[5]; // Firebase UID of the person being asked
  
  // Get current user's Discord link
  const currentLink = await getDiscordLink(interaction.user.id);
  if (!currentLink || currentLink.uid !== targetUid) {
    return await interaction.editReply('❌ This consent request is not for you.');
  }
  
  const { initializeFirebase } = require('./firebase-utils');
  const admin = require('firebase-admin');
  const db = initializeFirebase();
  
  try {
    // Get the requester's user settings
    const requesterSettingsDoc = await db.collection('user_settings').doc(fromUserId).get();
    const requesterSettings = requesterSettingsDoc.data() || {};
    const requesterWatchers = requesterSettings.taskWatchers || [];
    
    // Get requester's Discord info
    const requesterLinkDoc = await db.collection('discord_links')
      .where('uid', '==', fromUserId)
      .limit(1)
      .get();
    
    if (requesterLinkDoc.empty) {
      return await interaction.editReply('❌ The requester no longer has a linked account.');
    }
    
    const requesterLink = requesterLinkDoc.docs[0].data();
    const requesterDiscordId = requesterLink.discordId;
    
    if (consent === 'yes') {
      // Add to watchers
      if (!requesterWatchers.includes(targetUid)) {
        await db.collection('user_settings').doc(fromUserId).set({
          taskWatchers: admin.firestore.FieldValue.arrayUnion(targetUid),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      
      // Remove from pending requests
      const userSettingsDoc = await db.collection('user_settings').doc(targetUid).get();
      const userSettings = userSettingsDoc.data() || {};
      const pendingRequests = userSettings.pendingWatcherRequests || {};
      delete pendingRequests[fromUserId];
      
      await db.collection('user_settings').doc(targetUid).set({
        pendingWatcherRequests: pendingRequests,
      }, { merge: true });
      
      // Notify requester
      try {
        const requesterUser = await client.users.fetch(requesterDiscordId);
        const successEmbed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('✅ Consent Granted!')
          .setDescription(`**${interaction.user.username}** has accepted your watcher request!`)
          .addFields(
            { name: 'Status', value: 'They will now receive notifications when you complete tasks.' }
          )
          .setFooter({ text: 'Lunchbox AI Task Notifications' })
          .setTimestamp();
        
        await requesterUser.send({ embeds: [successEmbed] });
      } catch (err) {
        logger.error('Failed to notify requester of consent', {
          error: err.message,
          requesterDiscordId,
        });
      }
      
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Consent Granted!')
        .setDescription('You will now receive notifications when this user completes tasks.')
        .setFooter({ text: 'You can manage watchers with /task-notify' });
      
      return await interaction.editReply({ embeds: [embed] });
      
    } else if (consent === 'no') {
      // Remove from pending requests
      const userSettingsDoc = await db.collection('user_settings').doc(targetUid).get();
      const userSettings = userSettingsDoc.data() || {};
      const pendingRequests = userSettings.pendingWatcherRequests || {};
      delete pendingRequests[fromUserId];
      
      await db.collection('user_settings').doc(targetUid).set({
        pendingWatcherRequests: pendingRequests,
      }, { merge: true });
      
      // Notify requester
      try {
        const requesterUser = await client.users.fetch(requesterDiscordId);
        const declinedEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Consent Declined')
          .setDescription(`**${interaction.user.username}** has declined your watcher request.`)
          .setFooter({ text: 'Lunchbox AI Task Notifications' })
          .setTimestamp();
        
        await requesterUser.send({ embeds: [declinedEmbed] });
      } catch (err) {
        logger.error('Failed to notify requester of decline', {
          error: err.message,
          requesterDiscordId,
        });
      }
      
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Consent Declined')
        .setDescription('You have declined the watcher request. You will not receive notifications.')
        .setFooter({ text: 'The requester has been notified' });
      
      return await interaction.editReply({ embeds: [embed] });
    }
    
  } catch (error) {
    logger.error('Error handling task notify consent', {
      error: error.message,
      stack: error.stack,
      customId,
    });
    
    return await interaction.editReply('❌ An error occurred processing your consent. Please try again.');
  }
}

// Function to start the bot (called from index.js for Firebase Functions)
let botStarted = false;
function startBot() {
  if (botStarted) {
    logger.warn('Bot already started, skipping login');
    return;
  }
  
  botStarted = true;
  client.login(process.env.DISCORD_BOT_TOKEN);
  
  // Error handlers
  process.on('unhandledRejection', (error) => {
    // Safely extract error info to prevent circular reference issues
    const errorInfo = {
      message: error && error.message ? String(error.message) : 'Unknown error',
      stack: error && error.stack ? String(error.stack) : 'No stack trace',
    };
    logger.error('Unhandled promise rejection', errorInfo);
  });
}

// Auto-start bot if not in Firebase Functions environment
// (for local development)
// Check multiple environment variables that Firebase Functions might set
if (!process.env.FUNCTION_TARGET && !process.env.FUNCTION_NAME && !process.env.K_SERVICE && !process.env.GCLOUD_PROJECT) {
  startBot();
}

process.on('uncaughtException', (error) => {
  // Safely extract error info to prevent circular reference issues
  const errorInfo = {
    message: error && error.message ? String(error.message) : 'Unknown error',
    stack: error && error.stack ? String(error.stack) : 'No stack trace',
  };
  logger.error('Uncaught exception', errorInfo);
  process.exit(1);
});

// Export function to trigger immediate task completion notification
async function triggerTaskCompletionNotification(taskId) {
  try {
    const { checkCompletedTasks } = require('./task-notifications');
    await checkCompletedTasks(client, taskId);
    logger.info('Immediate task completion notification triggered', { taskId });
    return true;
  } catch (error) {
    logger.error('Failed to trigger immediate notification', {
      error: error.message,
      taskId,
    });
    return false;
  }
}

// Handler functions for new commands

async function handleTasks(interaction) {
  const link = await getDiscordLink(interaction.user.id);
  if (!link) {
    return await interaction.reply({ 
      content: '❌ You need to link your Discord account first! Use `/link` or `/oauth`.', 
      ephemeral: true 
    });
  }
  
  const filter = interaction.options.getString('filter') || 'all';
  const limit = interaction.options.getInteger('limit') || 10;
  
  try {
    const filters = {};
    if (filter === 'pending') {
      filters.completed = false;
    } else if (filter === 'completed') {
      filters.completed = true;
    } else if (filter === 'overdue') {
      filters.overdue = true;
      filters.completed = false;
    }
    filters.limit = limit;
    
    const tasks = await getUserTasks(link.uid, filters);
    
    if (tasks.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('📋 No Tasks Found')
        .setDescription(`You don't have any ${filter === 'all' ? '' : filter} tasks yet.`)
        .setFooter({ text: 'Use /task-create to add a new task' });
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    const taskList = tasks.slice(0, limit).map((task, index) => {
      const status = task.completed ? '✅' : '⏳';
      const dueDate = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date';
      const tags = task.tags && task.tags.length > 0 ? ` [${task.tags.join(', ')}]` : '';
      return `${index + 1}. ${status} **${task.text}**${tags}\n   Due: ${dueDate}`;
    }).join('\n\n');
    
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle(`📋 Your Tasks (${filter})`)
      .setDescription(taskList)
      .setFooter({ text: `Showing ${tasks.length} task(s)` });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    logger.error('Error fetching tasks', { error: error.message, userId: link.uid });
    await interaction.reply({ content: '❌ Failed to fetch tasks. Please try again.', ephemeral: true });
  }
}

async function handleTaskCreate(interaction) {
  const link = await getDiscordLink(interaction.user.id);
  if (!link) {
    return await interaction.reply({ 
      content: '❌ You need to link your Discord account first! Use `/link` or `/oauth`.', 
      ephemeral: true 
    });
  }
  
  const text = interaction.options.getString('text');
  const dueDateStr = interaction.options.getString('due-date');
  const tagsStr = interaction.options.getString('tags');
  const priority = interaction.options.getString('priority');
  
  try {
    const taskData = {
      text,
      completed: false,
    };
    
    if (dueDateStr) {
      // Simple date parsing - could be enhanced with a date parser
      taskData.dueDate = dueDateStr;
    }
    
    if (tagsStr) {
      taskData.tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);
    }
    
    if (priority) {
      taskData.priority = priority;
    }
    
    const taskId = await createTask(link.uid, taskData);
    
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ Task Created!')
      .setDescription(`**${text}**`)
      .addFields(
        { name: 'Task ID', value: taskId, inline: true },
        { name: 'Status', value: '⏳ Pending', inline: true }
      )
      .setFooter({ text: 'Task has been added to your Lunchbox account' });
    
    if (dueDateStr) {
      embed.addFields({ name: 'Due Date', value: dueDateStr, inline: true });
    }
    if (tagsStr) {
      embed.addFields({ name: 'Tags', value: tagsStr, inline: true });
    }
    if (priority) {
      embed.addFields({ name: 'Priority', value: priority.toUpperCase(), inline: true });
    }
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    logger.error('Error creating task', { error: error.message, userId: link.uid });
    await interaction.reply({ content: '❌ Failed to create task. Please try again.', ephemeral: true });
  }
}

async function handleStats(interaction) {
  const link = await getDiscordLink(interaction.user.id);
  if (!link) {
    return await interaction.reply({ 
      content: '❌ You need to link your Discord account first! Use `/link` or `/oauth`.', 
      ephemeral: true 
    });
  }
  
  const period = interaction.options.getString('period') || 'all-time';
  
  try {
    const stats = await getUserStats(link.uid, period);
    
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📊 Productivity Statistics (${period})`)
      .addFields(
        { name: 'Total Tasks', value: stats.totalTasks.toString(), inline: true },
        { name: 'Completed', value: stats.completedTasks.toString(), inline: true },
        { name: 'Pending', value: stats.pendingTasks.toString(), inline: true },
        { name: 'Overdue', value: stats.overdueTasks.toString(), inline: true },
        { name: 'Completion Rate', value: `${stats.completionRate}%`, inline: true }
      )
      .setFooter({ text: `Statistics for ${period}` });
    
    if (stats.topTags.length > 0) {
      const topTagsText = stats.topTags.map(t => `**${t.tag}**: ${t.count}`).join('\n');
      embed.addFields({ name: 'Top Tags', value: topTagsText });
    }
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    logger.error('Error fetching stats', { error: error.message, userId: link.uid });
    await interaction.reply({ content: '❌ Failed to fetch statistics. Please try again.', ephemeral: true });
  }
}

async function handleNotifications(interaction) {
  const link = await getDiscordLink(interaction.user.id);
  if (!link) {
    return await interaction.reply({ 
      content: '❌ You need to link your Discord account first! Use `/link` or `/oauth`.', 
      ephemeral: true 
    });
  }
  
  const action = interaction.options.getString('action');
  const type = interaction.options.getString('type');
  
  try {
    if (action === 'view') {
      const settings = await getUserNotificationSettings(link.uid);
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔔 Notification Settings')
        .addFields(
          { name: 'Due Soon', value: settings.dueSoonEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'Overdue', value: settings.overdueEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'Daily Summary', value: settings.dailySummaryEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'Completions', value: settings.completionEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'Due Soon Hours', value: `${settings.dueSoonHours} hour(s)`, inline: true },
          { name: 'Daily Summary Time', value: settings.dailySummaryTime, inline: true }
        )
        .setFooter({ text: 'Use /notifications enable or disable to change settings' });
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (action === 'enable' || action === 'disable') {
      if (!type) {
        return await interaction.reply({ 
          content: '❌ Please specify a notification type. Use `/notifications enable type:due-soon`', 
          ephemeral: true 
        });
      }
      
      const settings = await getUserNotificationSettings(link.uid);
      const enabled = action === 'enable';
      
      const updateMap = {
        'due-soon': { dueSoonNotifications: enabled },
        'overdue': { overdueNotifications: enabled },
        'daily-summary': { dailySummaryEnabled: enabled },
        'completions': { completionNotifications: enabled },
      };
      
      const updates = updateMap[type];
      if (!updates) {
        return await interaction.reply({ 
          content: '❌ Invalid notification type. Use: due-soon, overdue, daily-summary, or completions', 
          ephemeral: true 
        });
      }
      
      await updateUserNotificationSettings(link.uid, updates);
      
      const embed = new EmbedBuilder()
        .setColor(enabled ? 0x00FF00 : 0xFF0000)
        .setTitle(`${enabled ? '✅ Enabled' : '❌ Disabled'}: ${type}`)
        .setDescription(`Notification type "${type}" has been ${enabled ? 'enabled' : 'disabled'}.`)
        .setFooter({ text: 'Changes saved successfully' });
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  } catch (error) {
    logger.error('Error managing notifications', { error: error.message, userId: link.uid });
    await interaction.reply({ content: '❌ Failed to manage notifications. Please try again.', ephemeral: true });
  }
}

async function handleRoutines(interaction) {
  const link = await getDiscordLink(interaction.user.id);
  if (!link) {
    return await interaction.reply({ 
      content: '❌ You need to link your Discord account first! Use `/link` or `/oauth`.', 
      ephemeral: true 
    });
  }
  
  const filter = interaction.options.getString('filter') || 'all';
  
  try {
    const routines = await getUserRoutines(link.uid);
    
    if (routines.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('🔄 No Routines Found')
        .setDescription('You don\'t have any routines yet.')
        .setFooter({ text: 'Create routines in the Lunchbox app' });
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    // Filter routines based on filter option
    let filteredRoutines = routines;
    if (filter === 'active') {
      filteredRoutines = routines.filter(r => r.enabled !== false);
    } else if (filter === 'completed') {
      // This would need completion tracking - simplified for now
      filteredRoutines = routines;
    }
    
    const routineList = filteredRoutines.map((routine, index) => {
      const status = routine.enabled !== false ? '✅' : '❌';
      const frequency = routine.frequency || 'Daily';
      return `${index + 1}. ${status} **${routine.name}**\n   Frequency: ${frequency}`;
    }).join('\n\n');
    
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle(`🔄 Your Routines (${filter})`)
      .setDescription(routineList)
      .setFooter({ text: `Showing ${filteredRoutines.length} routine(s)` });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    logger.error('Error fetching routines', { error: error.message, userId: link.uid });
    await interaction.reply({ content: '❌ Failed to fetch routines. Please try again.', ephemeral: true });
  }
}

async function handleSearch(interaction) {
  const link = await getDiscordLink(interaction.user.id);
  if (!link) {
    return await interaction.reply({ 
      content: '❌ You need to link your Discord account first! Use `/link` or `/oauth`.', 
      ephemeral: true 
    });
  }
  
  const query = interaction.options.getString('query');
  const type = interaction.options.getString('type') || 'tasks';
  const limit = interaction.options.getInteger('limit') || 10;
  
  try {
    if (type === 'tasks' || type === 'all') {
      const results = await searchTasks(link.uid, query, limit);
      
      if (results.length === 0) {
        const embed = new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle('🔍 No Results Found')
          .setDescription(`No tasks found matching "${query}"`)
          .setFooter({ text: 'Try a different search term' });
        return await interaction.reply({ embeds: [embed], ephemeral: true });
      }
      
      const resultList = results.map((task, index) => {
        const status = task.completed ? '✅' : '⏳';
        return `${index + 1}. ${status} **${task.text}**`;
      }).join('\n');
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🔍 Search Results: "${query}"`)
        .setDescription(resultList)
        .setFooter({ text: `Found ${results.length} task(s)` });
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else {
      await interaction.reply({ 
        content: '❌ Routine search not yet implemented. Use type:tasks or type:all', 
        ephemeral: true 
      });
    }
  } catch (error) {
    logger.error('Error searching', { error: error.message, userId: link.uid });
    await interaction.reply({ content: '❌ Failed to search. Please try again.', ephemeral: true });
  }
}

async function handleCalendar(interaction) {
  const link = await getDiscordLink(interaction.user.id);
  if (!link) {
    return await interaction.reply({ 
      content: '❌ You need to link your Discord account first! Use `/link` or `/oauth`.', 
      ephemeral: true 
    });
  }
  
  const view = interaction.options.getString('view') || 'week';
  const dateStr = interaction.options.getString('date');
  
  try {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    const tasks = await getUserTasks(link.uid, { limit: 100 });
    
    // Filter tasks by date based on view
    let relevantTasks = tasks.filter(task => {
      if (!task.dueDate) return false;
      const dueDate = task.dueDate?.toDate ? task.dueDate.toDate() : new Date(task.dueDate);
      
      if (view === 'day') {
        return dueDate.toDateString() === targetDate.toDateString();
      } else if (view === 'week') {
        const weekStart = new Date(targetDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        return dueDate >= weekStart && dueDate <= weekEnd;
      } else {
        return dueDate.getMonth() === targetDate.getMonth() && 
               dueDate.getFullYear() === targetDate.getFullYear();
      }
    });
    
    if (relevantTasks.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle(`📅 Calendar (${view})`)
        .setDescription(`No tasks found for this ${view}.`)
        .setFooter({ text: targetDate.toLocaleDateString() });
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    const taskList = relevantTasks.map((task, index) => {
      const status = task.completed ? '✅' : '⏳';
      const dueDate = task.dueDate?.toDate ? task.dueDate.toDate() : new Date(task.dueDate);
      return `${index + 1}. ${status} **${task.text}**\n   ${dueDate.toLocaleDateString()} ${dueDate.toLocaleTimeString()}`;
    }).join('\n\n');
    
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📅 Calendar (${view})`)
      .setDescription(taskList)
      .setFooter({ text: `Showing ${relevantTasks.length} task(s) for ${targetDate.toLocaleDateString()}` });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    logger.error('Error fetching calendar', { error: error.message, userId: link.uid });
    await interaction.reply({ content: '❌ Failed to fetch calendar. Please try again.', ephemeral: true });
  }
}

async function handleAchievements(interaction) {
  const link = await getDiscordLink(interaction.user.id);
  if (!link) {
    return await interaction.reply({ 
      content: '❌ You need to link your Discord account first! Use `/link` or `/oauth`.', 
      ephemeral: true 
    });
  }
  
  const filter = interaction.options.getString('filter') || 'all';
  
  try {
    // Get user stats for achievements
    const stats = await getUserStats(link.uid, 'all-time');
    const credits = await getUserCredits(link.uid);
    
    // Define achievements based on stats
    const achievements = [
      {
        id: 'first_task',
        name: 'First Steps',
        description: 'Complete your first task',
        unlocked: stats.completedTasks >= 1,
        icon: '🎯',
      },
      {
        id: 'task_master',
        name: 'Task Master',
        description: 'Complete 100 tasks',
        unlocked: stats.completedTasks >= 100,
        icon: '🏆',
      },
      {
        id: 'perfect_week',
        name: 'Perfect Week',
        description: 'Complete all tasks in a week',
        unlocked: false, // Would need weekly tracking
        icon: '⭐',
      },
      {
        id: 'early_bird',
        name: 'Early Bird',
        description: 'Complete 10 tasks before noon',
        unlocked: false, // Would need time tracking
        icon: '🌅',
      },
    ];
    
    let filteredAchievements = achievements;
    if (filter === 'unlocked') {
      filteredAchievements = achievements.filter(a => a.unlocked);
    } else if (filter === 'locked') {
      filteredAchievements = achievements.filter(a => !a.unlocked);
    }
    
    const achievementList = filteredAchievements.map((ach, index) => {
      const status = ach.unlocked ? '✅' : '🔒';
      return `${index + 1}. ${status} ${ach.icon} **${ach.name}**\n   ${ach.description}`;
    }).join('\n\n');
    
    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle(`🏆 Achievements (${filter})`)
      .setDescription(achievementList)
      .setFooter({ text: `${achievements.filter(a => a.unlocked).length}/${achievements.length} unlocked` });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    logger.error('Error fetching achievements', { error: error.message, userId: link.uid });
    await interaction.reply({ content: '❌ Failed to fetch achievements. Please try again.', ephemeral: true });
  }
}

module.exports = { client, timezoneSetupState, triggerTaskCompletionNotification, startBot };

