/**
 * Firebase Functions entry point for Discord bot
 * This allows the bot to run as a Firebase Function in production
 */

const functions = require('firebase-functions');

// Use dynamic require to prevent Firebase Functions from analyzing during deployment
function loadBotModule() {
  // Use Function constructor to create a require that can't be statically analyzed
  const requireFunc = new Function('return require')();
  return requireFunc('./bot');
}

function loadOAuthApp() {
  const requireFunc = new Function('return require')();
  return requireFunc('./oauth-server');
}

// Export bot as a Firebase Function (keeps bot alive)
exports.discordBot = functions.runWith({
  timeoutSeconds: 540,
  memory: '512MB',
}).https.onRequest((req, res) => {
  try {
    const botModule = loadBotModule();
    if (!botModule) {
      return res.status(500).json({ error: 'Bot module not available' });
    }
    
    const { client, startBot } = botModule;
    
    if (startBot && typeof startBot === 'function') {
      try {
        startBot();
      } catch (startError) {
        console.error('Error starting bot');
      }
    }
    
    if (req.path === '/health') {
      return res.status(200).json({
        status: 'ok',
        bot: (client && client.user) ? client.user.tag : 'not ready',
        uptime: process.uptime(),
      });
    }
    
    res.status(200).send('Discord bot is running');
  } catch (error) {
    console.error('Error in discordBot function');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export OAuth server as a Firebase Function
exports.discordOAuth = functions.https.onRequest((req, res) => {
  try {
    const oauthApp = loadOAuthApp();
    if (!oauthApp) {
      return res.status(500).json({ error: 'OAuth app not available' });
    }
    
    try {
      const botModule = loadBotModule();
      if (botModule && botModule.startBot && typeof botModule.startBot === 'function') {
        botModule.startBot();
      }
    } catch (botError) {
      // Ignore bot errors in OAuth
    }
    
    return oauthApp(req, res);
  } catch (error) {
    console.error('Error in discordOAuth function');
    res.status(500).json({ error: 'Internal server error' });
  }
});

