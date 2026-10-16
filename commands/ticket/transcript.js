const { SlashCommandSubcommandBuilder } = require('discord.js');
const ticketService = require('../../src/ticket/services/ticketService');
const { requireTicketChannel } = require('../../src/ticket/utils/guards');
const { EPHEMERAL, safeReply, ok, fail } = require('../../src/ticket/utils/replies');

module.exports = {
  data: new SlashCommandSubcommandBuilder().setName('transcript').setDescription('Save an HTML transcript without closing the ticket'),

  async execute(interaction) {
    if (!(await requireTicketChannel(interaction))) return;
    await interaction.deferReply({ flags: EPHEMERAL });
    const r = await ticketService.saveTranscript({ guild: interaction.guild, channel: interaction.channel, actor: interaction.member });
    await safeReply(interaction, r.ok ? ok(r.message) : fail(r.message));
  },
};
