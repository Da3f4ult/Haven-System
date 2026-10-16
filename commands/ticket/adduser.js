const { SlashCommandSubcommandBuilder } = require('discord.js');
const ticketService = require('../../src/ticket/services/ticketService');
const { requireTicketChannel } = require('../../src/ticket/utils/guards');
const { EPHEMERAL, safeReply, ok, fail } = require('../../src/ticket/utils/replies');

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName('adduser')
    .setDescription('Add a user to this ticket')
    .addUserOption((o) => o.setName('user').setDescription('User to add').setRequired(true)),

  async execute(interaction) {
    if (!(await requireTicketChannel(interaction))) return;
    await interaction.deferReply({ flags: EPHEMERAL });
    const r = await ticketService.addUser({ guild: interaction.guild, channel: interaction.channel, actor: interaction.member, targetId: interaction.options.getUser('user', true).id });
    await safeReply(interaction, r.ok ? ok(r.message) : fail(r.message));
  },
};
