const { EmbedBuilder } = require('discord.js');
const { getDiscordLink, getUserCredits, getUserTasks, getUserRoutines, getUserStats, searchTasks, getUserNotificationSettings, updateUserNotificationSettings } = require('./firebase-utils');
const { callAI } = require('./ai-integration');
const logger = require('./logger');
const { getUserTimezone, convertToUTC } = require('./timezone-utils');
const { processNaturalLanguageCommand, checkAdminPermission, isSuperAdmin, grantAdminPermissions, revokeAdminPermissions } = require('./natural-language-processor');

// Store conversation history per user
const conversationHistory = new Map();

/**
 * Get or initialize conversation history for a user
 */
function getConversationHistory(userId) {
  if (!conversationHistory.has(userId)) {
    conversationHistory.set(userId, []);
  }
  return conversationHistory.get(userId);
}

/**
 * Add a message to conversation history
 */
function addToHistory(userId, role, content) {
  const history = getConversationHistory(userId);
  history.push({ role, content });
  
  // Keep only last 10 messages to avoid context overflow
  if (history.length > 20) {
    history.shift();
    history.shift(); // Remove 2 (user + assistant pair)
  }
  
  conversationHistory.set(userId, history);
}

/**
 * Clear conversation history for a user
 */
function clearHistory(userId) {
  conversationHistory.delete(userId);
  logger.info('Conversation history cleared', { userId });
}

/**
 * Handle AI conversation with natural language command support
 */
