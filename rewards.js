/**
 * Reward catalog with Discord roles and themes
 */

const REWARDS = {
  'bronze-badge': {
    id: 'bronze-badge',
    name: '🥉 Bronze Badge',
    description: 'Bronze tier Discord role',
    cost: 500,
    type: 'role',
    roleId: null, // Set in .env as ROLE_BRONZE_ID
    deliveryMethod: 'discord',
  },
  'silver-badge': {
    id: 'silver-badge',
    name: '🥈 Silver Badge',
    description: 'Silver tier Discord role + priority support',
    cost: 1500,
    type: 'role',
    roleId: null, // Set in .env as ROLE_SILVER_ID
    deliveryMethod: 'discord',
  },
  'gold-badge': {
    id: 'gold-badge',
    name: '🥇 Gold Badge',
    description: 'Gold tier Discord role + beta access',
    cost: 2500,
    type: 'role',
    roleId: null, // Set in .env as ROLE_GOLD_ID
    deliveryMethod: 'discord',
  },
  'premium': {
    id: 'premium',
    name: '💎 Premium',
    description: 'Premium Discord role + all perks',
    cost: 5000,
    type: 'role',
    roleId: null, // Set in .env as ROLE_PREMIUM_ID
    deliveryMethod: 'discord',
  },
  'dark-premium': {
    id: 'dark-premium',
    name: '🌙 Better Dark Theme',
    description: 'Premium dark theme with stunning blue and purple accents',
    cost: 1200,
    type: 'theme',
    themeId: 'dark-premium',
    deliveryMethod: 'in-app',
  },
  'neon-theme': {
    id: 'neon-theme',
    name: '✨ Neon Theme',
    description: 'Vibrant cyberpunk neon theme with electric colors',
    cost: 2500,
    type: 'theme',
    themeId: 'neon',
    deliveryMethod: 'in-app',
  },
  'ocean-theme': {
    id: 'ocean-theme',
    name: '🌊 Ocean Theme',
    description: 'Calming ocean theme with deep blues and teals',
    cost: 4000,
    type: 'theme',
    themeId: 'ocean',
    deliveryMethod: 'in-app',
  },
  // High-value Discord-only button animation rewards (6000-10000 credits)
  'animation-bounce': {
    id: 'animation-bounce',
    name: '🎯 Bounce Animation',
    description: 'Unlock bounce animation for bottom navbar buttons - buttons bounce on hover and click',
    cost: 6000,
    type: 'animation',
    animationId: 'bounce',
    deliveryMethod: 'in-app',
    discordOnly: true,
  },
  'animation-pulse': {
    id: 'animation-pulse',
    name: '💫 Pulse Animation',
    description: 'Unlock pulse animation for bottom navbar buttons - buttons pulse with a glowing effect',
    cost: 8000,
    type: 'animation',
    animationId: 'pulse',
    deliveryMethod: 'in-app',
    discordOnly: true,
  },
  'animation-rotate': {
    id: 'animation-rotate',
    name: '🌀 Rotate Animation',
    description: 'Unlock rotate animation for bottom navbar buttons - buttons rotate on hover and click',
    cost: 10000,
    type: 'animation',
    animationId: 'rotate',
    deliveryMethod: 'in-app',
    discordOnly: true,
  },
};

/**
 * Initialize role IDs from environment variables
 */
function initializeRoleIds() {
  if (process.env.ROLE_BRONZE_ID) REWARDS['bronze-badge'].roleId = process.env.ROLE_BRONZE_ID;
  if (process.env.ROLE_SILVER_ID) REWARDS['silver-badge'].roleId = process.env.ROLE_SILVER_ID;
  if (process.env.ROLE_GOLD_ID) REWARDS['gold-badge'].roleId = process.env.ROLE_GOLD_ID;
  if (process.env.ROLE_PREMIUM_ID) REWARDS['premium'].roleId = process.env.ROLE_PREMIUM_ID;
  if (process.env.ROLE_PLATINUM_ID) REWARDS['platinum-badge'].roleId = process.env.ROLE_PLATINUM_ID;
  if (process.env.ROLE_DIAMOND_ID) REWARDS['diamond-badge'].roleId = process.env.ROLE_DIAMOND_ID;
  if (process.env.ROLE_LEGENDARY_ID) REWARDS['legendary-badge'].roleId = process.env.ROLE_LEGENDARY_ID;
}

/**
 * Get reward by ID
 */
function getReward(rewardId) {
  return REWARDS[rewardId] || null;
}

/**
 * Get all rewards
 */
function getAllRewards() {
  return Object.values(REWARDS);
}

/**
 * Get affordable rewards for a user
 */
function getUserAffordableRewards(userCredits) {
  return Object.values(REWARDS).filter(reward => reward.cost <= userCredits);
}

/**
 * Format rewards list for Discord embed
 */
function formatRewardsEmbed(userCredits) {
  const fields = [];
  
  const regularRoleRewards = Object.values(REWARDS).filter(r => r.type === 'role' && !r.discordOnly);
  const discordOnlyRewards = Object.values(REWARDS).filter(r => r.discordOnly);
  const themeRewards = Object.values(REWARDS).filter(r => r.type === 'theme');
  
  if (regularRoleRewards.length > 0) {
    fields.push({
      name: '🎭 Discord Roles',
      value: regularRoleRewards.map(reward => {
        const canAfford = userCredits >= reward.cost;
        const icon = canAfford ? '✅' : '🔒';
        return `${icon} **${reward.name}** - ${reward.cost} credits\n   ${reward.description}`;
      }).join('\n\n'),
      inline: false,
    });
  }
  
  const animationRewards = Object.values(REWARDS).filter(r => r.type === 'animation');
  const discordOnlyRoleRewards = Object.values(REWARDS).filter(r => r.discordOnly && r.type === 'role');
  
  if (animationRewards.length > 0) {
    fields.push({
      name: '🎬 Button Animations (Discord Only - 6,000-10,000 credits)',
      value: animationRewards.map(reward => {
        const canAfford = userCredits >= reward.cost;
        const icon = canAfford ? '✅' : '🔒';
        return `${icon} **${reward.name}** - ${reward.cost.toLocaleString()} credits\n   ${reward.description}\n   ⚠️ **Discord only!** Use \`/redeem ${reward.id}\` in Discord`;
      }).join('\n\n'),
      inline: false,
    });
  }
  
  if (discordOnlyRoleRewards.length > 0) {
    fields.push({
      name: '💎 Premium Discord Roles',
      value: discordOnlyRoleRewards.map(reward => {
        const canAfford = userCredits >= reward.cost;
        const icon = canAfford ? '✅' : '🔒';
        return `${icon} **${reward.name}** - ${reward.cost.toLocaleString()} credits\n   ${reward.description}\n   ⚠️ **Discord only!** Use \`/redeem ${reward.id}\` in Discord`;
      }).join('\n\n'),
      inline: false,
    });
  }
  
  if (themeRewards.length > 0) {
    fields.push({
      name: '🎨 Themes',
      value: themeRewards.map(reward => {
        const canAfford = userCredits >= reward.cost;
        const icon = canAfford ? '✅' : '🔒';
        return `${icon} **${reward.name}** - ${reward.cost} credits\n   ${reward.description}`;
      }).join('\n\n'),
      inline: false,
    });
  }
  
  return fields;
}

module.exports = {
  REWARDS,
  initializeRoleIds,
  getReward,
  getAllRewards,
  getUserAffordableRewards,
  formatRewardsEmbed,
};

