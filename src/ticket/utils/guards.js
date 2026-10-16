'use strict';

const { getSettings } = require('../config');
const { isOwner } = require('./permissions');
const { safeReply, fail } = require('./replies');
const ticketStore = require('../services/ticketStore');

/** Owner-role gate for configuration commands. Replies and returns false when denied. */
async function requireOwner(interaction) {
  if (!interaction.inCachedGuild()) {
    await safeReply(interaction, fail('This command can only be used in a server.'));
    return false;
  }
  if (isOwner(interaction.member, getSettings())) return true;
  const configured = Boolean(getSettings().ticket.ownerRoleId);
  await safeReply(interaction, fail(configured
    ? 'Only the ticket owner role can use this.'
    : 'No owner role is configured (`ticket.ownerRoleId` in settings.json), so only the server owner can use this.'));
  return false;
}

/** Ensures the interaction happened in a guild and inside an open ticket channel. */
async function requireTicketChannel(interaction) {
  if (!interaction.inCachedGuild() || !interaction.channel) {
    await safeReply(interaction, fail('This can only be used in a server ticket channel.'));
    return null;
  }
  const ticket = ticketStore.get(interaction.channelId);
  if (!ticket || ticket.guildId !== interaction.guildId) {
    await safeReply(interaction, fail('This channel is not a recognized ticket.'));
    return null;
  }
  if (ticket.status === 'closed') {
    await safeReply(interaction, fail('This ticket is already closed.'));
    return null;
  }
  return ticket;
}

module.exports = { requireOwner, requireTicketChannel };
