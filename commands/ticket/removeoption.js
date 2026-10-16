const { SlashCommandSubcommandBuilder } = require('discord.js');
const optionService = require('../../src/ticket/services/optionService');
const ticketStore = require('../../src/ticket/services/ticketStore');
const { requireOwner } = require('../../src/ticket/utils/guards');
const { runOptionMutation, afterConfigChange } = require('../../src/ticket/utils/optionCommands');
const { EPHEMERAL, NO_MENTIONS } = require('../../src/ticket/utils/replies');
const { isOwner } = require('../../src/ticket/utils/permissions');
const { getSettings } = require('../../src/ticket/config');

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName('removeoption')
    .setDescription('Remove a ticket category (existing tickets are not touched)')
    .addStringOption((o) => o.setName('id').setDescription('Category to remove').setRequired(true).setAutocomplete(true)),

  async autocomplete(interaction) {
    if (!interaction.inCachedGuild() || !isOwner(interaction.member, getSettings())) return interaction.respond([]);
    const q = interaction.options.getFocused().toLowerCase();
    return interaction.respond(
      optionService.getOptions()
        .filter((o) => o.id.includes(q) || o.label.toLowerCase().includes(q))
        .slice(0, 25)
        .map((o) => ({ name: `${o.label} (${o.id})`.slice(0, 100), value: o.id })),
    );
  },

  async execute(interaction) {
    if (!(await requireOwner(interaction))) return;
    await interaction.deferReply({ flags: EPHEMERAL });

    const id = interaction.options.getString('id', true).trim().toLowerCase();
    const removed = await runOptionMutation(interaction, () => optionService.removeOption(id));
    if (!removed) return;

    const stillOpen = ticketStore.list().filter((t) => t.optionId === id && t.status !== 'closed').length;
    const panelNote = await afterConfigChange(interaction, {
      title: 'Ticket category removed',
      fields: [{ name: 'Category', value: `${removed.label} (\`${id}\`)`, inline: true }],
    });
    await interaction.editReply({
      content: [`✅ Removed **${removed.label}** (\`${id}\`).`, stillOpen ? `${stillOpen} open ticket(s) in this category keep working normally.` : '', panelNote].filter(Boolean).join('\n'),
      allowedMentions: NO_MENTIONS,
    });
  },
};
