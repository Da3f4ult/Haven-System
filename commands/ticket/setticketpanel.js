const { SlashCommandSubcommandBuilder } = require('discord.js');
const { requireOwner } = require('../../src/ticket/utils/guards');
const panelService = require('../../src/ticket/services/panelService');
const optionService = require('../../src/ticket/services/optionService');
const { logAction } = require('../../src/ticket/services/logService');
const { EPHEMERAL, safeReply, fail } = require('../../src/ticket/utils/replies');
const { validateTicketSettings } = require('../../src/ticket/config');
const { COLORS } = require('../../src/ticket/constants');

module.exports = {
  data: new SlashCommandSubcommandBuilder().setName('setticketpanel').setDescription('Publish or refresh the ticket panel'),

  async execute(interaction) {
    if (!(await requireOwner(interaction))) return;
    await interaction.deferReply({ flags: EPHEMERAL });

    const result = await panelService.publishPanel(interaction.client);
    if (result.status === 'error') return safeReply(interaction, fail(result.error));

    const loadError = optionService.getLoadError();
    const warnings = validateTicketSettings().filter((p) => !p.includes('ownerRoleId'));
    await logAction(interaction.guild, { title: `⚙️ Ticket panel ${result.status}`, color: COLORS.PRIMARY, userId: interaction.user.id });
    await interaction.editReply({
      content: [
        `✅ Panel ${result.status === 'created' ? 'published' : 'refreshed'}: ${result.url}`,
        loadError ? `⚠️ options.json has a problem; the last valid configuration is shown: ${loadError}` : '',
        ...warnings.map((w) => `⚠️ ${w}`),
      ].filter(Boolean).join('\n'),
      allowedMentions: { parse: [] },
    });
  },
};
