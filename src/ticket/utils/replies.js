'use strict';

const { MessageFlags } = require('discord.js');
const { warn } = require('../../utils');

const EPHEMERAL = MessageFlags.Ephemeral;
const NO_MENTIONS = { parse: [] };

const ok = (msg) => `✅ ${msg}`;
const fail = (msg) => `❌ ${msg}`;
const info = (msg) => `ℹ️ ${msg}`;

/**
 * Replies ephemerally no matter what state the interaction is in. Never throws.
 */
async function safeReply(interaction, content, extra = {}) {
  try {
    if (interaction.deferred) {
      return await interaction.editReply({ content, components: [], allowedMentions: NO_MENTIONS, ...extra });
    }
    if (interaction.replied) {
      return await interaction.followUp({ content, flags: EPHEMERAL, allowedMentions: NO_MENTIONS, ...extra });
    }
    return await interaction.reply({ content, flags: EPHEMERAL, allowedMentions: NO_MENTIONS, ...extra });
  } catch (e) {
    warn('ticket', `Could not reply to interaction: ${e.message}`);
    return null;
  }
}

module.exports = { EPHEMERAL, NO_MENTIONS, ok, fail, info, safeReply };
