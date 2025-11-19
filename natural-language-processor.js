/**
 * Natural Language Command Processor
 * Converts natural language requests into actionable commands
 */

const { callAI } = require('./ai-integration');
const logger = require('./logger');

// Super admin Discord username (case-insensitive)
const SUPER_ADMIN_USERNAME = 'annoyingalarm21'; // Discord username

/**
 * Check if user is super admin
 * Can check by username (case-insensitive) or by stored admin permissions
 */
function isSuperAdmin(userId, username) {
  // Check by username (case-insensitive)
  if (username && username.toLowerCase() === SUPER_ADMIN_USERNAME.toLowerCase()) {
    return true;
  }
  // Will also check stored permissions in getAdminPermissions
  return false;
}

/**
 * Get admin permissions for a user
 */
async function getAdminPermissions(userId, username = null) {
  // First check by username (super admin check)
  if (username && isSuperAdmin(userId, username)) {
    return {
      isAdmin: true,
      isSuperAdmin: true,
      grantedBy: 'system',
      grantedAt: null,
    };
  }
  
  const { initializeFirebase } = require('./firebase-utils');
  const db = initializeFirebase();
  
  try {
    const adminDoc = await db.collection('discord_admins').doc(userId).get();
    if (!adminDoc.exists) {
      return { isAdmin: false, isSuperAdmin: false };
    }
    
    const data = adminDoc.data();
    return {
      isAdmin: data.isAdmin || false,
      isSuperAdmin: data.isSuperAdmin || false,
      grantedBy: data.grantedBy || null,
      grantedAt: data.grantedAt || null,
    };
  } catch (error) {
    logger.error('Error getting admin permissions', { error: error.message, userId });
    return { isAdmin: false, isSuperAdmin: false };
  }
}

/**
 * Grant admin permissions (only super admin can do this)
 */
async function grantAdminPermissions(grantorId, grantorUsername, targetUserId, targetUsername) {
  if (!isSuperAdmin(grantorId, grantorUsername)) {
    throw new Error('Only super admin can grant admin permissions');
  }
  
  const { initializeFirebase } = require('./firebase-utils');
  const admin = require('firebase-admin');
  const db = initializeFirebase();
  
  await db.collection('discord_admins').doc(targetUserId).set({
    isAdmin: true,
    isSuperAdmin: false,
    grantedBy: grantorId,
    grantedByUsername: grantorUsername,
    grantedAt: admin.firestore.FieldValue.serverTimestamp(),
    targetUserId,
    targetUsername,
  });
  
  logger.info('Admin permissions granted', {
    grantorId,
    grantorUsername,
    targetUserId,
    targetUsername,
  });
}

/**
 * Revoke admin permissions (only super admin can do this)
 */
async function revokeAdminPermissions(grantorId, grantorUsername, targetUserId) {
  if (!isSuperAdmin(grantorId, grantorUsername)) {
    throw new Error('Only super admin can revoke admin permissions');
  }
  
  const { initializeFirebase } = require('./firebase-utils');
  const db = initializeFirebase();
  
  await db.collection('discord_admins').doc(targetUserId).delete();
  
  logger.info('Admin permissions revoked', {
    grantorId,
    grantorUsername,
    targetUserId,
  });
}

/**
 * Process natural language command and determine intent
 */
