const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { addCredits, getDiscordLink, linkDiscordAccount, getAllRedemptions, getServerStats, getUserByEmail } = require('./firebase-utils');
const logger = require('./logger');
const { checkAdminPermission, isSuperAdmin } = require('./natural-language-processor');

const adminCommands = [
  // Admin: Manually adjust user credits
  new SlashCommandBuilder()
    .setName('admin-credits')
    .setDescription('(Admin) Manually adjust user credits')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Discord user to adjust credits for')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Amount of credits to add (use negative to deduct)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for adjustment')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // Admin: Force link accounts
  new SlashCommandBuilder()
    .setName('admin-link')
    .setDescription('(Admin) Force link Discord account to email')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Discord user to link')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('email')
        .setDescription('Email address to link to')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // Admin: View recent redemptions
  new SlashCommandBuilder()
    .setName('admin-redemptions')
    .setDescription('(Admin) View recent redemptions')
    .addIntegerOption(option =>
      option.setName('limit')
        .setDescription('Number of redemptions to show (default: 10)')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // Admin: Server statistics
  new SlashCommandBuilder()
    .setName('admin-stats')
    .setDescription('(Admin) View server-wide credit statistics')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

async function handleAdminCredits(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  // Check admin permissions
  const permissionCheck = await checkAdminPermission(interaction.user.id, interaction.user.username, 'admin-credits');
  if (!permissionCheck.allowed) {
    return await interaction.editReply({
      content: `❌ ${permissionCheck.reason || 'You do not have permission to use this command.'}`
    });
  }
  
  try {
    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const reason = interaction.options.getString('reason');
    
    // Get Discord link
    const link = await getDiscordLink(targetUser.id);
    
    if (!link) {
      return await interaction.editReply('❌ This user has not linked their account.');
    }
    
    // Add/deduct credits
    const newBalance = await addCredits(link.uid, amount, reason, {
      adminId: interaction.user.id,
      adminUsername: interaction.user.username,
    });
    
    logger.info('Admin adjusted credits', {
      adminId: interaction.user.id,
      targetUserId: targetUser.id,
      amount,
      reason,
    });
    
    const embed = new EmbedBuilder()
      .setColor(amount > 0 ? 0x00FF00 : 0xFF6347)
      .setTitle('✅ Credits Adjusted')
      .addFields(
        { name: 'User', value: `<@${targetUser.id}>`, inline: true },
        { name: 'Amount', value: `${amount > 0 ? '+' : ''}${amount}`, inline: true },
        { name: 'New Balance', value: `${newBalance}`, inline: true },
        { name: 'Reason', value: reason, inline: false }
      )
      .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Admin credits command failed', { error: error.message });
    await interaction.editReply('❌ Failed to adjust credits: ' + error.message);
  }
}

async function handleAdminLink(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  // Check admin permissions
  const permissionCheck = await checkAdminPermission(interaction.user.id, interaction.user.username, 'admin-link');
  if (!permissionCheck.allowed) {
    return await interaction.editReply({
      content: `❌ ${permissionCheck.reason || 'You do not have permission to use this command.'}`
    });
  }
  
  try {
    const targetUser = interaction.options.getUser('user');
    const email = interaction.options.getString('email');
    
    // Get Firebase user by email
    const firebaseUser = await getUserByEmail(email);
    
    if (!firebaseUser) {
      return await interaction.editReply('❌ No Firebase user found with that email.');
    }
    
    // Link accounts
    await linkDiscordAccount(
      targetUser.id,
      email,
      firebaseUser.uid,
      targetUser.username,
      'admin'
    );
    
    logger.info('Admin linked accounts', {
      adminId: interaction.user.id,
      discordId: targetUser.id,
      email,
    });
    
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ Accounts Linked')
      .addFields(
        { name: 'Discord User', value: `<@${targetUser.id}>`, inline: true },
        { name: 'Email', value: email, inline: true },
        { name: 'Link Method', value: 'Admin', inline: true }
      )
      .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Admin link command failed', { error: error.message });
    await interaction.editReply('❌ Failed to link accounts: ' + error.message);
  }
}

async function handleAdminRedemptions(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  // Check admin permissions
  const permissionCheck = await checkAdminPermission(interaction.user.id, interaction.user.username, 'admin-redemptions');
  if (!permissionCheck.allowed) {
    return await interaction.editReply({
      content: `❌ ${permissionCheck.reason || 'You do not have permission to use this command.'}`
    });
  }
  
  try {
    const limit = interaction.options.getInteger('limit') || 10;
    const redemptions = await getAllRedemptions(limit);
    
    if (redemptions.length === 0) {
      return await interaction.editReply('No redemptions found.');
    }
    
    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('📊 Recent Redemptions')
      .setDescription(`Showing last ${redemptions.length} redemptions`);
    
    redemptions.forEach((redemption, index) => {
      const timestamp = redemption.redeemedAt?.toDate 
        ? `<t:${Math.floor(redemption.redeemedAt.toDate().getTime() / 1000)}:R>`
        : 'Unknown';
      
      embed.addFields({
        name: `${index + 1}. ${redemption.rewardId}`,
        value: `User: <@${redemption.discordId}>\nCost: ${redemption.credits} credits\nTime: ${timestamp}`,
        inline: false,
      });
    });
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Admin redemptions command failed', { error: error.message });
    await interaction.editReply('❌ Failed to fetch redemptions: ' + error.message);
  }
}

async function handleAdminStats(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  // Check admin permissions
  const permissionCheck = await checkAdminPermission(interaction.user.id, interaction.user.username, 'admin-stats');
  if (!permissionCheck.allowed) {
    return await interaction.editReply({
      content: `❌ ${permissionCheck.reason || 'You do not have permission to use this command.'}`
    });
  }
  
  try {
    const stats = await getServerStats();
    
    const embed = new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle('📈 Server Statistics')
      .addFields(
        { name: '👥 Linked Accounts', value: stats.totalLinkedAccounts.toString(), inline: true },
        { name: '🎁 Total Redemptions', value: stats.totalRedemptions.toString(), inline: true }
      )
      .setFooter({ text: 'Lunchbox Discord Bot' })
      .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Admin stats command failed', { error: error.message });
    await interaction.editReply('❌ Failed to fetch stats: ' + error.message);
  }
}

module.exports = {
  adminCommands,
  handleAdminCredits,
  handleAdminLink,
  handleAdminRedemptions,
  handleAdminStats,
};

