'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { COLORS } = require('../constants');
const { getTicketSettings } = require('../config');
const { fetchChannelSafe, clip } = require('../utils/channelUtils');
const { NO_MENTIONS } = require('../utils/replies');
const { info, warn } = require('../../utils');

const NEEDED = ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles'];

/**
 * Resolves and validates the logs channel from settings.json.
 * @returns {Promise<{ channel: import('discord.js').TextChannel|null, error: string|null }>}
 */
async function getLogsChannel(guild) {
  const id = getTicketSettings().logsChannelId;
  if (!id) return { channel: null, error: 'ticket.logsChannelId is not configured.' };
  const channel = await fetchChannelSafe(guild, id);
  if (!channel) return { channel: null, error: 'The configured logs channel does not exist or is invalid.' };
  if (!channel.isTextBased() || channel.isDMBased()) return { channel: null, error: 'The configured logs channel is not a text channel.' };
  const perms = channel.permissionsFor(guild.members.me);
  const missing = NEEDED.filter((n) => !perms?.has(PermissionFlagsBits[n]));
  if (missing.length) return { channel: null, error: `The bot is missing ${missing.join(', ')} in the logs channel.` };
  return { channel, error: null };
}

/**
 * Sends a structured log entry to the logs channel (and the console). Never throws.
 * @param {import('discord.js').Guild} guild
 * @param {{ title: string, color?: number, description?: string, fields?: {name:string,value:string,inline?:boolean}[], userId?: string, channelId?: string }} entry
 */
async function logAction(guild, entry) {
  info('ticket', `${entry.title}${entry.userId ? ` by ${entry.userId}` : ''}${entry.channelId ? ` in ${entry.channelId}` : ''}`);
  try {
    const { channel, error } = await getLogsChannel(guild);
    if (!channel) {
      warn('ticket', `Log not delivered: ${error}`);
      return false;
    }
    const fields = [...(entry.fields ?? [])];
    if (entry.userId) fields.unshift({ name: 'User', value: `<@${entry.userId}> (\`${entry.userId}\`)`, inline: true });
    if (entry.channelId) fields.push({ name: 'Channel', value: `<#${entry.channelId}>`, inline: true });
    const embed = new EmbedBuilder()
      .setTitle(clip(entry.title, 256))
      .setColor(entry.color ?? COLORS.NEUTRAL)
      .setTimestamp(new Date());
    if (entry.description) embed.setDescription(clip(entry.description, 4000));
    if (fields.length) embed.addFields(fields.slice(0, 25).map((f) => ({ name: clip(f.name, 256), value: clip(String(f.value) || '—', 1024), inline: f.inline ?? false })));
    await channel.send({ embeds: [embed], allowedMentions: NO_MENTIONS });
    return true;
  } catch (e) {
    warn('ticket', `Log delivery failed: ${e.message}`);
    return false;
  }
}

module.exports = { getLogsChannel, logAction };
