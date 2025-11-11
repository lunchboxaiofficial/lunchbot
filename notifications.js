const { EmbedBuilder } = require('discord.js');
const logger = require('./logger');

/**
 * Send redemption alert to admin channel
 */
async function sendRedemptionAlert(client, data) {
  const adminChannelId = process.env.ADMIN_CHANNEL_ID;
  
  if (!adminChannelId) {
    logger.warn('Admin channel ID not configured, skipping redemption alert');
    return;
  }
  
  try {
    const channel = await client.channels.fetch(adminChannelId);
    
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('🎉 New Reward Redemption')
      .addFields(
        { name: 'User', value: `<@${data.discordId}>`, inline: true },
        { name: 'Reward', value: data.rewardName, inline: true },
        { name: 'Cost', value: `${data.credits} credits`, inline: true },
        { name: 'Reward Type', value: data.rewardType, inline: true },
        { name: 'Delivery', value: data.deliveryMethod, inline: true },
        { name: 'Status', value: '✅ Completed', inline: true }
      )
      .setTimestamp();
    
    await channel.send({ embeds: [embed] });
    
    logger.info('Redemption alert sent', { discordId: data.discordId, reward: data.rewardId });
  } catch (error) {
    logger.error('Failed to send redemption alert', { error: error.message });
  }
}

/**
 * Send welcome message to user after account link
 */
async function sendWelcomeMessage(user, email) {
  try {
    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('🎉 Account Linked Successfully!')
      .setDescription(`Your Discord account has been linked to **${email}**`)
      .addFields(
        { name: '✅ What\'s Next?', value: 'Use `/credits` to check your balance\nUse `/rewards` to see available rewards\nUse `/redeem` to claim rewards' },
        { name: '💡 Earn Credits', value: 'Complete daily routines in Lunchbox\nMaintain your streak for bonus credits\nClaim daily rewards' }
      )
      .setFooter({ text: 'Welcome to Lunchbox Rewards!' })
      .setTimestamp();
    
    await user.send({ embeds: [embed] });
    
    logger.info('Welcome message sent', { userId: user.id, username: user.username });
  } catch (error) {
    logger.warn('Failed to send welcome message (user may have DMs disabled)', { 
      userId: user.id, 
      error: error.message 
    });
  }
}

/**
 * Send credit milestone notification
 */
async function sendCreditsAlert(user, amount, milestone) {
  try {
    let title = '🎊 Credits Earned!';
    let description = `You've earned **${amount} credits**!`;
    let color = 0xFFD700;
    
    if (milestone === 'first_reward') {
      title = '🌟 First Reward!';
      description = `Congratulations on earning your first ${amount} credits! Check out \`/rewards\` to see what you can redeem.`;
    } else if (milestone === 'streak_bonus') {
      title = '🔥 Streak Bonus!';
      description = `Amazing! Your streak earned you **${amount} bonus credits**! Keep it up!`;
      color = 0xFF6347;
    } else if (milestone === '1000_credits') {
      title = '💎 Major Milestone!';
      description = `You've reached **1000+ credits**! You can now unlock Premium rewards!`;
      color = 0x9B59B6;
    }
    
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description)
      .addFields(
        { name: 'View Balance', value: 'Use `/credits` to see your total', inline: true },
        { name: 'Browse Rewards', value: 'Use `/rewards` to explore', inline: true }
      )
      .setTimestamp();
    
    await user.send({ embeds: [embed] });
    
    logger.info('Credits alert sent', { userId: user.id, amount, milestone });
  } catch (error) {
    logger.warn('Failed to send credits alert', { userId: user.id, error: error.message });
  }
}

module.exports = {
  sendRedemptionAlert,
  sendWelcomeMessage,
  sendCreditsAlert,
};