async function handleAIConversation(message, isPublic = false) {
  const userId = message.author.id;
  const username = message.author.username;
  const userMessage = message.content;
  
  // Check for images in message
  const hasImages = message.attachments && message.attachments.size > 0;
  const imageUrls = hasImages ? Array.from(message.attachments.values()).map(att => att.url) : [];
  
  try {
    // Check if account is linked
    const link = await getDiscordLink(userId);
    let accountInfo = '';
    
    if (link) {
      const credits = await getUserCredits(link.uid);
      accountInfo = `\n\n**Account Linked:** ✅\n**Credits:** ${credits?.totalCredits || 0}`;
    } else {
      accountInfo = `\n\n**Account Linked:** ❌ (Use \`/link\` or \`/oauth\` to link your account for task management)`;
    }
    
    // Process natural language command first
    const commandResult = await processNaturalLanguageCommand(userMessage, userId, username, !!link);
    
    // Check if it's a direct command request (high confidence)
    if (commandResult.confidence > 0.7) {
      // Check admin permissions if needed
      const permissionCheck = await checkAdminPermission(userId, username, commandResult.command);
      
      if (!permissionCheck.allowed) {
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Permission Denied')
          .setDescription(permissionCheck.reason || 'You do not have permission to use this command.')
          .setFooter({ text: 'Contact an admin if you need access' });
        
        return await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }
      
      // Handle command directly
      const commandHandled = await handleCommandDirectly(message, commandResult.command, link, userId, username, isPublic);
      if (commandHandled) {
        return; // Command was handled, don't continue with AI conversation
      }
    }
    
    // Show typing indicator
    await message.channel.sendTyping();
    
    // Get conversation history
    const history = getConversationHistory(userId);
    
    // Add user message to history
    addToHistory(userId, 'user', userMessage);
    
    // Fetch user tasks if account is linked (for task-related questions)
    let taskContext = null;
    if (link) {
      try {
        // Check if user explicitly asks for ALL tasks
        const userMessageLower = userMessage.toLowerCase();
        const wantsAllTasks = userMessageLower.includes('all tasks') || 
                             userMessageLower.includes('all my tasks') ||
                             userMessageLower.includes('every task') ||
                             userMessageLower.includes('complete list');
        
        // Fetch tasks (limit to 100 unless user wants all)
        const taskLimit = wantsAllTasks ? 500 : 100;
        const tasks = await getUserTasks(link.uid, { limit: taskLimit });
        
        if (tasks && tasks.length > 0) {
          // Format tasks for AI context
          taskContext = formatTasksForAI(tasks);
          
          logger.info('Tasks fetched for AI context', {
            userId,
            username,
            taskCount: tasks.length,
            wantsAll: wantsAllTasks
          });
        }
      } catch (error) {
        logger.error('Error fetching tasks for AI context', {
          error: error.message,
          userId,
          username
        });
        // Continue without task context if fetch fails
      }
    }
    
    logger.info('AI conversation request', {
      userId,
      username,
      message: userMessage,
      historyLength: history.length,
      isLinked: !!link,
      hasTaskContext: !!taskContext,
      taskCount: taskContext ? taskContext.split('\n').length : 0
    });
    
    // Call AI with conversation history, task context, and images
    const responses = await callAI(history, taskContext, imageUrls);
    
    if (!responses || responses.length === 0) {
      throw new Error('No response from AI');
    }
    
    const response = responses[0];
    
    // Handle cases where AI returns JSON string instead of plain text
    let responseText = response.text;
    try {
      // Check if the response is a JSON string
      if (responseText.trim().startsWith('{') && responseText.trim().endsWith('}')) {
        const parsed = JSON.parse(responseText);
        if (parsed.response) {
          responseText = parsed.response;
          // If there's an action in the JSON, update the response object
          if (parsed.action && parsed.action !== 'none') {
            response.action = parsed.action;
            if (parsed.tasks) response.tasks = parsed.tasks;
            if (parsed.taskText) response.taskText = parsed.taskText;
            if (parsed.updates) response.updates = parsed.updates;
          }
        }
      }
    } catch (e) {
      // Not JSON, use as-is
    }
    
    // Add AI response to history
    addToHistory(userId, 'assistant', responseText);
    
    // Update response text for display
    response.text = responseText;
    
    // Handle task actions if user is linked
    // Check if it's a real action (not just asking for date/time)
    const isRealAction = response.action && 
                         response.action !== 'none' && 
                         !(response.action === 'create' && (!response.tasks || response.tasks.length === 0));
    
    if (link && isRealAction) {
      // Check for timezone before creating tasks
      const timezoneInfo = await getUserTimezone(userId);
      
      if (!timezoneInfo) {
        const embed = new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle('⏰ Timezone Not Set')
          .setDescription('Before I can create tasks, I need to know your timezone!')
          .addFields(
            { name: 'Set Your Timezone', value: 'Please tell me your **current time**. For example:\n• "it\'s 3pm"\n• "10:30am"\n• "my time is 2:45pm"' }
          )
          .setFooter({ text: 'Reply with your current time to continue' });
        
        await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
        
        // Set timezone setup state so next message will be processed
        const { timezoneSetupState } = require('./bot');
        timezoneSetupState.set(userId, {
          state: 'awaiting_time',
          userId: link.uid,
        });
        
        return;
      }
      
      await handleTaskAction(message, response, link.uid, isPublic, timezoneInfo);
    } else if (!link && isRealAction) {
      // User trying to do task actions without linking
      const embed = new EmbedBuilder()
        .setColor(0xFF6B6B)
        .setTitle('🔗 Account Not Linked')
        .setDescription('You need to link your Lunchbox account to manage tasks!')
        .addFields(
          { name: 'How to Link', value: 'Use `/link` or `/oauth` command to connect your Discord to Lunchbox', inline: false },
          { name: 'AI Response', value: response.text.substring(0, 1000), inline: false }
        )
        .setFooter({ text: 'Link your account to unlock task management features!' });
      
      await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
    } else {
      // Regular conversation response
      const responseText = response.text.length > 2000 
        ? response.text.substring(0, 1997) + '...' 
        : response.text;
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setDescription(responseText)
        .setFooter({ text: `Lunchbox AI${link ? ' • Account Linked ✅' : ' • Link account for task management'}` });
      
      await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }
    
    logger.info('AI conversation completed', {
      userId,
      username,
      responseLength: response.text.length,
      hadAction: !!response.action
    });
    
  } catch (error) {
    logger.error('AI conversation error', {
      error: error.message,
      stack: error.stack,
      userId,
      username
    });
    
    const errorEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('❌ AI Error')
      .setDescription('Sorry, I encountered an error processing your message. Please try again!')
      .setFooter({ text: 'If this persists, contact support' });
    
    await message.reply({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
  }
}

/**
 * Handle commands directly (bypass AI conversation for high-confidence commands)
 */
async function handleCommandDirectly(message, command, link, userId, username, isPublic) {
  if (!link && !command.startsWith('admin-')) {
    const embed = new EmbedBuilder()
      .setColor(0xFF6B6B)
      .setTitle('🔗 Account Not Linked')
      .setDescription('You need to link your Lunchbox account first!')
      .addFields(
        { name: 'How to Link', value: 'Use `/link` or `/oauth` command to connect your Discord to Lunchbox' }
      );
    
    await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
    return true;
  }
  
  try {
    switch (command) {
      case 'tasks':
        await handleTasksCommand(message, link.uid);
        return true;
      
      case 'calendar':
        await handleCalendarCommand(message, link.uid);
        return true;
      
      case 'routines':
        await handleRoutinesCommand(message, link.uid);
        return true;
      
      case 'stats':
        await handleStatsCommand(message, link.uid);
        return true;
      
      case 'credits':
        await handleCreditsCommand(message, link.uid);
        return true;
      
      case 'rewards':
        await handleRewardsCommand(message, link.uid);
        return true;
      
      case 'achievements':
        await handleAchievementsCommand(message, link.uid);
        return true;
      
      case 'notifications':
        await handleNotificationsCommand(message, link.uid);
        return true;
      
      case 'search':
        await handleSearchCommand(message, link.uid, message.content);
        return true;
      
      // Admin commands
      case 'admin-credits':
      case 'admin-link':
      case 'admin-stats':
      case 'admin-redemptions':
        // These will be handled by admin command handlers
        return false; // Let it fall through to AI or admin handlers
      
      case 'grant-admin':
      case 'revoke-admin':
        await handleAdminPermissionCommand(message, command, userId, username);
        return true;
      
      default:
        return false; // Not handled, continue with AI
    }
  } catch (error) {
    logger.error('Error handling command directly', {
      error: error.message,
      command,
      userId,
      username
    });
    return false; // Fall back to AI
  }
}

/**
 * Command handlers
 */
async function handleTasksCommand(message, uid) {
  const tasks = await getUserTasks(uid, { limit: 20 });
  
  if (tasks.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle('📋 No Tasks Found')
      .setDescription('You don\'t have any tasks yet.')
      .setFooter({ text: 'Use "create task" or /task-create to add a new task' });
    return await message.reply({ embeds: [embed] });
  }
  
  const taskList = tasks.slice(0, 10).map((task, index) => {
    const status = task.completed ? '✅' : '⏳';
    const dueDate = task.dueDate ? new Date(task.dueDate.toDate ? task.dueDate.toDate() : task.dueDate).toLocaleDateString() : 'No due date';
    return `${index + 1}. ${status} **${task.text}**\n   Due: ${dueDate}`;
  }).join('\n\n');
  
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('📋 Your Tasks')
    .setDescription(taskList)
    .setFooter({ text: `Showing ${Math.min(tasks.length, 10)} of ${tasks.length} task(s)` });
  
  await message.reply({ embeds: [embed] });
}

async function handleCalendarCommand(message, uid) {
  const tasks = await getUserTasks(uid, { limit: 100 });
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  
  const weekTasks = tasks.filter(task => {
    if (!task.dueDate) return false;
    const dueDate = task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate);
    return dueDate >= weekStart && dueDate <= weekEnd;
  });
  
  if (weekTasks.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle('📅 Calendar (This Week)')
      .setDescription('No tasks scheduled for this week.')
      .setFooter({ text: weekStart.toLocaleDateString() + ' - ' + weekEnd.toLocaleDateString() });
    return await message.reply({ embeds: [embed] });
  }
  
  const taskList = weekTasks.map((task, index) => {
    const status = task.completed ? '✅' : '⏳';
    const dueDate = task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate);
    return `${index + 1}. ${status} **${task.text}**\n   ${dueDate.toLocaleDateString()} ${dueDate.toLocaleTimeString()}`;
  }).join('\n\n');
  
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📅 Calendar (This Week)')
    .setDescription(taskList)
    .setFooter({ text: `Showing ${weekTasks.length} task(s) for this week` });
  
  await message.reply({ embeds: [embed] });
}

