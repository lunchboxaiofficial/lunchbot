# Lunchbox Discord Bot

Automated credit verification and reward redemption bot for Lunchbox.

## Features

- 🔗 Account linking via email or OAuth
- 💰 Real-time credit balance checking
- 🎁 Reward redemption with automatic role assignment
- 📊 Transaction history tracking
- 👑 Admin commands for manual management
- 🔔 Welcome messages and notifications

## Prerequisites

1. **Discord Bot**: Create a bot in [Discord Developer Portal](https://discord.com/developers/applications)
   - Enable "Message Content Intent" under Bot settings
   - Copy the Bot Token

2. **Discord OAuth**: Configure OAuth2 in the same application
   - Add redirect URI: `http://localhost:3000/auth/discord/callback` (development)
   - Add redirect URI: `https://your-domain.com/auth/discord/callback` (production)
   - Copy Client ID and Client Secret

3. **Firebase Admin**: Generate a service account key
   - Go to Firebase Console > Project Settings > Service Accounts
   - Click "Generate New Private Key"
   - Save the JSON file securely

4. **Discord Server**: Invite the bot to your server
   - Go to OAuth2 > URL Generator
   - Select scopes: `bot`, `applications.commands`
   - Select permissions: `Administrator` (or specific permissions)
   - Use generated URL to invite bot

## Setup

### 1. Install Dependencies

```bash
cd discord-bot
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the `discord-bot` directory:

```bash
cp .env.example .env
```

Fill in the values:

```env
# Discord Bot Configuration
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_CLIENT_SECRET=your_client_secret_here
DISCORD_GUILD_ID=your_server_id_here
ADMIN_CHANNEL_ID=your_admin_channel_id_here

# OAuth Configuration
OAUTH_REDIRECT_URI=http://localhost:3001/auth/discord/callback
WEBSITE_URL=http://localhost:3000

# Firebase Configuration
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com

# Discord Role IDs (optional - for role rewards)
ROLE_BRONZE_ID=role_id_here
ROLE_SILVER_ID=role_id_here
ROLE_GOLD_ID=role_id_here
ROLE_PREMIUM_ID=role_id_here

# Environment
NODE_ENV=development
LOG_LEVEL=INFO
```

### 3. Run Locally

```bash
# From project root
npm run bot:dev

# Or from discord-bot directory
npm start
```

### 4. Deploy to Firebase Functions

```bash
# From project root
npm run bot:deploy
```

## Bot Commands

### User Commands

| Command | Description | Usage |
|---------|-------------|-------|
| `/link` | Link account via email | `/link email:your@email.com` |
| `/oauth` | Get OAuth link for secure linking | `/oauth` |
| `/credits` | Check credit balance | `/credits` |
| `/rewards` | Browse available rewards | `/rewards` |
| `/redeem` | Redeem a reward | `/redeem reward:bronze-badge` |
| `/history` | View transaction history | `/history` |
| `/unlink` | Unlink Discord account | `/unlink` |

### Admin Commands (Server Admins Only)

| Command | Description | Usage |
|---------|-------------|-------|
| `/admin-credits` | Manually adjust user credits | `/admin-credits user:@User amount:100 reason:Bonus` |
| `/admin-link` | Force link accounts | `/admin-link user:@User email:user@email.com` |
| `/admin-redemptions` | View recent redemptions | `/admin-redemptions limit:20` |
| `/admin-stats` | View server statistics | `/admin-stats` |

## Reward Catalog

Configure rewards in `discord-bot/rewards.js`:

### Discord Roles

- **Bronze Badge** (50 credits) - Basic tier role
- **Silver Badge** (200 credits) - Silver tier + priority support
- **Gold Badge** (500 credits) - Gold tier + beta access
- **Premium** (1000 credits) - Premium tier + all perks

### In-App Themes

- **Dark Theme** (100 credits) - Exclusive dark theme
- **Neon Theme** (100 credits) - Vibrant neon theme
- **Ocean Theme** (100 credits) - Calming ocean theme

To add new rewards, edit the `REWARDS` object in `rewards.js`.

## Architecture

```
discord-bot/
├── bot.js                 # Main bot logic and command handlers
├── firebase-utils.js      # Firebase Admin SDK operations
├── rewards.js            # Reward catalog and management
├── admin-commands.js     # Admin command handlers
├── notifications.js      # Discord notifications and embeds
├── logger.js             # Structured logging
├── oauth-server.js       # Express server for OAuth callback
├── index.js              # Firebase Functions entry point
└── package.json          # Dependencies and scripts
```

## Development

### Testing Locally

1. Start the Next.js dev server:
   ```bash
   npm run dev
   ```

2. Start the Discord bot:
   ```bash
   npm run bot:dev
   ```

3. Start the OAuth server (if running separately):
   ```bash
   cd discord-bot
   node oauth-server.js
   ```

### Testing Commands

1. Link your account: `/link email:your@email.com`
2. Check balance: `/credits`
3. Browse rewards: `/rewards`
4. Redeem reward: `/redeem reward:bronze-badge`

### Debugging

Enable debug logging:

```env
LOG_LEVEL=DEBUG
```

Check logs:
- Local: Terminal output
- Firebase: Firebase Console > Functions > Logs

## Deployment

### Firebase Functions

```bash
# Deploy bot and OAuth server
npm run bot:deploy

# Deploy Firestore rules
firebase deploy --only firestore:rules
```

### Environment Variables in Firebase

Set production environment variables:

```bash
firebase functions:config:set \
  discord.bot_token="YOUR_BOT_TOKEN" \
  discord.client_id="YOUR_CLIENT_ID" \
  discord.client_secret="YOUR_CLIENT_SECRET" \
  discord.guild_id="YOUR_GUILD_ID" \
  admin.channel_id="YOUR_ADMIN_CHANNEL_ID"
```

## Troubleshooting

### Bot Not Responding

1. Check bot token is correct
2. Verify bot has necessary permissions
3. Check bot is online in Discord server
4. Review logs for errors

### OAuth Flow Not Working

1. Verify redirect URIs match in Discord Developer Portal
2. Check OAuth server is running (port 3001)
3. Ensure website URL is correct in .env

### Firebase Permission Errors

1. Verify service account key is correct
2. Check Firestore rules allow bot access
3. Ensure collections exist in Firebase

### Role Assignment Failing

1. Verify role IDs in .env match Discord roles
2. Check bot has "Manage Roles" permission
3. Ensure bot role is higher than reward roles

## Security

- Never commit `.env` file or service account keys
- Use environment variables for all sensitive data
- Restrict admin commands to server administrators
- Regularly rotate Discord bot token
- Use Firebase security rules to protect data

## Support

For issues or questions:
1. Check bot logs for errors
2. Review Firebase Console for issues
3. Test commands in a test server first
4. Contact dev team in Lunchbox Discord

## License

MIT

