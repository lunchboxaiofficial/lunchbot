const { DateTime } = require('luxon');
const logger = require('./logger');

/**
 * Timezone mappings from UTC offset to IANA timezone
 * Includes major US timezones
 */
const TIMEZONE_MAP = {
  '-5': { name: 'America/New_York', display: 'Eastern Time', abbreviation: 'ET' },
  '-6': { name: 'America/Chicago', display: 'Central Time', abbreviation: 'CT' },
  '-7': { name: 'America/Denver', display: 'Mountain Time', abbreviation: 'MT' },
  '-8': { name: 'America/Los_Angeles', display: 'Pacific Time', abbreviation: 'PT' },
  '-9': { name: 'America/Anchorage', display: 'Alaska Time', abbreviation: 'AKT' },
  '-10': { name: 'Pacific/Honolulu', display: 'Hawaii Time', abbreviation: 'HT' },
  '0': { name: 'UTC', display: 'UTC', abbreviation: 'UTC' },
  '1': { name: 'Europe/London', display: 'GMT/BST', abbreviation: 'GMT' },
};

/**
 * Timezone abbreviation mappings
 * Maps common abbreviations to timezone info
 */
const TIMEZONE_ABBREVIATIONS = {
  'est': { name: 'America/New_York', display: 'Eastern Time', abbreviation: 'ET', offset: -5 },
  'edt': { name: 'America/New_York', display: 'Eastern Time', abbreviation: 'ET', offset: -5 },
  'cst': { name: 'America/Chicago', display: 'Central Time', abbreviation: 'CT', offset: -6 },
  'cdt': { name: 'America/Chicago', display: 'Central Time', abbreviation: 'CT', offset: -6 },
  'mst': { name: 'America/Denver', display: 'Mountain Time', abbreviation: 'MT', offset: -7 },
  'mdt': { name: 'America/Denver', display: 'Mountain Time', abbreviation: 'MT', offset: -7 },
  'pst': { name: 'America/Los_Angeles', display: 'Pacific Time', abbreviation: 'PT', offset: -8 },
  'pdt': { name: 'America/Los_Angeles', display: 'Pacific Time', abbreviation: 'PT', offset: -8 },
  'akst': { name: 'America/Anchorage', display: 'Alaska Time', abbreviation: 'AKT', offset: -9 },
  'akdt': { name: 'America/Anchorage', display: 'Alaska Time', abbreviation: 'AKT', offset: -9 },
  'hst': { name: 'Pacific/Honolulu', display: 'Hawaii Time', abbreviation: 'HT', offset: -10 },
  'et': { name: 'America/New_York', display: 'Eastern Time', abbreviation: 'ET', offset: -5 },
  'ct': { name: 'America/Chicago', display: 'Central Time', abbreviation: 'CT', offset: -6 },
  'mt': { name: 'America/Denver', display: 'Mountain Time', abbreviation: 'MT', offset: -7 },
  'pt': { name: 'America/Los_Angeles', display: 'Pacific Time', abbreviation: 'PT', offset: -8 },
};

/**
 * Parse user's time input (e.g., "it's 3pm", "10:30am", "my time is 2:45pm")
 * Returns { hours, minutes } or null if parsing fails
 */
function parseTimeInput(input) {
  const text = input.toLowerCase().trim();
  
  // Remove common phrases
  const cleaned = text
    .replace(/it'?s?\s+/g, '')
    .replace(/my\s+time\s+is\s+/g, '')
    .replace(/currently\s+/g, '')
    .trim();
  
  // Match time patterns: "3pm", "3:30pm", "15:30", "3:30 pm"
  const patterns = [
    /(\d{1,2}):(\d{2})\s*(am|pm)/i,  // 3:30pm, 10:45am
    /(\d{1,2})\s*(am|pm)/i,           // 3pm, 10am
    /(\d{1,2}):(\d{2})/,              // 15:30, 14:00 (24h)
  ];
  
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      let hours = parseInt(match[1]);
      const minutes = match[2] ? parseInt(match[2]) : 0;
      const meridiem = match[3] ? match[3].toLowerCase() : null;
      
      // Convert to 24-hour format
      if (meridiem) {
        if (meridiem === 'pm' && hours !== 12) {
          hours += 12;
        } else if (meridiem === 'am' && hours === 12) {
          hours = 0;
        }
      }
      
      // Validate
      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        return { hours, minutes };
      }
    }
  }
  
  return null;
}

/**
 * Detect timezone based on user's current time or abbreviation
 * @param {string} userTimeInput - User's input like "it's 3pm" or "CST" or "EST"
 * @returns {Object} - { timezone, offset, display, needsConfirmation } or null
 */