async function handleRoutinesCommand(message, uid) {
  const routines = await getUserRoutines(uid);
  
  if (routines.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle('🔄 No Routines Found')
      .setDescription('You don\'t have any routines yet.')
      .setFooter({ text: 'Create routines in the Lunchbox app' });
    return await message.reply({ embeds: [embed] });
  }
  
  const routineList = routines.map((routine, index) => {
    const status = routine.enabled !== false ? '✅' : '❌';
    return `${index + 1}. ${status} **${routine.name}**`;
  }).join('\n');
  
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('🔄 Your Routines')
    .setDescription(routineList)
    .setFooter({ text: `Showing ${routines.length} routine(s)` });
  
  await message.reply({ embeds: [embed] });
}

async function handleStatsCommand(message, uid) {
  const stats = await getUserStats(uid, 'all-time');
  
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📊 Productivity Statistics')
    .addFields(
      { name: 'Total Tasks', value: stats.totalTasks.toString(), inline: true },
      { name: 'Completed', value: stats.completedTasks.toString(), inline: true },
      { name: 'Pending', value: stats.pendingTasks.toString(), inline: true },
      { name: 'Completion Rate', value: `${stats.completionRate}%`, inline: true }
    )
    .setFooter({ text: 'All-time statistics' });
  
  await message.reply({ embeds: [embed] });
}

