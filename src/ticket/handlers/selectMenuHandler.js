'use strict';

const { MessageFlags } = require('discord.js');
const { IDS } = require('../constants');
const ticketService = require('../services/ticketService');
const optionService = require('../services/optionService');
const { getSettings } = require('../config');
const { buildPanelComponents } = require('../component');
const { EPHEMERAL, NO_MENTIONS, safeReply, fail } = require('../utils/replies');
const { isValidSnowflake } = require('../utils/validation');
const { warn } = require('../../utils');

/** Re-renders the public panel so the chosen option does not stay highlighted. Best effort. */
async function resetPanelSelection(interaction) {
  try {
    const attachment = interaction.message.attachments.first();
    await interaction.message.edit({
      components: buildPanelComponents({
        options: optionService.getOptions(),
        settings: getSettings(),
        client: interaction.client,
        imageUrl: attachment ? `attachment://${attachment.name}` : null,
      }),
      flags: MessageFlags.IsComponentsV2,
    });
  } catch (e) {
    warn('ticket', `Panel reset skipped: ${e.message}`);
  }
}

async function handleCreate(interaction) {
  if (!interaction.inCachedGuild()) return safeReply(interaction, fail('Tickets can only be opened in a server.'));
  await interaction.deferReply({ flags: EPHEMERAL });
  resetPanelSelection(interaction); // fire and forget

  const result = await ticketService.createTicket({
    client: interaction.client,
    guild: interaction.guild,
    member: interaction.member,
    optionId: interaction.values[0],
  });
  await safeReply(interaction, result.ok ? `✅ ${result.message}` : `❌ ${result.message}`);
}

async function handleRemoveUserSelect(interaction) {
  const { requireTicketChannel } = require('../utils/guards');
  const ticket = await requireTicketChannel(interaction);
  if (!ticket) return;
  const targetId = interaction.values[0];
  if (!isValidSnowflake(targetId)) return safeReply(interaction, fail('Invalid selection.'));

  await interaction.deferUpdate();
  const result = await ticketService.removeUser({
    client: interaction.client,
    guild: interaction.guild,
    channel: interaction.channel,
    actor: interaction.member,
    targetId,
  });
  await interaction.editReply({ content: result.ok ? `✅ ${result.message}` : `❌ ${result.message}`, components: [], allowedMentions: NO_MENTIONS });
}

async function handle(interaction, parsed) {
  switch (parsed.base) {
    case IDS.CREATE: return handleCreate(interaction);
    case IDS.REMOVE_USER_SELECT: return handleRemoveUserSelect(interaction);
    default: return safeReply(interaction, fail('This menu is no longer valid.'));
  }
}

module.exports = { handle };