async function processNaturalLanguageCommand(userMessage, userId, username, isLinked = false) {
  const message = userMessage.toLowerCase().trim();
  
  // Available commands mapping
  const commandMap = {
    // Task commands
    'tasks': ['show tasks', 'list tasks', 'my tasks', 'task list', 'view tasks', 'see tasks', 'what tasks', 'all tasks'],
    'task-create': ['create task', 'add task', 'new task', 'make task', 'task create'],
    'task-complete': ['complete task', 'finish task', 'done task', 'mark complete', 'task done'],
    'task-delete': ['delete task', 'remove task', 'cancel task'],
    'task-update': ['update task', 'edit task', 'change task', 'modify task'],
    
    // Calendar commands
    'calendar': ['calendar', 'schedule', 'my schedule', 'what\'s scheduled', 'show calendar', 'view calendar'],
    
    // Routine commands
    'routines': ['routines', 'my routines', 'show routines', 'list routines', 'view routines'],
    
    // Stats commands
    'stats': ['stats', 'statistics', 'my stats', 'productivity stats', 'show stats', 'view stats'],
    
    // Credits commands
    'credits': ['credits', 'balance', 'my credits', 'credit balance', 'how many credits'],
    'rewards': ['rewards', 'show rewards', 'available rewards', 'what rewards'],
    'redeem': ['redeem', 'buy reward', 'get reward', 'claim reward'],
    
    // Search commands
    'search': ['search', 'find', 'look for', 'search for'],
    
    // Notifications commands
    'notifications': ['notifications', 'notification settings', 'notify settings', 'alert settings'],
    
    // Achievements commands
    'achievements': ['achievements', 'badges', 'my achievements', 'show achievements'],
    
    // Admin commands (require admin check)
    'admin-credits': ['give credits', 'add credits', 'adjust credits', 'set credits'],
    'admin-link': ['link account', 'force link', 'connect account'],
    'admin-stats': ['server stats', 'server statistics', 'all users stats'],
    'admin-redemptions': ['recent redemptions', 'all redemptions', 'redemption history'],
    'grant-admin': ['grant admin', 'make admin', 'give admin', 'add admin'],
    'revoke-admin': ['revoke admin', 'remove admin', 'take admin', 'revoke permissions'],
  };
  
  // Check for exact matches first
  for (const [command, patterns] of Object.entries(commandMap)) {
    for (const pattern of patterns) {
      if (message.includes(pattern)) {
        return {
          command,
          confidence: 0.9,
          originalMessage: userMessage,
        };
      }
    }
  }
  
  // Use AI to understand intent if no exact match
  try {
    const systemPrompt = `You are a command interpreter for a Discord bot. Analyze the user's message and determine what command they want to execute.

Available commands:
- tasks: View user's tasks
- task-create: Create a new task
- task-complete: Mark a task as complete
- task-delete: Delete a task
- task-update: Update a task
- calendar: View calendar/schedule
- routines: View routines
- stats: View productivity statistics
- credits: Check credit balance
- rewards: View available rewards
- redeem: Redeem a reward
- search: Search tasks/routines
- notifications: Manage notification settings
- achievements: View achievements

Admin commands (require admin permission):
- admin-credits: Adjust user credits
- admin-link: Link Discord to email
- admin-stats: Server statistics
- admin-redemptions: View all redemptions
- grant-admin: Grant admin permissions (super admin only)
- revoke-admin: Revoke admin permissions (super admin only)

Respond with ONLY a JSON object in this format:
{
  "command": "command-name",
  "confidence": 0.0-1.0,
  "parameters": {}
}

If unsure, use "tasks" as default.`;

    const aiResponse = await callAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ]);
    
    let parsed;
    try {
      const responseText = aiResponse[0]?.text || '{}';
      // Try to extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(responseText);
      }
    } catch (e) {
      // Fallback to default
      parsed = { command: 'tasks', confidence: 0.5 };
    }
    
    return {
      command: parsed.command || 'tasks',
      confidence: parsed.confidence || 0.5,
      parameters: parsed.parameters || {},
      originalMessage: userMessage,
    };
  } catch (error) {
    logger.error('Error processing natural language command', {
      error: error.message,
      userId,
      username,
    });
    
    // Default fallback
    return {
      command: 'tasks',
      confidence: 0.3,
      originalMessage: userMessage,
    };
  }
}

/**
 * Check if user has permission for admin command
 */
async function checkAdminPermission(userId, username, command) {
  const adminCommands = [
    'admin-credits',
    'admin-link',
    'admin-stats',
    'admin-redemptions',
    'grant-admin',
    'revoke-admin',
  ];
  
  if (!adminCommands.includes(command)) {
    return { allowed: true }; // Not an admin command
  }
  
  // Check admin permissions (includes super admin check)
  const permissions = await getAdminPermissions(userId, username);
  
  if (permissions.isSuperAdmin || permissions.isAdmin) {
    // Super admin can do everything, regular admin can do most things
    // But only super admin can grant/revoke admin
    if ((command === 'grant-admin' || command === 'revoke-admin') && !permissions.isSuperAdmin) {
      return { allowed: false, reason: 'Only super admin can grant/revoke admin permissions' };
    }
    
    return { allowed: true, isSuperAdmin: permissions.isSuperAdmin };
  }
  
  return { allowed: false, reason: 'Admin permission required' };
}

module.exports = {
  processNaturalLanguageCommand,
  checkAdminPermission,
  isSuperAdmin,
  getAdminPermissions,
  grantAdminPermissions,
  revokeAdminPermissions,
  SUPER_ADMIN_ID,
};