async function handleCreditsCommand(message, uid) {
  const credits = await getUserCredits(uid);
  
  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('💰 Your Credit Balance')
    .addFields(
      { name: 'Total Credits', value: `**${credits?.totalCredits || 0}** credits`, inline: true },
      { name: 'Daily Streak', value: `${credits?.dailyStreak || 0} days 🔥`, inline: true }
    )
    .setFooter({ text: 'Use "rewards" to see available rewards' });
  
  await message.reply({ embeds: [embed] });
}

async function handleRewardsCommand(message, uid) {
  const { formatRewardsEmbed } = require('./rewards');
  const credits = await getUserCredits(uid);
  const userCredits = credits?.totalCredits || 0;
  
  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle('🎁 Available Rewards')
    .setDescription(`Your balance: **${userCredits} credits**\n\n✅ = You can afford | 🔒 = Not enough credits`)
    .addFields(formatRewardsEmbed(userCredits))
    .setFooter({ text: 'Use "redeem [reward name]" to claim a reward' });
  
  await message.reply({ embeds: [embed] });
}

async function handleAchievementsCommand(message, uid) {
  const stats = await getUserStats(uid, 'all-time');
  
  const achievements = [
    {
      name: 'First Steps',
      description: 'Complete your first task',
      unlocked: stats.completedTasks >= 1,
      icon: '🎯',
    },
    {
      name: 'Task Master',
      description: 'Complete 100 tasks',
      unlocked: stats.completedTasks >= 100,
      icon: '🏆',
    },
  ];
  
  const achievementList = achievements.map((ach, index) => {
    const status = ach.unlocked ? '✅' : '🔒';
    return `${index + 1}. ${status} ${ach.icon} **${ach.name}**\n   ${ach.description}`;
  }).join('\n\n');
  
  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🏆 Achievements')
    .setDescription(achievementList)
    .setFooter({ text: `${achievements.filter(a => a.unlocked).length}/${achievements.length} unlocked` });
  
  await message.reply({ embeds: [embed] });
}

