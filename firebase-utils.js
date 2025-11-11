const admin = require('firebase-admin');
const logger = require('./logger');

// Initialize Firebase Admin SDK
let db;

function initializeFirebase() {
  if (!db) {
    if (admin.apps.length === 0) {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        : {
            projectId: process.env.FIREBASE_PROJECT_ID,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          };

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    db = admin.firestore();
  }
  return db;
}

/**
 * Get user credits by Firebase UID
 */
async function getUserCredits(uid) {
  const db = initializeFirebase();
  const creditDoc = await db.collection('user_credits').doc(uid).get();
  
  if (!creditDoc.exists) {
    return null;
  }
  
  return creditDoc.data();
}

/**
 * Deduct credits from user account
 */
async function deductCredits(uid, amount, reason, metadata = {}) {
  const db = initializeFirebase();
  
  return await db.runTransaction(async (transaction) => {
    const creditRef = db.collection('user_credits').doc(uid);
    const creditDoc = await transaction.get(creditRef);
    
    if (!creditDoc.exists) {
      throw new Error('User credits not found');
    }
    
    const currentCredits = creditDoc.data().totalCredits || 0;
    
    if (currentCredits < amount) {
      throw new Error('Insufficient credits');
    }
    
    const newTotal = currentCredits - amount;
    
    // Update credits
    transaction.update(creditRef, {
      totalCredits: newTotal,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // Log transaction
    const transactionRef = db.collection('credit_transactions').doc();
    transaction.set(transactionRef, {
      userId: uid,
      amount: -amount,
      type: 'spend',
      reason: reason,
      metadata: metadata,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    return newTotal;
  });
}

/**
 * Add credits to user account (admin function)
 */
async function addCredits(uid, amount, reason, metadata = {}) {
  const db = initializeFirebase();
  
  return await db.runTransaction(async (transaction) => {
    const creditRef = db.collection('user_credits').doc(uid);
    const creditDoc = await transaction.get(creditRef);
    
    let currentCredits = 0;
    let newTotal = 0;
    
    if (!creditDoc.exists) {
      // Create the credit document if it doesn't exist
      newTotal = amount;
      transaction.set(creditRef, {
        totalCredits: newTotal,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      // Update existing credit document
      currentCredits = creditDoc.data().totalCredits || 0;
      newTotal = currentCredits + amount;
      transaction.update(creditRef, {
        totalCredits: newTotal,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    
    // Log transaction
    const transactionRef = db.collection('credit_transactions').doc();
    transaction.set(transactionRef, {
      userId: uid,
      amount: amount,
      type: 'earn',
      reason: reason,
      metadata: metadata,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    return newTotal;
  });
}

/**
 * Link Discord account to Firebase UID
 */
async function linkDiscordAccount(discordId, email, uid, username, linkMethod = 'manual') {
  const db = initializeFirebase();
  
  const linkData = {
    discordId,
    uid,
    email,
    username,
    linkedAt: admin.firestore.FieldValue.serverTimestamp(),
    linkMethod,
  };
  
  await db.collection('discord_links').doc(discordId).set(linkData);
  
  return linkData;
}

/**
 * Get Discord link by Discord ID
 */
async function getDiscordLink(discordId) {
  const db = initializeFirebase();
  const linkDoc = await db.collection('discord_links').doc(discordId).get();
  
  if (!linkDoc.exists) {
    return null;
  }
  
  return linkDoc.data();
}

/**
 * Remove Discord link
 */
async function unlinkDiscordAccount(discordId) {
  const db = initializeFirebase();
  await db.collection('discord_links').doc(discordId).delete();
}

/**
 * Unlock animation for user
 */
async function unlockAnimation(uid, animationId) {
  const db = initializeFirebase();
  const prefsRef = db.collection('userPreferences').doc(uid);
  
  try {
    logger.info(`[unlockAnimation] Starting unlock for user ${uid}, animation: ${animationId}`);
    
    // First, try to get the current document
    const prefsDoc = await prefsRef.get();
    const currentUnlocked = prefsDoc.exists 
      ? (prefsDoc.data().unlockedAnimations || [])
      : [];
    
    logger.info(`[unlockAnimation] Current unlocked animations: ${JSON.stringify(currentUnlocked)}`);
    
    if (currentUnlocked.includes(animationId)) {
      logger.info(`[unlockAnimation] Animation ${animationId} already unlocked for user ${uid}`);
      return currentUnlocked;
    }
    
    // Use a transaction to safely update
    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(prefsRef);
      const existingUnlocked = doc.exists 
        ? (doc.data().unlockedAnimations || [])
        : [];
      
      logger.info(`[unlockAnimation] Transaction - existing unlocked: ${JSON.stringify(existingUnlocked)}`);
      
      if (!existingUnlocked.includes(animationId)) {
        const newUnlocked = [...existingUnlocked, animationId];
        
        if (doc.exists) {
          logger.info(`[unlockAnimation] Updating existing document for user ${uid}`);
          // If the field doesn't exist, we need to set it directly, otherwise use arrayUnion
          const docData = doc.data();
          if (docData.unlockedAnimations === undefined || docData.unlockedAnimations === null) {
            // Field doesn't exist, set it directly
            transaction.update(prefsRef, {
              unlockedAnimations: [animationId],
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              userId: uid,
            });
          } else {
            // Field exists, use arrayUnion
            transaction.update(prefsRef, {
              unlockedAnimations: admin.firestore.FieldValue.arrayUnion(animationId),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              userId: uid,
            });
          }
        } else {
          logger.info(`[unlockAnimation] Creating new document for user ${uid}`);
          transaction.set(prefsRef, {
            unlockedAnimations: [animationId],
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            userId: uid,
          });
        }
        
        return newUnlocked;
      }
      
      logger.info(`[unlockAnimation] Animation ${animationId} already in unlocked list`);
      return existingUnlocked;
    });
    
    logger.info(`[unlockAnimation] ✅ Successfully unlocked animation ${animationId} for user ${uid}. New unlocked: ${JSON.stringify(result)}`);
    
    // Verify the write by reading back
    const verifyDoc = await prefsRef.get();
    if (verifyDoc.exists) {
      const verifiedUnlocked = verifyDoc.data().unlockedAnimations || [];
      logger.info(`[unlockAnimation] Verified: unlocked animations in Firestore: ${JSON.stringify(verifiedUnlocked)}`);
    }
    
    return result;
  } catch (error) {
    logger.error('[unlockAnimation] ❌ Error unlocking animation', { 
      error: error.message, 
      stack: error.stack,
      uid, 
      animationId 
    });
    throw error;
  }
}

/**
 * Log redemption
 */
async function logRedemption(data) {
  const db = initializeFirebase();
  const redemptionRef = await db.collection('redemptions').add({
    ...data,
    redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
    status: 'completed',
  });
  
  return redemptionRef.id;
}

/**
 * Get user by email
 */
async function getUserByEmail(email) {
  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    return userRecord;
  } catch (error) {
    return null;
  }
}

/**
 * Get credit transactions for a user
 */
async function getCreditTransactions(uid, limit = 10) {
  const db = initializeFirebase();
  const snapshot = await db.collection('credit_transactions')
    .where('userId', '==', uid)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get all redemptions (admin)
 */
async function getAllRedemptions(limit = 50) {
  const db = initializeFirebase();
  const snapshot = await db.collection('redemptions')
    .orderBy('redeemedAt', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get server statistics
 */
async function getServerStats() {
  const db = initializeFirebase();
  
  const linksSnapshot = await db.collection('discord_links').count().get();
  const redemptionsSnapshot = await db.collection('redemptions').count().get();
  
  return {
    totalLinkedAccounts: linksSnapshot.data().count,
    totalRedemptions: redemptionsSnapshot.data().count,
  };
}

/**
 * Get user redemptions
 */
async function getUserRedemptions(uid, rewardId = null) {
  const db = initializeFirebase();
  let query = db.collection('redemptions')
    .where('uid', '==', uid)
    .where('status', '==', 'completed');
  
  if (rewardId) {
    query = query.where('rewardId', '==', rewardId);
  }
  
  const snapshot = await query.orderBy('redeemedAt', 'desc').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Process refund for a redemption
 */
async function processRefund(uid, redemptionId, refundAmount, reason) {
  const db = initializeFirebase();
  
  return await db.runTransaction(async (transaction) => {
    // STEP 1: DO ALL READS FIRST (Firestore requirement)
    const redemptionRef = db.collection('redemptions').doc(redemptionId);
    const creditRef = db.collection('user_credits').doc(uid);
    
    // Read redemption
    const redemptionDoc = await transaction.get(redemptionRef);
    
    // Read credits
    const creditDoc = await transaction.get(creditRef);
    
    // STEP 2: VALIDATE READS
    if (!redemptionDoc.exists) {
      throw new Error('Redemption not found');
    }
    
    const redemption = redemptionDoc.data();
    
    if (redemption.status !== 'completed') {
      throw new Error('This redemption cannot be refunded');
    }
    
    if (!creditDoc.exists) {
      throw new Error('User credits not found');
    }
    
    const currentCredits = creditDoc.data().totalCredits || 0;
    const newTotal = currentCredits + refundAmount;
    
    // STEP 3: DO ALL WRITES (after all reads complete)
    
    // Mark redemption as refunded
    transaction.update(redemptionRef, {
      status: 'refunded',
      refundedAt: admin.firestore.FieldValue.serverTimestamp(),
      refundAmount: refundAmount,
    });
    
    // Add credits back to user
    transaction.update(creditRef, {
      totalCredits: newTotal,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // Log refund transaction
    const transactionRef = db.collection('credit_transactions').doc();
    transaction.set(transactionRef, {
      userId: uid,
      amount: refundAmount,
      type: 'earn',
      reason: reason,
      metadata: {
        redemptionId: redemptionId,
        isRefund: true,
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    return newTotal;
  });
}

/**
 * Get user tasks from Firebase
 */
async function getUserTasks(uid, filters = {}) {
  const db = initializeFirebase();
  let query = db.collection('tasks').where('userId', '==', uid);
  
  // Apply filters - note: Firestore requires composite indexes for multiple where clauses
  if (filters.completed !== undefined) {
    query = query.where('completed', '==', filters.completed);
  }
  
  // For overdue, we'll filter in memory after fetching to avoid index issues
  const snapshot = await query.orderBy('createdAt', 'desc').limit(filters.limit || 50).get();
  let tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Apply overdue filter in memory
  if (filters.overdue) {
    const now = new Date();
    tasks = tasks.filter(task => {
      if (!task.dueDate || task.completed) return false;
      const dueDate = task.dueDate?.toDate ? task.dueDate.toDate() : new Date(task.dueDate);
      return dueDate < now;
    });
  }
  
  return tasks;
}

/**
 * Create a new task
 */
async function createTask(uid, taskData) {
  const db = initializeFirebase();
  const taskRef = await db.collection('tasks').add({
    ...taskData,
    userId: uid,
    completed: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return taskRef.id;
}

/**
 * Update a task
 */
async function updateTask(taskId, updates) {
  const db = initializeFirebase();
  await db.collection('tasks').doc(taskId).update({
    ...updates,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Get user routines
 */
async function getUserRoutines(uid) {
  const db = initializeFirebase();
  const snapshot = await db.collection('routines').where('userId', '==', uid).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get user productivity stats
 */
async function getUserStats(uid, period = 'all-time') {
  const db = initializeFirebase();
  const now = new Date();
  let startDate = new Date(0); // Beginning of time
  
  if (period === 'today') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === 'week') {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === 'month') {
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  
  // Get all tasks
  const tasksSnapshot = await db.collection('tasks')
    .where('userId', '==', uid)
    .get();
  
  const tasks = tasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Filter by period
  const periodTasks = tasks.filter(task => {
    const taskDate = task.createdAt?.toDate ? task.createdAt.toDate() : new Date(task.createdAt);
    return taskDate >= startDate;
  });
  
  const completedTasks = periodTasks.filter(t => t.completed);
  const pendingTasks = periodTasks.filter(t => !t.completed);
  const overdueTasks = pendingTasks.filter(t => {
    if (!t.dueDate) return false;
    const dueDate = t.dueDate?.toDate ? t.dueDate.toDate() : new Date(t.dueDate);
    return dueDate < now;
  });
  
  // Calculate completion rate
  const completionRate = periodTasks.length > 0 
    ? (completedTasks.length / periodTasks.length * 100).toFixed(1)
    : 0;
  
  // Get most used tags
  const tagCounts = {};
  periodTasks.forEach(task => {
    if (task.tags && Array.isArray(task.tags)) {
      task.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    }
  });
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => ({ tag, count }));
  
  return {
    totalTasks: periodTasks.length,
    completedTasks: completedTasks.length,
    pendingTasks: pendingTasks.length,
    overdueTasks: overdueTasks.length,
    completionRate: parseFloat(completionRate),
    topTags,
  };
}

/**
 * Search tasks
 */
async function searchTasks(uid, query, limit = 20) {
  const db = initializeFirebase();
  const snapshot = await db.collection('tasks')
    .where('userId', '==', uid)
    .get();
  
  const allTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const searchLower = query.toLowerCase();
  
  // Simple text search
  const results = allTasks.filter(task => {
    const text = (task.text || '').toLowerCase();
    const description = (task.description || '').toLowerCase();
    const tags = (task.tags || []).join(' ').toLowerCase();
    return text.includes(searchLower) || description.includes(searchLower) || tags.includes(searchLower);
  });
  
  return results.slice(0, limit);
}

/**
 * Get user notification settings
 */
async function getUserNotificationSettings(uid) {
  const db = initializeFirebase();
  const settingsDoc = await db.collection('user_settings').doc(uid).get();
  
  if (!settingsDoc.exists) {
    return {
      dueSoonEnabled: true,
      overdueEnabled: true,
      dailySummaryEnabled: true,
      completionEnabled: true,
      dueSoonHours: 1,
      dailySummaryTime: '17:00', // 5 PM
    };
  }
  
  const data = settingsDoc.data();
  return {
    dueSoonEnabled: data.dueSoonNotifications !== false,
    overdueEnabled: data.overdueNotifications !== false,
    dailySummaryEnabled: data.dailySummaryEnabled !== false,
    completionEnabled: data.completionNotifications !== false,
    dueSoonHours: data.dueSoonHours || 1,
    dailySummaryTime: data.dailySummaryTime || '17:00',
  };
}

/**
 * Update user notification settings
 */
async function updateUserNotificationSettings(uid, settings) {
  const db = initializeFirebase();
  await db.collection('user_settings').doc(uid).set({
    ...settings,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

module.exports = {
  initializeFirebase,
  getUserCredits,
  deductCredits,
  addCredits,
  linkDiscordAccount,
  getDiscordLink,
  unlinkDiscordAccount,
  logRedemption,
  getUserByEmail,
  getCreditTransactions,
  getAllRedemptions,
  getServerStats,
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
};

