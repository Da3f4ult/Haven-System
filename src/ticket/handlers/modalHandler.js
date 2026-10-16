'use strict';

const { IDS } = require('../constants');
const ticketService = require('../services/ticketService');
const { requireTicketChannel } = require('../utils/guards');
const { EPHEMERAL, safeReply, fail } = require('../utils/replies');

/** Accepts a raw ID or a <@mention>; returns the digits or null. */
function parseUserId(input) {
  const value = String(input ?? '').trim();
  const m = /^<@!?(\d{17,20})>$/.exec(value) ?? /^(\d{17,20})$/.exec(value);
  return m ? m[1] : null;
}

async function handleAddUser(interaction) {
  const ticket = await requireTicketChannel(interaction);
  if (!ticket) return;
  await interaction.deferReply({ flags: EPHEMERAL });
  const targetId = parseUserId(interaction.fields.getTextInputValue(IDS.ADD_USER_INPUT));
  if (!targetId) return safeReply(interaction, fail('Please enter a valid Discord user ID (17–20 digits).'));

  const result = await ticketService.addUser({ guild: interaction.guild, channel: interaction.channel, actor: interaction.member, targetId });
  await safeReply(interaction, result.ok ? `✅ ${result.message}` : `❌ ${result.message}`);
}

async function handle(interaction, parsed) {
  if (parsed.base === IDS.ADD_USER_MODAL) return handleAddUser(interaction);
  return safeReply(interaction, fail('This form is no longer valid.'));
}

module.exports = { handle, parseUserId };
