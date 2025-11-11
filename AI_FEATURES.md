# 🤖 Lunchbox AI Discord Bot Features

## Overview
The Lunchbox Discord bot now includes powerful AI conversation capabilities powered by your multi-provider AI system. Users can chat with the AI in DMs or create dedicated conversation threads in servers.

---

## 🎯 Features

### 1. **DM Conversations** 💬
Chat with the AI directly in DMs - just send any message to the bot!

**How it works:**
- Send any message to the Lunchbox bot in a DM
- The bot will respond using AI
- Conversation history is maintained (last 20 messages)
- No commands needed - just chat naturally!

**Examples:**
```
User: hello!
Bot: Hey there! 👋 How can I help you today?

User: what's up?
Bot: Just here to help! I can assist with tasks, answer questions, or just chat!
```

---

### 2. **/converse Command** 🧵
Start an AI conversation thread in a Discord server

**Command:**
```
/converse message:<your message> visibility:<private|public>
```

**Options:**
- `message` (required): Your first message to the AI
- `visibility` (optional): 
  - `private` (default): Only you can see the conversation
  - `public`: Everyone in the server can see

**What happens:**
1. Creates a dedicated thread for your conversation
2. Thread name: `🤖 AI Chat with [username] (Private/Public)`
3. Sends welcome message explaining features
4. Posts your initial message
5. AI responds immediately
6. Continue chatting by typing in the thread

**Example Usage:**
```
/converse message:create a task to go grocery shopping visibility:private
```

---

### 3. **Task Management** ✅
If your Discord account is linked to Lunchbox, the AI can manage your tasks!

**What you can do:**
- **Create tasks**: "create a task to call mom tomorrow at 5pm"
- **Complete tasks**: "complete the task call mom"
- **Delete tasks**: "delete the task grocery shopping"
- **Update tasks**: "change due date of soccer task to next Monday"

**Task Features:**
- Natural language date/time parsing
- Auto-tagging based on content
- Star important tasks
- Set due dates and descriptions
- All tasks sync with your Lunchbox dashboard

**Example Conversation:**
```
User: create a task to finish report tomorrow at 3pm
AI: ✅ Task Created!
    Task: Finish report
    Due: Tomorrow, Nov 6, 2025 at 3:00 PM
    Tags: work

User: complete the task finish report
AI: ✅ Task Completed!
    Great job finishing your report!
```

---

### 4. **Account Linking** 🔗
Link your Discord to Lunchbox for full task management

**Commands:**
- `/link email:<your-email>` - Link using email verification
- `/oauth` - Get secure OAuth link

**Benefits of linking:**
- Create and manage tasks from Discord
- Sync with your Lunchbox dashboard
- Access all productivity features
- Earn and spend credits

**Account Status:**
- Unlinked: Can chat with AI, but no task management
- Linked: Full access to task features and credits

---

## 📝 Example Conversations

### General Chat
```
User: hey, how are you?
AI: I'm doing great! Ready to help you stay productive. What's on your mind?

User: tell me a joke
AI: Why did the developer quit their job? Because they didn't get arrays! 😄
```

### Task Creation (Linked Account)
```
User: remind me to call john tomorrow at 2pm
AI: ✅ Task Created!
    • Call John
    Due: Tomorrow at 2:00 PM
    Tags: personal

User: also create a task to submit report by Friday
AI: ✅ Task Created!
    • Submit report
    Due: Friday, Nov 8, 2025 at 10:00 AM
    Tags: work
```

### Productivity Help
```
User: how can I organize my tasks better?
AI: Here are some tips for better task organization:

1. **Use Tags** - Categorize by project, priority, or type
2. **Set Due Dates** - Always add deadlines for accountability
3. **Star Important Tasks** - Highlight urgent or high-priority items
4. **Use Kanban View** - Visualize your workflow with custom columns
5. **Review Daily** - Check your tasks each morning

Would you like me to create a task to remind you to review your tasks daily?
```

---

## 🔧 Technical Details

### Conversation History
- Stores last 20 messages per user
- Automatically cleared when thread archives
- Separate history for DMs vs. threads
- Context maintained across messages

### AI Capabilities
- Multi-provider support (automatic failover)
- Natural language understanding
- Task action detection
- Date/time parsing
- Smart tagging suggestions

### Thread Management
- Auto-archives after 1 hour of inactivity
- Can reopen archived threads
- Public/private visibility control
- Clear thread naming convention

---

## 💡 Tips & Best Practices

### For Users:
1. **Be Natural** - Chat like you would with a human
2. **Be Specific** - Include dates/times for tasks
3. **Link Your Account** - Get full task management features
4. **Use Threads** - Keep conversations organized
5. **Choose Visibility** - Private for personal tasks, public for team discussions

### For Admins:
1. Set up proper channel permissions for threads
2. Monitor AI usage in server logs
3. Encourage users to link accounts
4. Create dedicated channels for AI conversations

---

## 🐛 Troubleshooting

### AI Not Responding
- Check bot is online (`/credits` to test)
- Verify you're in a DM or AI thread
- Check bot has message permissions

### Tasks Not Creating
- Verify Discord account is linked (`/credits`)
- Check account has proper Firestore permissions
- Try relinking with `/oauth`

### Thread Not Creating
- Bot needs "Create Threads" permission
- Try in a different channel
- Check bot role hierarchy

---

## 📊 Available Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/converse` | Start AI thread | `/converse message:hello visibility:private` |
| `/link` | Link Discord account | `/link email:user@example.com` |
| `/oauth` | Get OAuth link | `/oauth` |
| `/credits` | Check credit balance | `/credits` |
| `/rewards` | View available rewards | `/rewards` |
| `/redeem` | Redeem a reward | `/redeem reward:neon-theme` |
| `/refund` | Refund a reward | `/refund reward:neon-theme` |
| `/unlink` | Unlink account | `/unlink` |
| `/history` | View transaction history | `/history` |

---

## 🚀 Future Enhancements

Coming soon:
- Voice message support
- Image analysis in conversations
- Multi-user collaborative threads
- Custom AI personalities
- Advanced task filters and queries
- Integration with more Lunchbox features

---

**Powered by Lunchbox AI** 🎯
Version: 1.0.0 | Last Updated: Nov 5, 2025

