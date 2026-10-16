'use strict';

const { buildPanelPayload } = require('../component');
const { getSettings } = require('../config');
const optionService = require('./optionService');
const { KeyedQueue } = require('../utils/mutex');
const { isValidSnowflake } = require('../utils/validation');
const { warn } = require('../../utils');

const queue = new KeyedQueue();

const currentPayload = (client) =>
  buildPanelPayload({ client, options: optionService.getOptions(), settings: getSettings() });

async function fetchPanelMessage(client, ref) {
  const channel = await client.channels.fetch(ref.channelId).catch(() => null);
  if (!channel?.isTextBased()) return { channel: null, message: null };
  const message = await channel.messages.fetch(ref.messageId).catch(() => null);
  return { channel, message };
}

/**
 * Publishes the panel in ticket.panelChannelId. Edits the existing panel instead of
 * creating duplicates; recreates it if it was deleted or the channel setting changed.
 * @returns {Promise<{ status: 'created'|'updated'|'error', error?: string, url?: string }>}
 */
function publishPanel(client) {
  return queue.run('panel', async () => {
    optionService.loadOptions(); // pick up manual edits of options.json
    const settings = getSettings();
    const targetId = settings.ticket.panelChannelId;
    if (!isValidSnowflake(targetId)) return { status: 'error', error: 'ticket.panelChannelId is not configured in settings.json.' };

    const target = await client.channels.fetch(targetId).catch(() => null);
    if (!target?.isTextBased() || target.isDMBased()) return { status: 'error', error: 'The configured panel channel does not exist or is not a text channel.' };

    const me = target.guild.members.me;
    const perms = target.permissionsFor(me);
    if (!perms?.has(['ViewChannel', 'SendMessages', 'AttachFiles'])) {
      return { status: 'error', error: 'The bot needs View Channel, Send Messages and Attach Files in the panel channel.' };
    }

    const ref = optionService.getPanelRef();
    const payload = currentPayload(client);

    if (ref && ref.channelId === target.id) {
      const existing = await target.messages.fetch(ref.messageId).catch(() => null);
      if (existing?.editable) {
        await existing.edit(payload);
        return { status: 'updated', url: existing.url };
      }
    } else if (ref) {
      // Panel moved to another channel: remove the old one (best effort).
      const old = await fetchPanelMessage(client, ref);
      await old.message?.delete().catch(() => {});
    }

    const sent = await target.send(payload);
    await optionService.setPanelRef({ channelId: target.id, messageId: sent.id });
    return { status: 'created', url: sent.url };
  });
}

/**
 * Re-renders the already published panel after option changes.
 * @returns {Promise<{ status: 'updated'|'none'|'missing'|'error', error?: string }>}
 */
function refreshPanel(client) {
  return queue.run('panel', async () => {
    const ref = optionService.getPanelRef();
    if (!ref) return { status: 'none' };
    try {
      const { message } = await fetchPanelMessage(client, ref);
      if (!message?.editable) return { status: 'missing' };
      await message.edit(currentPayload(client));
      return { status: 'updated' };
    } catch (e) {
      warn('ticket', `Panel refresh failed: ${e.message}`);
      return { status: 'error', error: e.message };
    }
  });
}

/** Human-readable sentence about the outcome of refreshPanel(). */
function describeRefresh(result) {
  switch (result.status) {
    case 'updated': return 'The ticket panel was updated.';
    case 'none': return 'No panel is published yet — run `/ticket setticketpanel` to publish it.';
    case 'missing': return 'The published panel message could not be found — run `/ticket setticketpanel` to republish it.';
    default: return 'The option was saved, but the panel could not be updated automatically.';
  }
}

module.exports = { publishPanel, refreshPanel, describeRefresh, currentPayload };
