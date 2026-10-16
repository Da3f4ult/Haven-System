'use strict';

const {
  ActionRowBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} = require('discord.js');
const { IDS, COLORS, LIMITS, DEFAULT_PANEL_IMAGE } = require('./constants');
const { isValidEmoji } = require('./utils/validation');
const { resolveImage } = require('./utils/media');
const { clip } = require('./utils/channelUtils');

const separator = (divider) =>
  new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(divider);

/** Returns the emoji only if it is valid and usable by the bot; otherwise null. */
function resolveEmoji(client, emoji) {
  if (!emoji || !isValidEmoji(emoji)) return null;
  const custom = /^<a?:\w+:(\d+)>$/.exec(emoji);
  if (custom && !client?.emojis?.cache?.has(custom[1])) return null;
  return emoji;
}

/**
 * Pure builder for the public panel container.
 * @param {{ options: object[], settings: object, client?: import('discord.js').Client, imageUrl?: string|null }} p
 */
function buildPanelComponents({ options, settings, client, imageUrl }) {
  const panel = settings.ticket.panel ?? {};
  const enabled = options.filter((o) => o.enabled).slice(0, LIMITS.MAX_OPTIONS);

  const container = new ContainerBuilder().setAccentColor(COLORS.PRIMARY);

  if (imageUrl) {
    container
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl)),
      )
      .addSeparatorComponents(separator(true));
  }

  const lines = [
    `# ${clip(panel.title || 'Support Center', 100)}`,
    clip(panel.description || '', 800),
    '',
    '**How it works**',
    '1. Choose the category that matches your request.',
    '2. A private channel is created just for you and our staff.',
    '3. Describe your issue in detail and we will reply as soon as possible.',
  ];
  if (panel.footer) lines.push('', `-# ${clip(panel.footer, 200)}`);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
  container.addSeparatorComponents(separator(true));

  if (enabled.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '⚠️ **Ticket creation is temporarily unavailable.**\nNo support categories are open right now. Please check back later.',
      ),
    );
    return [container];
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(IDS.CREATE)
    .setPlaceholder('Select a ticket category…')
    .setMinValues(1)
    .setMaxValues(1);

  for (const option of enabled) {
    const item = new StringSelectMenuOptionBuilder()
      .setLabel(clip(option.label, 100))
      .setValue(option.id)
      .setDescription(clip(option.description, 100));
    const emoji = resolveEmoji(client, option.emoji);
    if (emoji) item.setEmoji(emoji);
    select.addOptions(item);
  }

  container.addActionRowComponents(new ActionRowBuilder().addComponents(select));
  return [container];
}

/**
 * Full message payload for the panel, including the image attachment.
 * Safe to use for both channel.send() and message.edit() (files replace old attachments).
 */
function buildPanelPayload({ client, options, settings }) {
  const image = resolveImage(settings.ticket.panelImage, {
    baseName: 'ticket-panel',
    fallback: DEFAULT_PANEL_IMAGE,
  });
  return {
    components: buildPanelComponents({ options, settings, client, imageUrl: image?.url ?? null }),
    files: image?.attachment ? [image.attachment] : [],
    flags: MessageFlags.IsComponentsV2,
  };
}

module.exports = { buildPanelComponents, buildPanelPayload, resolveEmoji };
