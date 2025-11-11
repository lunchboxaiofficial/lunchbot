# Railway Deployment Guide

This Discord bot is ready to deploy on Railway with minimal changes.

## Quick Deploy

1. **Connect to Railway:**
   - Go to [railway.app](https://railway.app)
   - Create a new project
   - Click "New" → "GitHub Repo" (or "Empty Project")

2. **Add the Discord Bot Service:**
   - If using GitHub: Select your repository and set the root directory to `discord-bot`
   - If using Empty Project: Add the `discord-bot` folder as the source

3. **Set Environment Variables:**
   Railway will automatically detect this is a Node.js project. Add these environment variables in Railway's dashboard:

   **Required:**
   - `DISCORD_BOT_TOKEN` - Your Discord bot token
   - `DISCORD_CLIENT_ID` - Your Discord application client ID
   - `WEBSITE_URL` - Your Firebase website URL (e.g., `https://your-app.web.app`)

   **Firebase Admin (for Firestore access):**
   - `FIREBASE_PROJECT_ID` - Your Firebase project ID
   - `FIREBASE_PRIVATE_KEY` - Your Firebase service account private key
   - `FIREBASE_CLIENT_EMAIL` - Your Firebase service account client email
   
   **Optional:**
   - `DISCORD_GUILD_ID` - Your Discord server ID (for guild-specific commands)
   - `OAUTH_PORT` - Port for OAuth server (default: 3001)
   - `ADMIN_CHANNEL_ID` - Discord channel ID for admin notifications
   - `ROLE_BRONZE_ID`, `ROLE_SILVER_ID`, etc. - Discord role IDs for rewards
   - `LOG_LEVEL` - Logging level (default: INFO)

4. **Deploy:**
   - Railway will automatically build and deploy
   - The bot will start automatically (it detects it's not in Firebase Functions)
   - Check the logs to confirm the bot is online

## How It Works

- **Auto-detection:** Railway detects this is a Node.js project
- **Start command:** Runs `npm start` which executes `node bot.js`
- **Auto-start:** The bot automatically starts because it's not in a Firebase Functions environment
- **OAuth server:** The Express OAuth server also starts automatically on the configured port

## Notes

- The bot will automatically load environment variables from Railway
- No `.env` file needed (Railway handles environment variables)
- The OAuth server runs on the port specified by `OAUTH_PORT` (or 3001 by default)
- Make sure your Firebase website URL is set correctly for OAuth redirects

## Troubleshooting

- **Bot not starting:** Check Railway logs for errors
- **Missing environment variables:** Verify all required variables are set in Railway
- **OAuth not working:** Ensure `WEBSITE_URL` is set correctly and matches your Firebase hosting URL

