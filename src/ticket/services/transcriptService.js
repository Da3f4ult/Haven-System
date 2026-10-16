'use strict';

const { AttachmentBuilder, EmbedBuilder, MessageType } = require('discord.js');
const { getTicketSettings } = require('../config');
const { COLORS } = require('../constants');
const { renderTranscript } = require('../transcript/renderer');
const { getLogsChannel, logAction } = require('./logService');
const ticketStore = require('./ticketStore');
const { NO_MENTIONS } = require('../utils/replies');
const { clip } = require('../utils/channelUtils');
const { warn } = require('../../utils');

const CDN_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_INLINE_EACH = 2 * 1024 * 1024;
const MIB = 1024 * 1024;

/** Discord upload limit for the guild (bytes), with a safety margin for payload overhead. */
function uploadLimit(guild) {
  const tier = Number(guild.premiumTier ?? 0);
  const raw = tier >= 3 ? 100 * MIB : tier === 2 ? 50 * MIB : 10 * MIB;
  return Math.floor(raw * 0.9);
}

// ---------------------------------------------------------------- collection

/** Fetches the whole channel history (100 per request) in chronological order. */
async function collectMessages(channel, maxMessages) {
  const all = [];
  let before;
  let truncated = false;
  for (;;) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (batch.size === 0) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (all.length >= maxMessages) {
      const probe = await channel.messages.fetch({ limit: 1, before });
      truncated = probe.size > 0;
      break;
    }
    if (batch.size < 100) break;
  }
  all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  return { messages: all, truncated };
}

// ------------------------------------------------------------- normalization

const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;

function componentText(components) {
  const out = [];
  const walk = (c) => {
    if (!c) return;
    if (typeof c.content === 'string' && c.content) out.push(c.content);
    if (Array.isArray(c.components)) c.components.forEach(walk);
    if (c.accessory) walk(c.accessory);
  };
  (components ?? []).forEach(walk);
  return out;
}

function systemText(m, name) {
  switch (m.type) {
    case MessageType.ChannelPinnedMessage: return `${name} pinned a message to this channel.`;
    case MessageType.UserJoin: return `${name} joined the server.`;
    case MessageType.RecipientAdd: return `${name} added someone to the conversation.`;
    case MessageType.RecipientRemove: return `${name} removed someone from the conversation.`;
    default: return `System message (${MessageType[m.type] ?? m.type})`;
  }
}

/** Converts a discord.js Message into plain data (no Discord objects leak past here). */
function normalizeMessage(m, { guild, ticket, byId }) {
  const member = m.member ?? null;
  const user = m.author;
  const displayName = member?.displayName ?? user.globalName ?? user.username;
  const highest = member?.roles?.highest;

  const users = {};
  for (const u of m.mentions.users.values()) {
    users[u.id] = m.mentions.members?.get(u.id)?.displayName ?? u.globalName ?? u.username;
  }
  const roles = {};
  for (const r of m.mentions.roles.values()) roles[r.id] = { name: r.name, color: r.color ? r.hexColor : null };
  const channels = {};
  for (const [, id] of (m.content ?? '').matchAll(/<#(\d{17,20})>/g)) {
    const ch = guild.channels.cache.get(id);
    if (ch) channels[id] = ch.name;
  }

  let reply = null;
  if (m.reference?.messageId && m.type !== MessageType.ChannelPinnedMessage) {
    const target = byId.get(m.reference.messageId);
    reply = target
      ? {
          found: true,
          authorName: target.member?.displayName ?? target.author.globalName ?? target.author.username,
          snippet: clip((target.content || '').replace(/\s+/g, ' '), 90),
        }
      : { found: false };
  }

  const isInterface = ticket.interfaceMessageId === m.id;
  const attachments = isInterface
    ? [] // decorative banner of the ticket interface
    : [...m.attachments.values()].map((a) => ({
        id: a.id,
        name: a.name,
        url: a.url,
        size: a.size,
        isImage: Boolean(a.contentType?.startsWith('image/') && IMAGE_TYPES.has(a.contentType.split(';')[0])) || IMAGE_EXT.test(a.name ?? ''),
      }));

  const system = !m.system || m.type === MessageType.Default || m.type === MessageType.Reply ? null : systemText(m, displayName);

  return {
    id: m.id,
    ts: m.createdTimestamp,
    editedTs: m.editedTimestamp ?? null,
    system,
    author: {
      id: user.id,
      username: user.username,
      displayName,
      color: member?.displayColor ? member.displayHexColor : null,
      avatarUrl: (member ?? user).displayAvatarURL({ extension: 'png', size: 64, forceStatic: true }),
      bot: user.bot,
      roleName: highest && highest.id !== guild.id ? highest.name : null,
    },
    content: m.content ?? '',
    lookups: { users, roles, channels },
    reply,
    attachments,
    embeds: m.embeds.map((e) => ({
      color: e.color ? e.hexColor : null,
      author: e.author?.name ?? null,
      title: e.title ?? null,
      url: e.url ?? null,
      description: e.description ?? null,
      fields: (e.fields ?? []).map((f) => ({ name: f.name, value: f.value, inline: f.inline })),
      image: e.image?.proxyURL ?? e.image?.url ?? null,
      thumbnail: e.thumbnail?.proxyURL ?? e.thumbnail?.url ?? null,
      footer: e.footer?.text ?? null,
    })),
    stickers: [...m.stickers.values()].map((s) => s.name),
    reactions: [...m.reactions.cache.values()].map((r) => ({ label: r.emoji.name ?? 'emoji', count: r.count })),
    componentText: componentText(m.components),
  };
}

// ------------------------------------------------------------- media inlining

async function downloadImage(url, maxBytes) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || !CDN_HOSTS.has(parsed.hostname)) return null; // SSRF guard
  try {
    const res = await fetch(parsed, { signal: AbortSignal.timeout(10_000), redirect: 'error' });
    if (!res.ok || !res.body) return null;
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(type)) return null;
    const declared = Number(res.headers.get('content-length'));
    if (declared && declared > maxBytes) return null;
    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > maxBytes) return null;
      chunks.push(chunk);
    }
    return { bytes: size, uri: `data:${type};base64,${Buffer.concat(chunks).toString('base64')}` };
  } catch {
    return null;
  }
}

