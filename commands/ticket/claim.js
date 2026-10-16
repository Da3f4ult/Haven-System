const { SlashCommandSubcommandBuilder } = require('discord.js');
const ticketService = require('../../src/ticket/services/ticketService');
const { requireTicketChannel } = require('../../src/ticket/utils/guards');
const { EPHEMERAL, safeReply, ok, fail } = require('../../src/ticket/utils/replies');

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName('claim')
    .setDescription('Claim this ticket (or release your claim)')
    .addBooleanOption((o) => o.setName('release').setDescription('Release the current claim instead')),

  async execute(interaction) {
    if (!(await requireTicketChannel(interaction))) return;
    await interaction.deferReply({ flags: EPHEMERAL });
    const release = interaction.options.getBoolean('release') ?? false;
    const r = await ticketService.toggleClaim({ guild: interaction.guild, channel: interaction.channel, actor: interaction.member, forceRelease: release, claimOnly: !release });
    await safeReply(interaction, r.ok ? ok(r.message) : fail(r.message));
  },
};
