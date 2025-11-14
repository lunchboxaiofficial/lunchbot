# Discord Bot Push Commands (Slash Commands)

## What are Push Commands?

**Push Commands** (also called **Slash Commands**) are Discord's way of registering commands that users can type with a `/` prefix. When a bot starts, it "pushes" (registers) these commands to Discord's API so they appear in Discord's command autocomplete.

## How It Works

1. **Command Definition**: Commands are defined in `bot.js` as an array of command objects
2. **Registration**: On bot startup, commands are registered using Discord's REST API
3. **User Interaction**: Users type `/command-name` in Discord
4. **Handling**: The bot receives the interaction and executes the corresponding handler

## Registration Process

The bot registers commands in two ways:

### 1. Global Commands (User Commands)
```javascript
await rest.put(
  Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
  { body: commands }
);
```
- Available in **all servers** where the bot is present
- Takes up to **1 hour** to propagate globally
- Examples: `/link`, `/credits`, `/rewards`

### 2. Guild Commands (Admin Commands)
```javascript
await rest.put(
  Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
  { body: adminCommands }
);
```
- Available **only in your specific server** (guild)
- Updates **instantly** (no propagation delay)
- Examples: `/admin-credits`, `/admin-link`

## Command Structure

Each command is defined with:
```javascript
{
  name: 'command-name',           // What users type: /command-name
  description: 'What it does',    // Shown in Discord's help
  options: [                       // Optional parameters
    {
      name: 'option-name',
      description: 'Option description',
      type: ApplicationCommandOptionType.String, // or Number, Boolean, etc.
      required: true
    }
  ]
}
```

## Current Commands

### User Commands (Global)
- `/link` - Link Discord account to Lunchbox
- `/oauth` - Get OAuth link
- `/credits` - Check credit balance
- `/rewards` - Browse available rewards
- `/redeem` - Redeem a reward
- `/history` - View transaction history
- `/unlink` - Unlink Discord account
- `/refund` - Refund a redeemed reward
- `/converse` - Chat with AI
- `/timezone` - Set timezone
- `/task-notify` - Configure task notifications
- `/tasks` - View your tasks
- `/task-create` - Create a new task
- `/stats` - View your statistics
- `/notifications` - Manage notifications
- `/routines` - Manage routines
- `/search` - Search tasks
- `/calendar` - View calendar
- `/achievements` - View achievements

### Admin Commands (Guild Only)
- `/admin-credits` - Manually adjust credits
- `/admin-link` - Force link account
- `/admin-redemptions` - View recent redemptions
- `/admin-stats` - View server statistics

## Troubleshooting

### Commands Not Appearing

1. **Wait for propagation**: Global commands can take up to 1 hour
2. **Restart Discord**: Close and reopen Discord app
3. **Check bot permissions**: Bot needs `applications.commands` scope
4. **Verify registration**: Check bot logs for "Successfully registered slash commands"

### Commands Not Working

1. **Check bot is online**: Bot must be running and connected
2. **Verify handler exists**: Command name must match handler in `interactionCreate` event
3. **Check permissions**: Some commands require specific permissions
4. **Review logs**: Check `bot.log` for error messages

### Updating Commands

When you add/modify commands:

1. **Update command definition** in `bot.js`
2. **Add handler** in `interactionCreate` event
3. **Restart bot** - commands will re-register automatically
4. **Wait for propagation** (global commands only)

## Code Location

- **Command Definitions**: `discord-bot/bot.js` (lines 60-405)
- **Registration**: `discord-bot/bot.js` (lines 406-494)
- **Handlers**: `discord-bot/bot.js` (lines 496-700+)
- **Admin Commands**: `discord-bot/admin-commands.js`

## Best Practices

1. **Use descriptive names**: `task-create` not `tc`
2. **Provide clear descriptions**: Help users understand what commands do
3. **Handle errors gracefully**: Always catch and respond to errors
4. **Use ephemeral replies**: For sensitive info (like `/history`)
5. **Validate inputs**: Check user permissions and input validity
6. **Log commands**: Track command usage for debugging

## Testing Commands

1. **Local testing**: Use guild commands for instant updates
2. **Global testing**: Deploy and wait for propagation
3. **Use Discord's test mode**: Create a test server for safe testing

## Related Files

- `COMMANDS.md` - User-facing command documentation
- `bot.js` - Main bot file with command registration
- `admin-commands.js` - Admin command handlers

