const { SlashCommandSubcommandBuilder, ChannelType } = require('discord.js');
const optionService = require('../../src/ticket/services/optionService');
const { requireOwner } = require('../../src/ticket/utils/guards');
const { checkGuildInputs, runOptionMutation, afterConfigChange } = require('../../src/ticket/utils/optionCommands');
const { EPHEMERAL, safeReply, fail, NO_MENTIONS } = require('../../src/ticket/utils/replies');

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName('addoption')
    .setDescription('Add a ticket category to the panel')
    .addStringOption((o) => o.setName('id').setDescription('Unique ID: lowercase letters, numbers, underscores').setRequired(true).setMaxLength(50))
    .addStringOption((o) => o.setName('label').setDescription('Name shown in the menu').setRequired(true).setMaxLength(100))
    .addStringOption((o) => o.setName('description').setDescription('Short explanation shown in the menu').setRequired(true).setMaxLength(100))
    .addChannelOption((o) => o.setName('category').setDescription('Discord category where tickets are created').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
    .addRoleOption((o) => o.setName('staff_role').setDescription('Role that handles these tickets').setRequired(true))
    .addStringOption((o) => o.setName('emoji').setDescription('Optional emoji for the menu'))
    .addStringOption((o) => o.setName('image').setDescription('Optional image: https URL or path inside public/'))
    .addBooleanOption((o) => o.setName('enabled').setDescription('Show in the menu (default: true)'))
    .addIntegerOption((o) => o.setName('max_open_per_user').setDescription('Max open tickets per user in this category').setMinValue(1).setMaxValue(10)),

  async execute(interaction) {
    if (!(await requireOwner(interaction))) return;
    await interaction.deferReply({ flags: EPHEMERAL });

    const o = interaction.options;
    const category = o.getChannel('category', true);
    const role = o.getRole('staff_role', true);
    const emoji = o.getString('emoji')?.trim() || '';
    const image = o.getString('image')?.trim() || '';

    const { errors, warnings } = checkGuildInputs(interaction, { category, role, emoji, image });
    if (errors.length) return safeReply(interaction, fail(errors.join('\n')));

    const option = await runOptionMutation(interaction, () =>
      optionService.addOption({
        id: o.getString('id', true).trim().toLowerCase(),
        label: o.getString('label', true),
        emoji,
        description: o.getString('description', true),
        image,
        categoryId: category.id,
        staffRoleId: role.id,
        enabled: o.getBoolean('enabled') ?? true,
        maxOpenTicketsPerUser: o.getInteger('max_open_per_user') ?? null,
      }));
    if (!option) return;

    const panelNote = await afterConfigChange(interaction, {
      title: 'Ticket category added',
      fields: [{ name: 'Category', value: `${option.label} (\`${option.id}\`)`, inline: true }],
    });
    await interaction.editReply({
      content: [`✅ Added **${option.label}** (\`${option.id}\`).`, panelNote, ...warnings.map((w) => `⚠️ ${w}`)].join('\n'),
      allowedMentions: NO_MENTIONS,
    });
  },
};
