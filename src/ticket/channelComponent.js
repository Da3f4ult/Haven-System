'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');
const { IDS, COLORS, DEFAULT_PANEL_IMAGE } = require('./constants');
const { resolveImage } = require('./utils/media');

const pad = (n) => String(n).padStart(3, '0');

function statusLine(ticket, closing) {
  if (closing) return '🔴 Closing…';
  if (ticket.status === 'closed') return '⚫ Closed';
  if (ticket.claimedBy) return `🟡 Claimed by <@${ticket.claimedBy}>`;
  return '🟢 Open — waiting for staff';
}

/**
 * Builds the private ticket interface.
 * @param {{ ticket: object, imageUrl?: string|null, disabled?: boolean, closing?: boolean }} p
 */
function buildTicketComponents({ ticket, imageUrl, disabled = false, closing = false }) {
  const container = new ContainerBuilder().setAccentColor(COLORS.PRIMARY);

  if (imageUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl)),
    );
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `# 🎫 Support Ticket #${pad(ticket.number)}`,
        '',
        `Welcome, <@${ticket.creatorId}>!`,
        '',
        'Your ticket has been created successfully.',
        '',
        `**Category:** ${ticket.optionLabel}`,
        `**Status:** ${statusLine(ticket, closing)}`,
        '',
        `Our staff team, <@&${ticket.staffRoleId}>, will assist you shortly.`,
        '',
        'Please describe your issue and provide any relevant information (screenshots, usernames, steps to reproduce).',
      ].join('\n'),
    ),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

  const claimed = Boolean(ticket.claimedBy);
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(IDS.ADD_USER).setLabel('Add User').setEmoji('➕').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
      new ButtonBuilder().setCustomId(IDS.REMOVE_USER).setLabel('Remove User').setEmoji('➖').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(IDS.CLAIM)
        .setLabel(claimed ? 'Release Claim' : 'Claim Ticket')
        .setEmoji(claimed ? '🔓' : '🙋')
        .setStyle(claimed ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setDisabled(disabled),
      new ButtonBuilder().setCustomId(IDS.CLOSE).setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger).setDisabled(disabled),
      new ButtonBuilder().setCustomId(IDS.TRANSCRIPT).setLabel('Save Transcript').setEmoji('📄').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    ),
  );

  return [container];
}

/** Payload for the first send (includes the image attachment). */
function buildTicketPayload({ ticket, option }) {
  const image = resolveImage(option?.image, { baseName: 'ticket-image', fallback: DEFAULT_PANEL_IMAGE });
  return {
    payload: {
      components: buildTicketComponents({ ticket, imageUrl: image?.url ?? null }),
      files: image?.attachment ? [image.attachment] : [],
      flags: MessageFlags.IsComponentsV2,
    },
    imageUrl: image && !image.attachment ? image.url : null,
  };
}

module.exports = { buildTicketComponents, buildTicketPayload };
