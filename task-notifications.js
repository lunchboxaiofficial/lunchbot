const { EmbedBuilder } = require('discord.js');
const { initializeFirebase } = require('./firebase-utils');
const { getUserTimezone } = require('./timezone-utils');
const { DateTime } = require('luxon');
const logger = require('./logger');

/**
 * Send Discord DM notification to user
 */
async function sendDiscordDM(client, discordUserId, embed) {
  try {
    const user = await client.users.fetch(discordUserId);
    await user.send({ embeds: [embed] });
    logger.info('Discord DM sent', { discordUserId });
    return true;
  } catch (error) {
    logger.error('Failed to send Discord DM', {
      error: error.message,
      discordUserId,
    });
    return false;
  }
}

/**
 * Check for tasks due soon and send notifications (including to watchers)
 */
async function checkTasksDueSoon(client) {
  const db = initializeFirebase();
  
  try {
    const now = new Date();
    
    // Check for tasks due in: 1hr 45min, 30min, 15min, 5min
    const reminderIntervals = [105, 30, 15, 5]; // minutes before due
    
    for (const minutesBefore of reminderIntervals) {
      const targetTime = new Date(now.getTime() + minutesBefore * 60 * 1000);
      const windowStart = new Date(targetTime.getTime() - 5 * 60 * 1000); // 5 min window
      const windowEnd = new Date(targetTime.getTime() + 5 * 60 * 1000);
      
      const tasksSnapshot = await db.collection('tasks')
        .where('completed', '==', false)
        .where('dueDate', '>=', windowStart.toISOString())
        .where('dueDate', '<=', windowEnd.toISOString())
        .get();
      
      if (tasksSnapshot.empty) continue;
      
      // Group tasks by user
      const tasksByUser = new Map();
      
      tasksSnapshot.forEach((doc) => {
        const task = { id: doc.id, ...doc.data() };
        const userId = task.userId;
        
        if (!tasksByUser.has(userId)) {
          tasksByUser.set(userId, []);
        }
        tasksByUser.get(userId).push(task);
      });
      
      // Get Discord links and send notifications
      for (const [userId, tasks] of tasksByUser.entries()) {
        // Get task owner's Discord ID
        const discordLinksSnapshot = await db.collection('discord_links')
          .where('uid', '==', userId)
          .limit(1)
          .get();
        
        if (discordLinksSnapshot.empty) continue;
        
        const discordLink = discordLinksSnapshot.docs[0].data();
        const ownerDiscordId = discordLink.discordId;
        
        // Get watchers for this user
        const userSettingsDoc = await db.collection('user_settings').doc(userId).get();
        const userSettings = userSettingsDoc.data() || {};
        const watchers = userSettings.taskWatchers || [];
        
        // Get Discord IDs for watchers
        const watcherDiscordIds = [];
        for (const watcherUid of watchers) {
          const watcherLinkSnapshot = await db.collection('discord_links')
            .where('uid', '==', watcherUid)
            .limit(1)
            .get();
          
          if (!watcherLinkSnapshot.empty) {
            const watcherLink = watcherLinkSnapshot.docs[0].data();
            watcherDiscordIds.push(watcherLink.discordId);
          }
        }
        
        // Create notification embed
        const embed = new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle(`⏰ Task Due in ${minutesBefore} Minutes!`)
          .setDescription(`You have **${tasks.length}** task(s) due in ${minutesBefore} minutes:`)
          .addFields(
            tasks.map(task => ({
              name: task.text,
              value: `Due: ${new Date(task.dueDate).toLocaleString()}`,
              inline: false,
            }))
          )
          .setFooter({ text: 'Lunchbox AI Task Reminders' })
          .setTimestamp();
        
        // Send to task owner
        if (ownerDiscordId) {
          await sendDiscordDM(client, ownerDiscordId, embed).catch(err => {
            logger.error('Failed to send due soon notification to owner', {
              userId,
              ownerDiscordId,
              error: err.message,
            });
          });
        }
        
        // Send to watchers
        for (const watcherDiscordId of watcherDiscordIds) {
          if (watcherDiscordId !== ownerDiscordId) {
            await sendDiscordDM(client, watcherDiscordId, embed).catch(err => {
              logger.error('Failed to send due soon notification to watcher', {
                userId,
                watcherDiscordId,
                error: err.message,
              });
            });
          }
        }
      }
    }
  } catch (error) {
    logger.error('Error checking tasks due soon', {
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Check for overdue tasks and send notifications (including to watchers)
 */
async function checkOverdueTasks(client) {
  const db = initializeFirebase();
  
  try {
    const now = new Date();
    
    // Check for tasks overdue by: 15min, 30min, 1hr
    const overdueIntervals = [15, 30, 60]; // minutes after due
    
    for (const minutesOverdue of overdueIntervals) {
      const targetTime = new Date(now.getTime() - minutesOverdue * 60 * 1000);
      const windowStart = new Date(targetTime.getTime() - 5 * 60 * 1000); // 5 min window
      const windowEnd = new Date(targetTime.getTime() + 5 * 60 * 1000);
      
      const tasksSnapshot = await db.collection('tasks')
        .where('completed', '==', false)
        .where('dueDate', '>=', windowStart.toISOString())
        .where('dueDate', '<=', windowEnd.toISOString())
        .get();
      
      if (tasksSnapshot.empty) continue;
      
      // Group tasks by user
      const tasksByUser = new Map();
      
      tasksSnapshot.forEach((doc) => {
        const task = { id: doc.id, ...doc.data() };
        const userId = task.userId;
        
        if (!tasksByUser.has(userId)) {
          tasksByUser.set(userId, []);
        }
        tasksByUser.get(userId).push(task);
      });
      
      // Get Discord links and send notifications
      for (const [userId, tasks] of tasksByUser.entries()) {
        // Get task owner's Discord ID
        const discordLinksSnapshot = await db.collection('discord_links')
          .where('uid', '==', userId)
          .limit(1)
          .get();
        
        if (discordLinksSnapshot.empty) continue;
        
        const discordLink = discordLinksSnapshot.docs[0].data();
        const ownerDiscordId = discordLink.discordId;
        
        // Get watchers for this user
        const userSettingsDoc = await db.collection('user_settings').doc(userId).get();
        const userSettings = userSettingsDoc.data() || {};
        const watchers = userSettings.taskWatchers || [];
        
        // Get Discord IDs for watchers
        const watcherDiscordIds = [];
        for (const watcherUid of watchers) {
          const watcherLinkSnapshot = await db.collection('discord_links')
            .where('uid', '==', watcherUid)
            .limit(1)
            .get();
          
          if (!watcherLinkSnapshot.empty) {
            const watcherLink = watcherLinkSnapshot.docs[0].data();
            watcherDiscordIds.push(watcherLink.discordId);
          }
        }
        
        // Check if we already notified for this interval
        const lastNotified = tasks[0].lastOverdueNotification || null;
        if (lastNotified) {
          const lastNotifiedDate = new Date(lastNotified);
          const minutesSince = (now - lastNotifiedDate) / (1000 * 60);
          // Only notify if we haven't notified in the last 10 minutes
          if (minutesSince < 10) continue;
        }
        
        // Create notification embed
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle(`🚨 Task Overdue by ${minutesOverdue} Minutes!`)
          .setDescription(`You have **${tasks.length}** overdue task(s):`)
          .addFields(
            tasks.map(task => {
              const dueDate = new Date(task.dueDate);
              const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
              return {
                name: task.text,
                value: `Due: ${dueDate.toLocaleString()} (${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} ago)`,
                inline: false,
              };
            })
          )
          .setFooter({ text: 'Lunchbox AI Task Reminders' })
          .setTimestamp();
        
        // Send to task owner
        if (ownerDiscordId) {
          await sendDiscordDM(client, ownerDiscordId, embed).catch(err => {
            logger.error('Failed to send overdue notification to owner', {
              userId,
              ownerDiscordId,
              error: err.message,
            });
          });
        }
        
        // Send to watchers
        for (const watcherDiscordId of watcherDiscordIds) {
          if (watcherDiscordId !== ownerDiscordId) {
            await sendDiscordDM(client, watcherDiscordId, embed).catch(err => {
              logger.error('Failed to send overdue notification to watcher', {
                userId,
                watcherDiscordId,
                error: err.message,
              });
            });
          }
        }
        
        // Mark as notified
        const nowISO = now.toISOString();
        for (const task of tasks) {
          await db.collection('tasks').doc(task.id).update({
            lastOverdueNotification: nowISO,
          }).catch(err => {
            logger.error('Failed to update lastOverdueNotification', {
              taskId: task.id,
              error: err.message,
            });
          });
        }
      }
    }
  } catch (error) {
    logger.error('Error checking overdue tasks', {
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Check for newly completed tasks and notify owner and watchers
 */
async function checkCompletedTasks(client, taskId = null) {
  const db = initializeFirebase();
  
  try {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000); // Last 1 minute (buffer for 30-second cron)
    
    let tasksToNotify = [];
    
    if (taskId) {
      // Check specific task immediately
      const taskDoc = await db.collection('tasks').doc(taskId).get();
      if (!taskDoc.exists) {
        logger.info('Task not found for immediate notification', { taskId });
        return;
      }
      const task = taskDoc.data();
      if (!task.completed) {
        logger.info('Task not completed, skipping notification', { taskId });
        return;
      }
      tasksToNotify = [{ id: taskDoc.id, ...task }];
    } else {
      // Cron job: Query ALL completed tasks and filter for ones that need notification
      // This is more reliable than querying by updatedAt
      const tasksSnapshot = await db.collection('tasks')
        .where('completed', '==', true)
        .get();
      
      if (tasksSnapshot.empty) {
        return;
      }
      
      // Filter tasks that:
      // 1. Were completed recently (within last 5 minutes based on updatedAt)
      // 2. Haven't been notified yet, or were notified more than 5 minutes ago
      const admin = require('firebase-admin');
      
      for (const doc of tasksSnapshot.docs) {
        const task = doc.data();
        const taskId = doc.id;
        
        // Check if task was updated recently (completed)
        let taskUpdatedAt = null;
        if (task.updatedAt) {
          // Handle both Timestamp and string formats
          if (task.updatedAt.toDate) {
            taskUpdatedAt = task.updatedAt.toDate();
          } else if (typeof task.updatedAt === 'string') {
            taskUpdatedAt = new Date(task.updatedAt);
          } else if (task.updatedAt instanceof Date) {
            taskUpdatedAt = task.updatedAt;
          }
        }
        
        // Skip if task wasn't updated recently (not just completed)
        if (!taskUpdatedAt || taskUpdatedAt < oneMinuteAgo) {
          continue;
        }
        
        // Check if notification was already sent recently
        if (task.lastCompletionNotification) {
          let lastNotified = null;
          if (task.lastCompletionNotification.toDate) {
            lastNotified = task.lastCompletionNotification.toDate();
          } else if (typeof task.lastCompletionNotification === 'string') {
            lastNotified = new Date(task.lastCompletionNotification);
          } else if (task.lastCompletionNotification instanceof Date) {
            lastNotified = task.lastCompletionNotification;
          }
          
          if (lastNotified) {
            const secondsSince = (now - lastNotified) / 1000;
            if (secondsSince < 30) {
              // Already notified in last 30 seconds (prevent duplicates)
              continue;
            }
          }
        }
        
        // This task needs notification
        tasksToNotify.push({ id: taskId, ...task });
      }
    }
    
    if (tasksToNotify.length === 0) {
      return;
    }
    
    // Get all Discord links upfront
    const discordLinksSnapshot = await db.collection('discord_links').get();
    const discordLinksByUid = new Map();
    discordLinksSnapshot.docs.forEach(doc => {
      const link = doc.data();
      discordLinksByUid.set(link.uid, link.discordId);
    });
    
    // Process each completed task that needs notification
    for (const task of tasksToNotify) {
      const taskId = task.id;
      const userId = task.userId;
      
      // CRITICAL: Mark as notified IMMEDIATELY using transaction to prevent duplicate notifications
      // This ensures atomic check-and-update, preventing race conditions
      const admin = require('firebase-admin');
      const taskRef = db.collection('tasks').doc(taskId);
      
      let shouldNotify = false;
      
      try {
        // Use transaction to atomically check and mark as notified
        await db.runTransaction(async (transaction) => {
          const taskDoc = await transaction.get(taskRef);
          
          if (!taskDoc.exists) {
            return; // Task doesn't exist, skip
          }
          
          const currentTask = taskDoc.data();
          const currentLastNotified = currentTask.lastCompletionNotification;
          
          // Check if already notified very recently (within last 10 seconds)
          if (currentLastNotified) {
            let lastNotified = null;
            if (currentLastNotified.toDate) {
              lastNotified = currentLastNotified.toDate();
            } else if (typeof currentLastNotified === 'string') {
              lastNotified = new Date(currentLastNotified);
            } else if (currentLastNotified instanceof Date) {
              lastNotified = currentLastNotified;
            }
            
            if (lastNotified) {
              const secondsSince = (now - lastNotified) / 1000;
              if (secondsSince < 10) {
                // Already notified in last 10 seconds, skip
                logger.debug('Task already notified recently, skipping', { taskId, secondsSince });
                return; // Don't mark as shouldNotify
              }
            }
          }
          
          // Mark as notified BEFORE sending (prevents race conditions)
          transaction.update(taskRef, {
            lastCompletionNotification: admin.firestore.FieldValue.serverTimestamp(),
          });
          
          shouldNotify = true;
        });
      } catch (err) {
        logger.error('Failed to mark task as notified in transaction', {
          taskId,
          error: err.message,
        });
        // If transaction fails, skip this task to avoid duplicates
        continue;
      }
      
      // Skip if transaction determined we shouldn't notify
      if (!shouldNotify) {
        continue;
      }
      
      // Get watchers from user_settings (user-level, not task-level)
      const userSettingsDoc = await db.collection('user_settings').doc(userId).get();
      const userSettings = userSettingsDoc.data() || {};
      const watchers = userSettings.taskWatchers || []; // Array of Firebase UIDs
      
      // Get Discord ID for task owner
      const ownerDiscordId = discordLinksByUid.get(userId);
      
      // Get Discord IDs for watchers
      const watcherDiscordIds = watchers
        .map(uid => discordLinksByUid.get(uid))
        .filter(id => id); // Remove undefined
      
      // Format dates for embed
      let completedAt = now;
      if (task.updatedAt) {
        if (task.updatedAt.toDate) {
          completedAt = task.updatedAt.toDate();
        } else if (typeof task.updatedAt === 'string') {
          completedAt = new Date(task.updatedAt);
        } else if (task.updatedAt instanceof Date) {
          completedAt = task.updatedAt;
        }
      }
      
      let dueDateStr = null;
      if (task.dueDate) {
        if (task.dueDate.toDate) {
          dueDateStr = task.dueDate.toDate().toLocaleString();
        } else if (typeof task.dueDate === 'string') {
          dueDateStr = new Date(task.dueDate).toLocaleString();
        } else if (task.dueDate instanceof Date) {
          dueDateStr = task.dueDate.toLocaleString();
        }
      }
      
      // Create notification embed
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Task Completed!')
        .setDescription(`**${task.text}** has been marked as completed!`)
        .addFields(
          { name: 'Task', value: task.text, inline: false },
          ...(task.description ? [{ name: 'Description', value: task.description, inline: false }] : []),
          ...(dueDateStr ? [{ name: 'Was Due', value: dueDateStr, inline: true }] : []),
          { name: 'Completed At', value: completedAt.toLocaleString(), inline: true }
        )
        .setFooter({ text: 'Lunchbox AI Task Notifications' })
        .setTimestamp();
      
      // Send to task owner
      if (ownerDiscordId) {
        await sendDiscordDM(client, ownerDiscordId, embed).catch(err => {
          logger.error('Failed to send completion notification to owner', {
            taskId,
            ownerDiscordId,
            error: err.message,
          });
        });
      }
      
      // Send to watchers
      for (const watcherDiscordId of watcherDiscordIds) {
        if (watcherDiscordId !== ownerDiscordId) { // Don't send duplicate to owner
          await sendDiscordDM(client, watcherDiscordId, embed).catch(err => {
            logger.error('Failed to send completion notification to watcher', {
              taskId,
              watcherDiscordId,
              error: err.message,
            });
          });
        }
      }
    }
    
    logger.info('Checked completed tasks', {
      tasksFound: tasksToNotify.length,
      taskId: taskId || null,
      notified: tasksToNotify.length,
    });
    
  } catch (error) {
    logger.error('Error checking completed tasks', {
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Send daily summary at 5 PM (user's timezone)
 */
async function sendDailySummary(client) {
  const db = initializeFirebase();
  
  try {
    // Get all Discord links
    const discordLinksSnapshot = await db.collection('discord_links').get();
    
    for (const linkDoc of discordLinksSnapshot.docs) {
      const link = linkDoc.data();
      const userId = link.uid;
      const discordUserId = link.discordId;
      
      // Get user's timezone (use Firebase UID, not Discord ID)
      const timezoneInfo = await getUserTimezone(userId);
      if (!timezoneInfo) continue;
      
      // Check if it's 5 PM in user's timezone
      const userTime = DateTime.now().setZone(timezoneInfo.timezone);
      const hour = userTime.hour;
      const minute = userTime.minute;
      
      // Only send if it's between 5:00 PM and 5:05 PM (to catch the cron window)
      if (hour !== 17 || minute > 5) continue;
      
      // Check if summary was already sent today
      const userSettingsDoc = await db.collection('user_settings').doc(userId).get();
      const userSettings = userSettingsDoc.data() || {};
      const lastSummaryDate = userSettings.lastSummaryDate || null;
      
      const today = userTime.toISODate();
      if (lastSummaryDate === today) continue; // Already sent today
      
      // Get all user's tasks
      const tasksSnapshot = await db.collection('tasks')
        .where('userId', '==', userId)
        .get();
      
      const allTasks = tasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Categorize tasks
      const now = new Date();
      const dueTasks = allTasks.filter(t => 
        !t.completed && 
        t.dueDate && 
        new Date(t.dueDate) >= now &&
        new Date(t.dueDate) <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // Next 7 days
      );
      
      const overdueTasks = allTasks.filter(t => 
        !t.completed && 
        t.dueDate && 
        new Date(t.dueDate) < now
      );
      
      const incompleteTasks = allTasks.filter(t => !t.completed);
      const completedToday = allTasks.filter(t => {
        if (!t.completed || !t.updatedAt) return false;
        const updatedDate = new Date(t.updatedAt);
        const today = new Date();
        return (
          updatedDate.getDate() === today.getDate() &&
          updatedDate.getMonth() === today.getMonth() &&
          updatedDate.getFullYear() === today.getFullYear()
        );
      });
      
      // Create summary embed
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 Daily Task Summary')
        .setDescription(`Here's your task overview for ${userTime.toFormat('EEEE, MMMM d, yyyy')}:`)
        .addFields(
          {
            name: `✅ Completed Today (${completedToday.length})`,
            value: completedToday.length > 0 
              ? completedToday.slice(0, 5).map(t => `• ${t.text}`).join('\n') + (completedToday.length > 5 ? `\n*+${completedToday.length - 5} more*` : '')
              : 'No tasks completed today',
            inline: false,
          },
          {
            name: `⏰ Due Soon (${dueTasks.length})`,
            value: dueTasks.length > 0
              ? dueTasks.slice(0, 5).map(t => {
                  const dueDate = new Date(t.dueDate);
                  return `• ${t.text} - ${dueDate.toLocaleDateString()}`;
                }).join('\n') + (dueTasks.length > 5 ? `\n*+${dueTasks.length - 5} more*` : '')
              : 'No tasks due soon',
            inline: false,
          },
          {
            name: `🚨 Overdue (${overdueTasks.length})`,
            value: overdueTasks.length > 0
              ? overdueTasks.slice(0, 5).map(t => `• ${t.text}`).join('\n') + (overdueTasks.length > 5 ? `\n*+${overdueTasks.length - 5} more*` : '')
              : 'No overdue tasks',
            inline: false,
          },
          {
            name: `📋 Incomplete Tasks (${incompleteTasks.length})`,
            value: incompleteTasks.length > 0
              ? `You have ${incompleteTasks.length} task(s) still to complete`
              : 'All tasks completed! 🎉',
            inline: false,
          }
        )
        .setFooter({ text: 'Lunchbox AI Daily Summary' })
        .setTimestamp();
      
      await sendDiscordDM(client, discordUserId, embed);
      
      // Mark summary as sent
      await db.collection('user_settings').doc(userId).set({
        lastSummaryDate: today,
      }, { merge: true });
      
      logger.info('Daily summary sent', {
        userId,
        discordUserId,
        completedToday: completedToday.length,
        dueTasks: dueTasks.length,
        overdueTasks: overdueTasks.length,
        incompleteTasks: incompleteTasks.length,
      });
    }
    
  } catch (error) {
    logger.error('Error sending daily summary', {
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Run all notification checks
 */
async function runNotificationChecks(client) {
  logger.info('Running notification checks...');
  
  await Promise.all([
    checkTasksDueSoon(client),
    checkOverdueTasks(client),
    checkCompletedTasks(client),
    sendDailySummary(client),
  ]);
  
  logger.info('Notification checks completed');
}

module.exports = {
  checkTasksDueSoon,
  checkOverdueTasks,
  checkCompletedTasks,
  sendDailySummary,
  runNotificationChecks,
};

