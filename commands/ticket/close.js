const { SlashCommandSubcommandBuilder } = require('discord.js');
const { requireTicketChannel } = require('../../src/ticket/utils/guards');
const { getSettings } = require('../../src/ticket/config');
const { canCloseTicket } = require('../../src/ticket/utils/permissions');
const { closeConfirmRow } = require('../../src/ticket/handlers/ui');
const { EPHEMERAL, safeReply, fail } = require('../../src/ticket/utils/replies');

module.exports = {
  data: new SlashCommandSubcommandBuilder().setName('close').setDescription('Close this ticket (asks for confirmation)'),

  async execute(interaction) {
    const ticket = await requireTicketChannel(interaction);
    if (!ticket) return;
    if (!canCloseTicket(interaction.member, ticket, getSettings())) return safeReply(interaction, fail('You are not allowed to close this ticket.'));
    await interaction.reply({
      content: '⚠️ **Close this ticket?**\nA transcript will be saved to the logs channel, then the ticket is closed. This cannot be undone.',
      components: [closeConfirmRow()],
      flags: EPHEMERAL,
    });
  },
};