async function handleNotificationsCommand(message, uid) {
  const settings = await getUserNotificationSettings(uid);
  
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🔔 Notification Settings')
    .addFields(
      { name: 'Due Soon', value: settings.dueSoonEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
      { name: 'Overdue', value: settings.overdueEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
      { name: 'Daily Summary', value: settings.dailySummaryEnabled ? '✅ Enabled' : '❌ Disabled', inline: true }
    )
    .setFooter({ text: 'Manage settings in the Lunchbox app' });
  
  await message.reply({ embeds: [embed] });
}

async function handleSearchCommand(message, uid, query) {
  // Extract search term from query (remove "search" keyword)
  const searchTerm = query.replace(/^(search|find|look for)\s+/i, '').trim();
  
  if (!searchTerm) {
    const embed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle('🔍 Search')
      .setDescription('Please specify what to search for.\nExample: "search homework" or "find tasks about project"');
    return await message.reply({ embeds: [embed] });
  }
  
  const results = await searchTasks(uid, searchTerm, 10);
  
  if (results.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle('🔍 No Results Found')
      .setDescription(`No tasks found matching "${searchTerm}"`);
    return await message.reply({ embeds: [embed] });
  }
  
  const resultList = results.map((task, index) => {
    const status = task.completed ? '✅' : '⏳';
    return `${index + 1}. ${status} **${task.text}**`;
  }).join('\n');
  
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🔍 Search Results: "${searchTerm}"`)
    .setDescription(resultList)
    .setFooter({ text: `Found ${results.length} task(s)` });
  
  await message.reply({ embeds: [embed] });
}

async function handleAdminPermissionCommand(message, command, userId, username) {
  // Extract target user from message (could be mention or username)
  const content = message.content;
  const mentionMatch = content.match(/<@!?(\d+)>/);
  const targetUserId = mentionMatch ? mentionMatch[1] : null;
  
  if (!targetUserId) {
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('❌ Invalid Command')
      .setDescription('Please mention a user to grant/revoke admin permissions.\nExample: "grant admin @username"');
    return await message.reply({ embeds: [embed] });
  }
  
  try {
    const targetUser = await message.client.users.fetch(targetUserId);
    
    if (command === 'grant-admin') {
      await grantAdminPermissions(userId, username, targetUserId, targetUser.username);
      
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Admin Permissions Granted')
        .setDescription(`**${targetUser.username}** has been granted admin permissions.`)
        .setFooter({ text: 'They can now use admin commands' });
      
      await message.reply({ embeds: [embed] });
    } else if (command === 'revoke-admin') {
      await revokeAdminPermissions(userId, username, targetUserId);
      
      const embed = new EmbedBuilder()
        .setColor(0xFF6347)
        .setTitle('🗑️ Admin Permissions Revoked')
        .setDescription(`**${targetUser.username}**'s admin permissions have been revoked.`)
        .setFooter({ text: 'They can no longer use admin commands' });
      
      await message.reply({ embeds: [embed] });
    }
  } catch (error) {
    logger.error('Error handling admin permission command', {
      error: error.message,
      command,
      userId,
      targetUserId
    });
    
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('❌ Error')
      .setDescription('Failed to process admin permission command. Please try again.');
    
    await message.reply({ embeds: [embed] });
  }
}

/**
 * Handle task actions (create, delete, update, complete)
 */
