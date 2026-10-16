const { SlashCommandSubcommandBuilder, ChannelType } = require('discord.js');
const optionService = require('../../src/ticket/services/optionService');
const { requireOwner } = require('../../src/ticket/utils/guards');
const { checkGuildInputs, runOptionMutation, afterConfigChange } = require('../../src/ticket/utils/optionCommands');
const { EPHEMERAL, safeReply, fail, NO_MENTIONS } = require('../../src/ticket/utils/replies');
const { isOwner } = require('../../src/ticket/utils/permissions');
const { getSettings } = require('../../src/ticket/config');

const CLEAR = 'none';

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName('editoption')
    .setDescription('Edit a ticket category (only the fields you provide change)')
    .addStringOption((o) => o.setName('id').setDescription('Category to edit').setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName('label').setDescription('New display name').setMaxLength(100))
    .addStringOption((o) => o.setName('description').setDescription('New description').setMaxLength(100))
    .addStringOption((o) => o.setName('emoji').setDescription(`New emoji (or "${CLEAR}" to remove)`))
    .addStringOption((o) => o.setName('image').setDescription(`New image URL / public/ path (or "${CLEAR}" for default)`))
    .addChannelOption((o) => o.setName('category').setDescription('New Discord category').addChannelTypes(ChannelType.GuildCategory))
    .addRoleOption((o) => o.setName('staff_role').setDescription('New staff role (affects new tickets only)'))
    .addBooleanOption((o) => o.setName('enabled').setDescription('Show or hide in the menu'))
    .addIntegerOption((o) => o.setName('max_open_per_user').setDescription('Per-user limit in this category (0 = no limit)').setMinValue(0).setMaxValue(10)),

  async autocomplete(interaction) {
    if (!interaction.inCachedGuild() || !isOwner(interaction.member, getSettings())) return interaction.respond([]);
    const q = interaction.options.getFocused().toLowerCase();
    const choices = optionService.getOptions()
      .filter((o) => o.id.includes(q) || o.label.toLowerCase().includes(q))
      .slice(0, 25)
      .map((o) => ({ name: `${o.label} (${o.id})`.slice(0, 100), value: o.id }));
    return interaction.respond(choices);
  },

  async execute(interaction) {
    if (!(await requireOwner(interaction))) return;
    await interaction.deferReply({ flags: EPHEMERAL });

    const o = interaction.options;
    const id = o.getString('id', true).trim().toLowerCase();
    const category = o.getChannel('category');
    const role = o.getRole('staff_role');
    const emojiIn = o.getString('emoji')?.trim();
    const imageIn = o.getString('image')?.trim();

    const { errors, warnings } = checkGuildInputs(interaction, {
      category, role,
      emoji: emojiIn && emojiIn.toLowerCase() !== CLEAR ? emojiIn : null,
      image: imageIn && imageIn.toLowerCase() !== CLEAR ? imageIn : null,
    });
    if (errors.length) return safeReply(interaction, fail(errors.join('\n')));

    const limit = o.getInteger('max_open_per_user');
    const changes = {
      label: o.getString('label') ?? undefined,
      description: o.getString('description') ?? undefined,
      emoji: emojiIn === undefined ? undefined : emojiIn.toLowerCase() === CLEAR ? '' : emojiIn,
      image: imageIn === undefined ? undefined : imageIn.toLowerCase() === CLEAR ? '' : imageIn,
      categoryId: category?.id,
      staffRoleId: role?.id,
      enabled: o.getBoolean('enabled') ?? undefined,
      maxOpenTicketsPerUser: limit === null ? undefined : limit === 0 ? null : limit,
    };
    if (Object.values(changes).every((v) => v === undefined)) return safeReply(interaction, fail('Provide at least one field to change.'));

    const result = await runOptionMutation(interaction, () => optionService.editOption(id, changes));
    if (!result) return;
    if (!result.changed.length) return safeReply(interaction, 'ℹ️ Nothing changed — the values you provided are already set.');

    const panelNote = await afterConfigChange(interaction, {
      title: 'Ticket category edited',
      fields: [
        { name: 'Category', value: `${result.option.label} (\`${id}\`)`, inline: true },
        { name: 'Changed', value: result.changed.join(', '), inline: true },
      ],
    });
    await interaction.editReply({
      content: [`✅ Updated **${result.option.label}** (\`${id}\`). Changed: ${result.changed.map((c) => `\`${c}\``).join(', ')}.`, 'Open tickets keep the staff role they were created with.', panelNote, ...warnings.map((w) => `⚠️ ${w}`)].join('\n'),
      allowedMentions: NO_MENTIONS,
    });
  },
};
