'use strict';

const optionService = require('../services/optionService');
const { OptionError } = optionService;
const panelService = require('../services/panelService');
const { logAction } = require('../services/logService');
const { COLORS } = require('../constants');
const { isValidEmoji, validateImageRef } = require('./validation');
const { resolveLocalImagePath } = require('./media');
const { isCategory, missingBotPermissions } = require('./channelUtils');
const { NO_MENTIONS, safeReply, fail } = require('./replies');

/** Validates category/role/emoji/image inputs against the live guild. Returns { errors, warnings }. */
function checkGuildInputs(interaction, { category, role, emoji, image }) {
  const errors = [];
  const warnings = [];
  const guild = interaction.guild;

  if (category) {
    if (!isCategory(category)) errors.push('`category` must be a Discord category channel.');
    else {
      const full = guild.channels.cache.get(category.id);
      const missing = full ? missingBotPermissions(guild, full) : [];
      if (missing.length) warnings.push(`The bot is missing **${missing.join(', ')}** in that category — tickets cannot be created until this is fixed.`);
    }
  }
  if (role) {
    if (role.id === guild.id) errors.push('`@everyone` cannot be used as a staff role.');
    else if (role.managed) warnings.push('That role is managed by an integration; make sure real staff can actually receive it.');
  }
  if (emoji) {
    if (!isValidEmoji(emoji)) errors.push('`emoji` must be a single Unicode emoji or a custom emoji like `<:name:id>`.');
    else {
      const custom = /^<a?:\w+:(\d+)>$/.exec(emoji);
      if (custom && !interaction.client.emojis.cache.has(custom[1])) warnings.push('The bot cannot access that custom emoji, so it will be hidden in the menu.');
    }
  }
  if (image) {
    const err = validateImageRef(image);
    if (err) errors.push(`\`image\`: ${err}`);
    else if (!/^https?:\/\//i.test(image) && !resolveLocalImagePath(image)) errors.push('`image`: that file does not exist inside the `public/` folder.');
  }
  return { errors, warnings };
}

/** Runs a mutation, mapping OptionError to a friendly reply. Returns the result or null. */
async function runOptionMutation(interaction, fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof OptionError) {
      await safeReply(interaction, fail(e.message));
      return null;
    }
    throw e;
  }
}

async function afterConfigChange(interaction, { title, description, fields = [] }) {
  const refresh = await panelService.refreshPanel(interaction.client);
  await logAction(interaction.guild, { title: `⚙️ ${title}`, color: COLORS.PRIMARY, userId: interaction.user.id, description, fields });
  return panelService.describeRefresh(refresh);
}

module.exports = { checkGuildInputs, runOptionMutation, afterConfigChange, NO_MENTIONS };