async function handleTaskAction(message, response, userId, isPublic, timezoneInfo) {
  const { initializeFirebase } = require('./firebase-utils');
  const db = initializeFirebase();
  
  try {
    if (response.action === 'create' && response.tasks) {
      // Create tasks in Firestore
      const taskPromises = response.tasks.map(async (task) => {
        // Convert dueDate from user's timezone to UTC
        const adjustedDueDate = task.dueDate ? convertToUTC(task.dueDate, timezoneInfo.timezone) : null;
        
        const taskData = {
          text: task.text,
          userId: userId,
          completed: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...(task.description && { description: task.description }),
          ...(adjustedDueDate && { dueDate: adjustedDueDate }),
          ...(task.tags && { tags: task.tags }),
          ...(task.starred !== undefined && { starred: task.starred })
        };
        
        await db.collection('tasks').add(taskData);
        return task.text;
      });
      
      const createdTasks = await Promise.all(taskPromises);
      
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Task(s) Created!')
        .setDescription(response.text)
        .addFields(
          { name: 'Created Tasks', value: createdTasks.map(t => `• ${t}`).join('\n'), inline: false }
        )
        .setFooter({ text: 'View your tasks on Lunchbox dashboard' });
      
      await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
      
    } else if (response.action === 'complete' && response.taskText) {
      // Mark task as complete
      const tasksSnapshot = await db.collection('tasks')
        .where('userId', '==', userId)
        .where('completed', '==', false)
        .get();
      
      let taskCompleted = false;
      for (const doc of tasksSnapshot.docs) {
        const taskData = doc.data();
        if (taskData.text.toLowerCase().includes(response.taskText.toLowerCase())) {
          await doc.ref.update({
            completed: true,
            updatedAt: new Date().toISOString()
          });
          taskCompleted = true;
          break;
        }
      }
      
      const embed = new EmbedBuilder()
        .setColor(taskCompleted ? 0x00FF00 : 0xFFA500)
        .setTitle(taskCompleted ? '✅ Task Completed!' : '⚠️ Task Not Found')
        .setDescription(response.text)
        .setFooter({ text: 'View your tasks on Lunchbox dashboard' });
      
      await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
      
    } else if (response.action === 'delete' && response.taskText) {
      // Delete task
      const tasksSnapshot = await db.collection('tasks')
        .where('userId', '==', userId)
        .get();
      
      let taskDeleted = false;
      for (const doc of tasksSnapshot.docs) {
        const taskData = doc.data();
        if (taskData.text.toLowerCase().includes(response.taskText.toLowerCase())) {
          await doc.ref.delete();
          taskDeleted = true;
          break;
        }
      }
      
      const embed = new EmbedBuilder()
        .setColor(taskDeleted ? 0x00FF00 : 0xFFA500)
        .setTitle(taskDeleted ? '🗑️ Task Deleted!' : '⚠️ Task Not Found')
        .setDescription(response.text)
        .setFooter({ text: 'View your tasks on Lunchbox dashboard' });
      
      await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
      
    } else if (response.action === 'update' && response.taskText && response.updates) {
      // Update task
      const tasksSnapshot = await db.collection('tasks')
        .where('userId', '==', userId)
        .get();
      
      let taskUpdated = false;
      for (const doc of tasksSnapshot.docs) {
        const taskData = doc.data();
        if (taskData.text.toLowerCase().includes(response.taskText.toLowerCase())) {
          // Convert dueDate if present in updates
          const updates = { ...response.updates };
          if (updates.dueDate) {
            updates.dueDate = convertToUTC(updates.dueDate, timezoneInfo.timezone);
          }
          
          await doc.ref.update({
            ...updates,
            updatedAt: new Date().toISOString()
          });
          taskUpdated = true;
          break;
        }
      }
      
      const embed = new EmbedBuilder()
        .setColor(taskUpdated ? 0x00FF00 : 0xFFA500)
        .setTitle(taskUpdated ? '📝 Task Updated!' : '⚠️ Task Not Found')
        .setDescription(response.text)
        .setFooter({ text: 'View your tasks on Lunchbox dashboard' });
      
      await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
      
    } else {
      // Unknown action
      await message.reply(response.text);
    }
    
  } catch (error) {
    logger.error('Task action error', {
      error: error.message,
      action: response.action,
      userId
    });
    
    const errorEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('❌ Task Action Failed')
      .setDescription('Failed to perform task action. Please try again or manage tasks directly on the dashboard.')
      .setFooter({ text: 'Lunchbox AI' });
    
    await message.reply({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
  }
}

/**
 * Format tasks for AI context
 */
function formatTasksForAI(tasks) {
  if (!tasks || tasks.length === 0) {
    return 'No tasks found.';
  }
  
  const formattedTasks = tasks.map((task, index) => {
    const completed = task.completed ? '✅' : '⏳';
    const starred = task.starred ? '⭐' : '';
    const tags = task.tags && task.tags.length > 0 ? ` [Tags: ${task.tags.join(', ')}]` : '';
    const dueDate = task.dueDate ? ` [Due: ${formatDateForAI(task.dueDate)}]` : '';
    const description = task.description ? `\n   Description: ${task.description}` : '';
    const createdAt = task.createdAt ? ` [Created: ${formatDateForAI(task.createdAt)}]` : '';
    const updatedAt = task.updatedAt ? ` [Updated: ${formatDateForAI(task.updatedAt)}]` : '';
    
    return `${index + 1}. ${completed} ${starred} "${task.text}"${tags}${dueDate}${createdAt}${updatedAt}${description}`;
  }).join('\n');
  
  return `USER'S TASKS (${tasks.length} total):\n${formattedTasks}`;
}

/**
 * Format date for AI context
 */
function formatDateForAI(dateValue) {
  try {
    let date;
    if (dateValue && typeof dateValue.toDate === 'function') {
      // Firestore Timestamp
      date = dateValue.toDate();
    } else if (typeof dateValue === 'string') {
      date = new Date(dateValue);
    } else if (dateValue instanceof Date) {
      date = dateValue;
    } else {
      return 'Unknown date';
    }
    
    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }
    
    // Format as readable date
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch (error) {
    return 'Invalid date';
  }
}

module.exports = {
  handleAIConversation,
  clearHistory,
  getConversationHistory
};