function detectTimezone(userTimeInput) {
  const text = userTimeInput.toLowerCase().trim();
  
  // First check if it's a timezone abbreviation
  if (TIMEZONE_ABBREVIATIONS[text]) {
    const tzInfo = TIMEZONE_ABBREVIATIONS[text];
    logger.info('Timezone detected from abbreviation', {
      input: userTimeInput,
      timezone: tzInfo.name,
      display: tzInfo.display,
    });
    
    return {
      timezone: tzInfo.name,
      offset: tzInfo.offset,
      display: tzInfo.display,
      abbreviation: tzInfo.abbreviation,
      needsConfirmation: true,
    };
  }
  
  // If not an abbreviation, try to parse as time
  const parsed = parseTimeInput(userTimeInput);
  if (!parsed) {
    return null;
  }
  
  // Get current UTC time
  const now = DateTime.utc();
  
  // Calculate offset
  const userHour = parsed.hours;
  const userMinute = parsed.minutes;
  const utcHour = now.hour;
  const utcMinute = now.minute;
  
  // Calculate offset in hours (accounting for day boundaries)
  let offsetHours = userHour - utcHour;
  
  // Handle day boundaries
  if (offsetHours > 12) offsetHours -= 24;
  if (offsetHours < -12) offsetHours += 24;
  
  // Find matching timezone
  const offsetKey = offsetHours.toString();
  const timezoneInfo = TIMEZONE_MAP[offsetKey];
  
  if (!timezoneInfo) {
    logger.warn('Timezone not found for offset', { offsetHours, userTimeInput });
    return {
      offset: offsetHours,
      needsConfirmation: true,
      display: `UTC${offsetHours >= 0 ? '+' : ''}${offsetHours}`,
      timezone: null,
    };
  }
  
  logger.info('Timezone detected', {
    userTime: `${userHour}:${userMinute.toString().padStart(2, '0')}`,
    utcTime: `${utcHour}:${utcMinute.toString().padStart(2, '0')}`,
    offset: offsetHours,
    timezone: timezoneInfo.name,
    display: timezoneInfo.display,
  });
  
  return {
    timezone: timezoneInfo.name,
    offset: offsetHours,
    display: timezoneInfo.display,
    abbreviation: timezoneInfo.abbreviation,
    needsConfirmation: true,
  };
}

/**
 * Convert user's local time to UTC
 * @param {string} dueDateString - ISO date string
 * @param {string} userTimezone - IANA timezone (e.g., "America/Chicago")
 * @returns {string} - UTC ISO string
 */
function convertToUTC(dueDateString, userTimezone) {
  if (!dueDateString || !userTimezone) {
    return dueDateString;
  }
  
  try {
    // Parse the date as if it's in the user's timezone
    const dt = DateTime.fromISO(dueDateString, { zone: userTimezone });
    
    // Convert to UTC
    const utc = dt.toUTC();
    
    logger.info('Timezone conversion', {
      input: dueDateString,
      userTimezone,
      userLocal: dt.toISO(),
      utc: utc.toISO(),
    });
    
    return utc.toISO();
  } catch (error) {
    logger.error('Timezone conversion error', {
      error: error.message,
      dueDateString,
      userTimezone,
    });
    return dueDateString;
  }
}

/**
 * Get or create user timezone settings
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} - Timezone settings or null
 */
async function getUserTimezone(userId) {
  const { initializeFirebase } = require('./firebase-utils');
  const db = initializeFirebase();
  
  try {
    const doc = await db.collection('user_settings').doc(userId).get();
    
    if (doc.exists) {
      const data = doc.data();
      return {
        timezone: data.timezone,
        offset: data.timezoneOffset,
        display: data.timezoneDisplay,
      };
    }
    
    return null;
  } catch (error) {
    logger.error('Failed to get user timezone', { error: error.message, userId });
    return null;
  }
}

/**
 * Save user timezone settings
 * @param {string} userId - User ID
 * @param {Object} timezoneInfo - Timezone information
 * @returns {Promise<boolean>} - Success status
 */
async function saveUserTimezone(userId, timezoneInfo) {
  const { initializeFirebase } = require('./firebase-utils');
  const admin = require('firebase-admin');
  const db = initializeFirebase();
  
  try {
    await db.collection('user_settings').doc(userId).set({
      userId: userId,
      timezone: timezoneInfo.timezone,
      timezoneOffset: timezoneInfo.offset,
      timezoneDisplay: timezoneInfo.display,
      timezoneAbbreviation: timezoneInfo.abbreviation || '',
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    
    logger.info('User timezone saved', {
      userId,
      timezone: timezoneInfo.timezone,
      offset: timezoneInfo.offset,
    });
    
    return true;
  } catch (error) {
    logger.error('Failed to save user timezone', {
      error: error.message,
      userId,
      timezoneInfo,
    });
    return false;
  }
}

module.exports = {
  parseTimeInput,
  detectTimezone,
  convertToUTC,
  getUserTimezone,
  saveUserTimezone,
  TIMEZONE_MAP,
};