/** Embeds avatars, the guild icon and image attachments as data URIs within a byte budget. */
async function inlineMedia(model, budget) {
  let used = 0;
  const jobs = [];
  const queueJob = (url, max, apply) => url && jobs.push({ url, max, apply });

  queueJob(model.guild.iconUrl, 256 * 1024, (uri) => (model.guild.iconData = uri));
  for (const a of model.authors.values()) queueJob(a.avatarUrl, 128 * 1024, (uri) => (a.avatarData = uri));
  for (const m of model.messages) {
    for (const att of m.attachments ?? []) if (att.isImage) queueJob(att.url, MAX_INLINE_EACH, (uri) => (att.dataUri = uri));
  }

  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      if (used >= budget) continue;
      const res = await downloadImage(job.url, Math.min(job.max, budget - used));
      if (res && used + res.bytes <= budget) {
        used += res.bytes;
        job.apply(res.uri);
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return used;
}

const EVENT_TEXT = {
  claim: (e) => `${e.userTag} claimed the ticket`,
  release: (e) => `${e.userTag} released the claim`,
  add_user: (e) => `${e.userTag} added ${e.targetTag ?? e.targetId}`,
  remove_user: (e) => `${e.userTag} removed ${e.targetTag ?? e.targetId}`,
  transcript: (e) => `${e.userTag} saved a transcript`,
  close: (e) => `${e.userTag} closed the ticket`,
};

// ---------------------------------------------------------------- public API

/**
 * Builds the transcript files for a ticket channel.
 * @returns {Promise<{ files: { name: string, buffer: Buffer }[], messageCount: number, truncated: boolean }>}
 */
async function generate({ guild, channel, ticket, closedAt = null }) {
  const settings = getTicketSettings();
  const maxMessages = settings.transcript.maxMessages;
  const { messages, truncated } = await collectMessages(channel, maxMessages);
  const byId = new Map(messages.map((m) => [m.id, m]));

  const authors = new Map();
  const normalized = messages.map((m) => {
    const n = normalizeMessage(m, { guild, ticket, byId });
    if (!n.system && !authors.has(n.author.id)) authors.set(n.author.id, { index: authors.size, ...n.author });
    return n;
  });

  const claimer = ticket.claimedBy ? await guild.members.fetch(ticket.claimedBy).catch(() => null) : null;
  const model = {
    guild: { name: guild.name, iconUrl: guild.iconURL({ extension: 'png', size: 128 }) ?? null, iconData: null },
    channel: { id: channel.id, name: channel.name },
    ticket: {
      category: ticket.optionLabel,
      creatorId: ticket.creatorId,
      creatorName: ticket.creatorTag,
      createdAt: ticket.createdAt,
      closedAt,
      claimedBy: claimer ? claimer.displayName : ticket.claimedBy ? `Unknown (${ticket.claimedBy})` : null,
    },
    messages: normalized,
    authors,
    totalMessages: normalized.length,
    truncated,
    maxMessages,
    degraded: false,
    generatedAt: Date.now(),
    events: (ticket.events ?? [])
      .filter((e) => EVENT_TEXT[e.type])
      .map((e) => ({ at: e.at, text: EVENT_TEXT[e.type](e) })),
  };

  const limit = uploadLimit(guild);
  let pages;
  if (settings.transcript.embedImages) {
    await inlineMedia(model, Math.floor(limit * 0.6));
    pages = renderTranscript(model, { maxBytes: limit, useInline: true });
    if (pages.length > 1) {
      // Prefer ONE file with linked images over several files with embedded images.
      model.degraded = true;
      pages = renderTranscript(model, { maxBytes: limit, useInline: false });
      if (pages.length > 1) model.degraded = true;
    }
  } else {
    pages = renderTranscript(model, { maxBytes: limit, useInline: false });
  }

  const base = `transcript-${channel.name}`.replace(/[^a-z0-9_-]/gi, '-').slice(0, 80);
  const files = pages.map((p, i) => ({
    name: pages.length > 1 ? `${base}-part${i + 1}of${pages.length}.html` : `${base}.html`,
    buffer: Buffer.from(p.html, 'utf8'),
    range: [p.from, p.to],
  }));
  return { files, messageCount: normalized.length, truncated };
}

/**
 * Generates the transcript and delivers it to the logs channel.
 * Resolves { ok:false } (never throws) so callers can keep the ticket channel alive.
 *
 * @param {{ client: import('discord.js').Client, guild: import('discord.js').Guild, channel: import('discord.js').TextChannel, ticket: object, actor: import('discord.js').GuildMember, reason: 'close'|'manual', closedAt?: number }} p
 * @returns {Promise<{ ok: boolean, error?: string, userMessage?: string, messageCount?: number, parts?: number }>}
 */
async function generateAndDeliver({ guild, channel, ticket, actor, reason, closedAt = null }) {
  const { channel: logs, error } = await getLogsChannel(guild);
  if (!logs) {
    await logAction(guild, { title: '⚠️ Transcript delivery failed', color: COLORS.DANGER, description: error, channelId: channel.id, userId: actor.id }).catch(() => {});
    return { ok: false, error: 'LOGS_UNAVAILABLE', userMessage: `The transcript could not be delivered: ${error}` };
  }

  let result;
  try {
    result = await generate({ guild, channel, ticket, closedAt });
  } catch (e) {
    warn('ticket', `Transcript generation failed: ${e.stack ?? e.message}`);
    await logAction(guild, { title: '⚠️ Transcript generation failed', color: COLORS.DANGER, description: clip(e.message, 300), channelId: channel.id, userId: actor.id });
    return { ok: false, error: 'GENERATION_FAILED', userMessage: 'The transcript could not be generated. Please try again in a moment.' };
  }

  try {
    const summary = new EmbedBuilder()
      .setTitle(`📄 Transcript — #${channel.name}`)
      .setColor(COLORS.PRIMARY)
      .addFields(
        { name: 'Category', value: clip(ticket.optionLabel, 1024), inline: true },
        { name: 'Creator', value: `<@${ticket.creatorId}>`, inline: true },
        { name: reason === 'close' ? 'Closed by' : 'Requested by', value: `<@${actor.id}>`, inline: true },
        { name: 'Messages', value: String(result.messageCount), inline: true },
        { name: 'Files', value: String(result.files.length), inline: true },
        { name: 'Ticket', value: `#${String(ticket.number).padStart(3, '0')}`, inline: true },
      )
      .setTimestamp(new Date());
    if (result.truncated) summary.setFooter({ text: 'History exceeded the configured message limit; the oldest messages are omitted.' });
    if (result.files.length > 1) summary.setDescription(`The conversation was split into ${result.files.length} files to fit Discord's upload limit.`);

    for (let i = 0; i < result.files.length; i++) {
      const f = result.files[i];
      await logs.send({
        embeds: i === 0 ? [summary] : [],
        content: i === 0 ? undefined : `Transcript part ${i + 1}/${result.files.length} for #${channel.name}`,
        files: [new AttachmentBuilder(f.buffer, { name: f.name })],
        allowedMentions: NO_MENTIONS,
      });
    }
  } catch (e) {
    warn('ticket', `Transcript delivery failed: ${e.message}`);
    await logAction(guild, { title: '⚠️ Transcript delivery failed', color: COLORS.DANGER, description: clip(e.message, 300), channelId: channel.id, userId: actor.id });
    return { ok: false, error: 'DELIVERY_FAILED', userMessage: 'The transcript was generated but could not be sent to the logs channel.' };
  }

  await ticketStore.update(channel.id, (t) => {
    t.transcriptCount = (t.transcriptCount ?? 0) + 1;
    t.lastTranscriptAt = Date.now();
  });
  await ticketStore.addEvent(channel.id, { type: 'transcript', userId: actor.id, userTag: actor.user.username });
  return { ok: true, messageCount: result.messageCount, parts: result.files.length };
}

module.exports = { generate, generateAndDeliver, collectMessages, normalizeMessage, uploadLimit };
