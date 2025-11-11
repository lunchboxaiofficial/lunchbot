/**
 * AI Integration for Discord Bot
 * This uses the multi-provider AI system
 */

const axios = require('axios');
const logger = require('./logger');

// Base URL for your Next.js API
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:9002';

/**
 * Call the AI chat API
 */
async function callAI(history, taskContext = null) {
  try {
    logger.info('Calling AI API', {
      url: `${API_BASE_URL}/api/ai/chat`,
      messageCount: history.length,
      hasTaskContext: !!taskContext
    });

    const requestBody = {
      messages: history,
      activeTab: 'message',
      advancedAI: false
    };
    
    // Add task context if provided
    if (taskContext) {
      requestBody.taskContext = taskContext;
    }

    const response = await axios.post(`${API_BASE_URL}/api/ai/chat`, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });
    
    logger.info('AI API response received', {
      success: response.data?.success,
      responseCount: response.data?.responses?.length
    });
    
    if (response.data && response.data.responses) {
      return response.data.responses;
    }
    
    throw new Error('Invalid response from AI API');
  } catch (error) {
    logger.error('AI API call failed', {
      error: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: `${API_BASE_URL}/api/ai/chat`,
      code: error.code
    });
    
    // Provide more helpful error message
    if (error.code === 'ECONNREFUSED') {
      throw new Error(`Cannot connect to Lunchbox AI server at ${API_BASE_URL}. Make sure your Next.js app is running!`);
    } else if (error.response?.status === 404) {
      throw new Error('AI API endpoint not found. Check your Next.js server.');
    } else if (error.response?.data?.error) {
      throw new Error(`AI Error: ${error.response.data.error}`);
    }
    
    throw error;
  }
}

module.exports = {
  callAI
};

