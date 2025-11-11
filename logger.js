/**
 * Structured logging for Discord bot
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const currentLogLevel = process.env.LOG_LEVEL 
  ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] 
  : LOG_LEVELS.INFO;

function formatLog(level, message, context = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...context,
  };
  
  return JSON.stringify(logEntry);
}

function debug(message, context) {
  if (currentLogLevel <= LOG_LEVELS.DEBUG) {
    console.log(formatLog('DEBUG', message, context));
  }
}

function info(message, context) {
  if (currentLogLevel <= LOG_LEVELS.INFO) {
    console.log(formatLog('INFO', message, context));
  }
}

function warn(message, context) {
  if (currentLogLevel <= LOG_LEVELS.WARN) {
    console.warn(formatLog('WARN', message, context));
  }
}

function error(message, context) {
  if (currentLogLevel <= LOG_LEVELS.ERROR) {
    console.error(formatLog('ERROR', message, context));
  }
}

function logCommand(commandName, userId, username, success, errorMessage = null) {
  const logData = {
    command: commandName,
    userId,
    username,
    success,
  };
  
  if (errorMessage) {
    logData.error = errorMessage;
  }
  
  if (success) {
    info(`Command executed: ${commandName}`, logData);
  } else {
    error(`Command failed: ${commandName}`, logData);
  }
}

function logRedemption(userId, username, rewardId, cost, success, errorMessage = null) {
  const logData = {
    userId,
    username,
    rewardId,
    cost,
    success,
  };
  
  if (errorMessage) {
    logData.error = errorMessage;
  }
  
  if (success) {
    info('Redemption completed', logData);
  } else {
    error('Redemption failed', logData);
  }
}

module.exports = {
  debug,
  info,
  warn,
  error,
  logCommand,
  logRedemption,
};

