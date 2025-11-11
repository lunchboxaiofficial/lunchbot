# Discord Bot Commands Quick Reference

## 👤 User Commands

### `/link <email>`
Link your Discord account to your Lunchbox account using email.

**Example:**
```
/link email:john@example.com
```

**Requirements:**
- Email must match your Lunchbox account
- Cannot be already linked to another Discord account

---

### `/oauth`
Get a secure OAuth link to link your account.

**Example:**
```
/oauth
```

**Benefits:**
- More secure than email linking
- No password sharing
- Automatic verification

---

### `/credits`
Check your current credit balance, streak, and multiplier.

**Example:**
```
/credits
```

**Shows:**
- Total credits
- Daily streak (🔥)
- Bonus multiplier

---

### `/rewards`
Browse all available rewards and see what you can afford.

**Example:**
```
/rewards
```

**Shows:**
- ✅ Affordable rewards (green check)
- 🔒 Locked rewards (need more credits)
- Cost and description for each reward

---

### `/redeem <reward>`
Redeem a reward using your credits.

**Example:**
```
/redeem reward:bronze-badge
```

**Available Rewards:**
- `bronze-badge` - 50 credits
- `silver-badge` - 200 credits
- `gold-badge` - 500 credits
- `premium` - 1000 credits
- `dark-theme` - 100 credits
- `neon-theme` - 100 credits
- `ocean-theme` - 100 credits

**What happens:**
1. Credits are deducted
2. Discord role is assigned (if applicable)
3. Theme is unlocked in app (for themes)
4. Transaction is logged
5. Admins are notified

---

### `/history`
View your recent credit transactions.

**Example:**
```
/history
```

**Shows:**
- Last 10 transactions
- Earned vs spent credits
- Reason for each transaction
- Timestamps

---

### `/unlink`
Unlink your Discord account from Lunchbox.

**Example:**
```
/unlink
```

**Warning:** You'll need to link again to redeem rewards!

---

## 👑 Admin Commands

*(Administrator permission required)*

### `/admin-credits <user> <amount> <reason>`
Manually add or remove credits for a user.

**Examples:**
```
/admin-credits user:@John amount:100 reason:Bonus for bug report
/admin-credits user:@Jane amount:-50 reason:Credit adjustment
```

**Use for:**
- Compensating users
- Bonus rewards
- Manual adjustments

---

### `/admin-link <user> <email>`
Force link a Discord account to an email.

**Example:**
```
/admin-link user:@John email:john@example.com
```

**Use when:**
- User can't link normally
- Troubleshooting link issues
- Emergency linking

---

### `/admin-redemptions [limit]`
View recent reward redemptions.

**Examples:**
```
/admin-redemptions
/admin-redemptions limit:20
```

**Shows:**
- User who redeemed
- Reward redeemed
- Cost
- Timestamp

---

### `/admin-stats`
View server-wide statistics.

**Example:**
```
/admin-stats
```

**Shows:**
- Total linked accounts
- Total redemptions
- Other metrics

---

## 💡 Tips

### Earning Credits
- Complete daily routines in Lunchbox
- Maintain your streak for bonus multipliers
- Claim daily rewards
- Complete special tasks

### Before Redeeming
1. Check your balance: `/credits`
2. Browse rewards: `/rewards`
3. Choose what you can afford
4. Redeem: `/redeem`

### If Commands Don't Work
1. Make sure bot is online
2. Wait a few minutes for command sync
3. Try restarting Discord
4. Check bot has proper permissions
5. Contact admin if issue persists

### Best Practices
- Link your account early to start earning
- Check `/history` to track your spending
- Save up for premium rewards
- Use `/rewards` to plan your redemptions

---

## 🆘 Need Help?

**Bot not responding?**
- Check if bot is online (green status)
- Verify you're using slash commands (`/`)
- Try in a different channel

**Link failed?**
- Confirm email is correct
- Make sure you have a Lunchbox account
- Try using `/oauth` instead

**Missing credits?**
- Check `/history` for transactions
- Verify routines were completed
- Contact admin for investigation

**Role not assigned?**
- Wait a few seconds and check roles
- Reopen Discord (role cache)
- Contact admin if still missing

---

## 📊 Reward Tiers

### 🥉 Bronze (50 credits)
Entry-level tier with basic perks

### 🥈 Silver (200 credits)
Mid-tier with priority support

### 🥇 Gold (500 credits)
High-tier with beta access

### 💎 Premium (1000 credits)
Ultimate tier with all perks

### 🎨 Themes (100 credits each)
Customize your Lunchbox experience

---

*For detailed setup and troubleshooting, see [Discord Bot Setup Guide](../DISCORD_BOT_SETUP.md)*

