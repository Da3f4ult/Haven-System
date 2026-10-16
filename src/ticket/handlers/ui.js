'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const { IDS, COLORS, LIMITS } = require('../constants');
const { clip } = require('../utils/channelUtils');
const optionService = require('../services/optionService');

function closeConfirmRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(IDS.CLOSE_CONFIRM).setLabel('Confirm Close').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(IDS.CLOSE_CANCEL).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );
}

function closeFailedRows(showForce) {
  const buttons = [new ButtonBuilder().setCustomId(IDS.CLOSE_RETRY).setLabel('Retry').setEmoji('🔁').setStyle(ButtonStyle.Primary)];
  if (showForce) buttons.push(new ButtonBuilder().setCustomId(IDS.CLOSE_FORCE).setLabel('Close without transcript').setStyle(ButtonStyle.Danger));
  return [new ActionRowBuilder().addComponents(buttons)];
}

/** Ephemeral remove-user picker with pagination. */
function removeUserMenu({ entries, page, pages, total }) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(IDS.REMOVE_USER_SELECT)
    .setPlaceholder('Select a user to remove…')
    .addOptions(entries.map((e) => ({ label: e.label, value: e.id, description: e.description })));
  const rows = [new ActionRowBuilder().addComponents(select)];
  if (pages > 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${IDS.REMOVE_PAGE}:${page - 1}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
      new ButtonBuilder().setCustomId(`${IDS.REMOVE_PAGE}:${page + 1}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page >= pages),
    ));
  }
  const content = `Select the user to remove (${total} removable user${total === 1 ? '' : 's'}${pages > 1 ? `, page ${page}/${pages}` : ''}).\nThe ticket creator, bot and staff-role members are never listed.`;
  return { content, components: rows };
}

/** Paginated /ticket listoptions view. */
function optionsPage(page) {
  const all = optionService.getOptions();
  const pages = Math.max(1, Math.ceil(all.length / LIMITS.LIST_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const slice = all.slice((current - 1) * LIMITS.LIST_PAGE_SIZE, current * LIMITS.LIST_PAGE_SIZE);

  const embed = new EmbedBuilder()
    .setTitle('🎫 Ticket categories')
    .setColor(COLORS.PRIMARY)
    .setFooter({ text: `Page ${current}/${pages} • ${all.length} categor${all.length === 1 ? 'y' : 'ies'}` });
  const err = optionService.getLoadError();
  if (err) embed.setDescription(`⚠️ options.json is currently invalid; showing the last valid configuration.\n${clip(err, 300)}`);
  else if (!all.length) embed.setDescription('No categories configured yet. Use `/ticket addoption`.');

  for (const o of slice) {
    embed.addFields({
      name: `${o.emoji ? `${o.emoji} ` : ''}${o.label} — ${o.enabled ? '🟢 enabled' : '🔴 disabled'}`,
      value: clip([
        `**ID:** \`${o.id}\``,
        `**Description:** ${o.description}`,
        `**Category:** <#${o.categoryId}> • **Staff:** <@&${o.staffRoleId}>`,
        `**Image:** ${o.image ? `\`${clip(o.image, 80)}\`` : 'default'} • **Per-user limit:** ${o.maxOpenTicketsPerUser ?? 'none'}`,
      ].join('\n'), 1024),
    });
  }

  const components = pages > 1
    ? [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${IDS.LIST_PAGE}:${current - 1}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(current <= 1),
        new ButtonBuilder().setCustomId(`${IDS.LIST_PAGE}:${current + 1}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(current >= pages),
      )]
    : [];
  return { embeds: [embed], components };
}

module.exports = { closeConfirmRow, closeFailedRows, removeUserMenu, optionsPage };
