// Only load dotenv if not in Firebase Functions environment
if (!process.env.FUNCTION_TARGET && !process.env.FUNCTION_NAME && !process.env.K_SERVICE) {
  try {
    require('dotenv').config();
  } catch (e) {
    // dotenv might fail if .env doesn't exist - that's okay
  }
}
const express = require('express');
const { linkDiscordAccount, getUserByEmail } = require('./firebase-utils');
const logger = require('./logger');

const app = express();
const PORT = process.env.OAUTH_PORT || 3001;

app.use(express.json());

/**
 * OAuth callback handler
 * This receives the Discord user ID and Firebase user info from the Next.js callback
 */
app.post('/auth/discord/link', async (req, res) => {
  try {
    const { discordId, email, uid, username } = req.body;
    
    if (!discordId || !email || !uid) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Link accounts
    await linkDiscordAccount(discordId, email, uid, username, 'oauth');
    
    logger.info('OAuth link successful', { discordId, email });
    
    res.json({ success: true, message: 'Account linked successfully' });
  } catch (error) {
    logger.error('OAuth link failed', { error: error.message });
    res.status(500).json({ error: 'Failed to link accounts' });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Trigger immediate task completion notification
 * Called by the website when a task is completed
 */
app.post('/api/notify-task-completed', async (req, res) => {
  try {
    const { taskId } = req.body;
    
    if (!taskId) {
      return res.status(400).json({ error: 'Task ID is required' });
    }
    
    // Try to import and call the notification function from bot.js
    // This will work once the bot is initialized
    try {
      const botModule = require('./bot');
      const { triggerTaskCompletionNotification, client } = botModule;
      
      // Check if client is ready
      if (!client || !client.isReady()) {
        logger.warn('Discord bot not ready yet, notification will be processed on next scheduled check', { taskId });
        return res.json({
          success: true,
          message: 'Notification queued (bot not ready yet, will be processed on next scheduled check)',
          warning: 'Bot is initializing',
        });
      }
      
      const success = await triggerTaskCompletionNotification(taskId);
      
      if (success) {
        res.json({ success: true, message: 'Notification triggered' });
      } else {
        res.status(500).json({ error: 'Failed to trigger notification' });
      }
    } catch (requireError) {
      // Bot.js may not be fully loaded yet
      logger.warn('Bot.js not available yet, notification will be processed on next scheduled check', {
        error: requireError.message,
        taskId,
      });
      
      res.json({
        success: true,
        message: 'Notification queued (will be processed on next scheduled check)',
        warning: 'Bot is initializing',
      });
    }
  } catch (error) {
    logger.error('Error in notify-task-completed endpoint', {
      error: error.message,
      stack: error.stack,
    });
    
    // Still return success - the bot will catch it on the next poll
    res.json({
      success: true,
      message: 'Notification queued (will be processed on next scheduled check)',
      warning: 'Bot may not be fully initialized yet',
    });
  }
});

// Start server only if not in Firebase Functions environment
// Check multiple environment variables that Firebase Functions might set
if (!process.env.FUNCTION_TARGET && !process.env.FUNCTION_NAME && !process.env.K_SERVICE && !process.env.GCLOUD_PROJECT) {
  if (process.env.NODE_ENV !== 'production' || !process.env.FUNCTIONS_EMULATOR) {
    app.listen(PORT, () => {
      logger.info(`OAuth server listening on port ${PORT}`);
    });
  }
}

module.exports = app;

