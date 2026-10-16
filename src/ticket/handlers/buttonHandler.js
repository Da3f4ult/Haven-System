'use strict';

const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { IDS } = require('../constants');
const ticketService = require('../services/ticketService');
const { getSettings } = require('../config');
const { canManageTicket, canCloseTicket, isOwner } = require('../utils/permissions');
const { requireTicketChannel, requireOwner } = require('../utils/guards');
const { EPHEMERAL, NO_MENTIONS, safeReply, fail } = require('../utils/replies');
const { closeConfirmRow, closeFailedRows, removeUserMenu, optionsPage } = require('./ui');

const mark = (r) => (r.ok ? `✅ ${r.message}` : `❌ ${r.message}`);

async function addUser(interaction) {
  const ticket = await requireTicketChannel(interaction);
  if (!ticket) return;
  if (!canManageTicket(interaction.member, ticket, getSettings())) return safeReply(interaction, fail('Only ticket staff can add users.'));

  const modal = new ModalBuilder().setCustomId(IDS.ADD_USER_MODAL).setTitle('Add user to ticket').addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(IDS.ADD_USER_INPUT)
        .setLabel('Discord user ID')
        .setPlaceholder('Enter the Discord user ID to add.')
        .setStyle(TextInputStyle.Short)
        .setMinLength(17)
        .setMaxLength(32)
        .setRequired(true),
    ),
  );
  await interaction.showModal(modal);
}

async function removeUser(interaction) {
  const ticket = await requireTicketChannel(interaction);
  if (!ticket) return;
  if (!canManageTicket(interaction.member, ticket, getSettings())) return safeReply(interaction, fail('Only ticket staff can remove users.'));
  await interaction.deferReply({ flags: EPHEMERAL });
  const list = await ticketService.listRemovableUsers({ client: interaction.client, guild: interaction.guild, channel: interaction.channel, ticket });
  if (!list.total) return safeReply(interaction, 'ℹ️ There are no users who can be removed. Only individually added users are listed — the creator, staff and bots are protected.');
  await interaction.editReply({ ...removeUserMenu(list), allowedMentions: NO_MENTIONS });
}

async function removePage(interaction, parsed) {
  const ticket = await requireTicketChannel(interaction);
  if (!ticket) return;
  if (!canManageTicket(interaction.member, ticket, getSettings())) return safeReply(interaction, fail('Only ticket staff can remove users.'));
  const list = await ticketService.listRemovableUsers({ client: interaction.client, guild: interaction.guild, channel: interaction.channel, ticket, page: parsed.arg ?? 1 });
  if (!list.total) return interaction.update({ content: 'ℹ️ There are no users left to remove.', components: [] });
  await interaction.update({ ...removeUserMenu(list), allowedMentions: NO_MENTIONS });
}

async function claim(interaction) {
  const ticket = await requireTicketChannel(interaction);
  if (!ticket) return;
  await interaction.deferReply({ flags: EPHEMERAL });
  const result = await ticketService.toggleClaim({ guild: interaction.guild, channel: interaction.channel, actor: interaction.member });
  await safeReply(interaction, mark(result));
}

async function close(interaction) {
  const ticket = await requireTicketChannel(interaction);
  if (!ticket) return;
  if (!canCloseTicket(interaction.member, ticket, getSettings())) return safeReply(interaction, fail('You are not allowed to close this ticket.'));
  await interaction.reply({
    content: '⚠️ **Close this ticket?**\nA transcript will be saved to the logs channel, then the ticket is closed. This cannot be undone.',
    components: [closeConfirmRow()],
    flags: EPHEMERAL,
  });
}

/** Runs the close workflow, reporting through the (already acknowledged) interaction. */
async function runClose(interaction, { skipTranscript = false } = {}) {
  const ticket = await requireTicketChannel(interaction);
  if (!ticket) return;
  await interaction.update({ content: '⏳ Closing the ticket and saving the transcript…', components: [] });
  const result = await ticketService.closeTicket({
    client: interaction.client, guild: interaction.guild, channel: interaction.channel, actor: interaction.member, skipTranscript,
  });
  const showForce = !result.ok && result.retryable && isOwner(interaction.member, getSettings());
  try {
    await interaction.editReply({
      content: mark(result),
      components: !result.ok && result.retryable ? closeFailedRows(showForce) : [],
      allowedMentions: NO_MENTIONS,
    });
  } catch {
    /* the channel may already be deleted */
  }
}

async function cancelClose(interaction) {
  await interaction.update({ content: 'Cancelled — the ticket stays open.', components: [] });
}

async function transcript(interaction) {
  const ticket = await requireTicketChannel(interaction);
  if (!ticket) return;
  if (!canManageTicket(interaction.member, ticket, getSettings())) return safeReply(interaction, fail('Only ticket staff can save transcripts.'));
  await interaction.deferReply({ flags: EPHEMERAL });
  const result = await ticketService.saveTranscript({ guild: interaction.guild, channel: interaction.channel, actor: interaction.member });
  await safeReply(interaction, mark(result));
}

async function listPage(interaction, parsed) {
  if (!(await requireOwner(interaction))) return;
  await interaction.update(optionsPage(parsed.arg ?? 1));
}

async function handle(interaction, parsed) {
  switch (parsed.base) {
    case IDS.ADD_USER: return addUser(interaction);
    case IDS.REMOVE_USER: return removeUser(interaction);
    case IDS.REMOVE_PAGE: return removePage(interaction, parsed);
    case IDS.CLAIM: return claim(interaction);
    case IDS.CLOSE: return close(interaction);
    case IDS.CLOSE_CONFIRM:
    case IDS.CLOSE_RETRY: return runClose(interaction);
    case IDS.CLOSE_FORCE: return runClose(interaction, { skipTranscript: true });
    case IDS.CLOSE_CANCEL: return cancelClose(interaction);
    case IDS.TRANSCRIPT: return transcript(interaction);
    case IDS.LIST_PAGE: return listPage(interaction, parsed);
    default: return safeReply(interaction, fail('This button is no longer valid.'));
  }
}

module.exports = { handle };
