'use strict';

const { ChannelType, MessageFlags, OverwriteType, PermissionFlagsBits: P } = require('discord.js');
const optionService = require('./optionService');
const ticketStore = require('./ticketStore');
const transcriptService = require('./transcriptService');
const { logAction } = require('./logService');
const { buildTicketPayload, buildTicketComponents } = require('../channelComponent');
const { getSettings, getTicketSettings } = require('../config');
const { COLORS, LIMITS, PARTICIPANT_ALLOW } = require('../constants');
const { KeyedQueue, TryLock, BUSY } = require('../utils/mutex');
const { isOwner, canManageTicket, canCloseTicket, isStaff } = require('../utils/permissions');
const { isValidSnowflake } = require('../utils/validation');
const {
  buildTicketChannelName, fetchChannelSafe, fetchMemberSafe, fetchRoleSafe, missingBotPermissions, isCategory, clip,
} = require('../utils/channelUtils');
const { NO_MENTIONS } = require('../utils/replies');
const { warn } = require('../../utils');

const createLock = new TryLock(); // one creation per user at a time
const claimQueue = new KeyedQueue(); // serial claim/release per ticket
const busyLock = new TryLock(); // close / transcript per ticket

const res = (ok, message, extra = {}) => ({ ok, message, ...extra });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = (member) => member?.user?.username ?? 'unknown';

// ----------------------------------------------------------------- helpers

/** Drops records whose channel no longer exists (deleted manually). */
async function reconcileGuild(guild) {
  for (const t of ticketStore.list()) {
    if (t.guildId !== guild.id || t.status === 'closed') continue;
    const channel = await fetchChannelSafe(guild, t.channelId);
    if (!channel) await ticketStore.remove(t.channelId);
  }
}

function getOpenTicket(channelId, guildId) {
  const t = ticketStore.get(channelId);
  if (!t || t.guildId !== guildId) return { error: 'This channel is not a recognized ticket.' };
  if (t.status === 'closed') return { error: 'This ticket is already closed.' };
  return { ticket: t };
}

/** Re-renders the ticket interface message (claim state, disabled buttons). */
async function refreshInterface(channel, ticket, { disabled = false, closing = false } = {}) {
  if (!ticket.interfaceMessageId) return false;
  const message = await channel.messages.fetch(ticket.interfaceMessageId).catch(() => null);
  if (!message?.editable) return false;
  const attachment = message.attachments.first();
  const imageUrl = attachment ? `attachment://${attachment.name}` : ticket.imageUrl ?? null;
  await message.edit({
    components: buildTicketComponents({ ticket, imageUrl, disabled, closing }),
    flags: MessageFlags.IsComponentsV2,
  });
  return true;
}

// ----------------------------------------------------------------- creation

/**
 * Creates a ticket for `member` in the category identified by `optionId`.
 * @returns {Promise<{ ok: boolean, message: string, channel?: import('discord.js').TextChannel }>}
 */
async function createTicket({ client, guild, member, optionId }) {
  if (typeof optionId !== 'string' || !/^[a-z0-9_]{1,50}$/.test(optionId)) return res(false, 'That category is invalid.');

  const outcome = await createLock.run(`${guild.id}:${member.id}`, async () => {
    const option = optionService.getOptionById(optionId);
    if (!option || !option.enabled) return res(false, 'That category is no longer available. Please pick another one.');

    // Validate Discord resources
    const category = await fetchChannelSafe(guild, option.categoryId);
    const staffRole = await fetchRoleSafe(guild, option.staffRoleId);
    const problems = [];
    if (!isCategory(category)) problems.push('the configured Discord category no longer exists');
    if (!staffRole || staffRole.id === guild.id) problems.push('the configured staff role no longer exists');
    if (!problems.length) {
      const missing = missingBotPermissions(guild, category);
      if (missing.length) problems.push(`the bot is missing permissions (${missing.join(', ')})`);
    }
    if (problems.length) {
      await logAction(guild, { title: '⚠️ Ticket creation blocked', color: COLORS.WARNING, userId: member.id, description: `Category **${option.label}** (\`${option.id}\`): ${problems.join('; ')}.` });
      return res(false, 'This category is not configured correctly right now. An administrator has been notified.');
    }

    // Limits (reconcile first so manually deleted channels do not count)
    await reconcileGuild(guild);
    const open = ticketStore.listOpenByCreator(guild.id, member.id);
    const globalMax = getTicketSettings().limits.maxOpenTicketsPerUser;
    if (open.length >= globalMax) {
      return res(false, `You already have ${open.length} open ticket(s) (limit: ${globalMax}): ${open.map((t) => `<#${t.channelId}>`).join(', ')}`);
    }
    if (option.maxOpenTicketsPerUser) {
      const inCategory = open.filter((t) => t.optionId === option.id);
      if (inCategory.length >= option.maxOpenTicketsPerUser) {
        return res(false, `You already have an open **${option.label}** ticket: ${inCategory.map((t) => `<#${t.channelId}>`).join(', ')}`);
      }
    }

    // Create channel
    const number = await ticketStore.nextNumber();
    const ownerRoleId = getTicketSettings().ownerRoleId;
    const ownerRole = isValidSnowflake(ownerRoleId) ? await fetchRoleSafe(guild, ownerRoleId) : null;

    const overwrites = [
      { id: guild.id, type: OverwriteType.Role, deny: [P.ViewChannel] },
      { id: member.id, type: OverwriteType.Member, allow: PARTICIPANT_ALLOW },
      { id: staffRole.id, type: OverwriteType.Role, allow: PARTICIPANT_ALLOW },
      { id: client.user.id, type: OverwriteType.Member, allow: [...PARTICIPANT_ALLOW, P.ManageChannels, P.ManageRoles] },
    ];
    if (ownerRole && ownerRole.id !== guild.id && ownerRole.id !== staffRole.id) {
      overwrites.push({ id: ownerRole.id, type: OverwriteType.Role, allow: PARTICIPANT_ALLOW });
    }

    let channel;
    try {
      channel = await guild.channels.create({
        name: buildTicketChannelName(option, number),
        type: ChannelType.GuildText,
        parent: category.id,
        topic: clip(`Ticket #${String(number).padStart(3, '0')} • ${option.label} • Creator: ${member.user.username} (${member.id})`, 1024),
        permissionOverwrites: overwrites,
        reason: `Ticket #${number} created by ${member.user.username}`,
      });
    } catch (e) {
      warn('ticket', `Channel creation failed: ${e.message}`);
      const full = /maximum number of channels/i.test(e.message);
      return res(false, full ? 'This category is full. Please try again later or contact staff.' : 'The ticket channel could not be created. Please try again or contact staff.');
    }

    const ticket = {
      channelId: channel.id,
      guildId: guild.id,
      number,
      optionId: option.id,
      optionLabel: option.label,
      staffRoleId: staffRole.id,
      creatorId: member.id,
      creatorTag: member.user.username,
      status: 'open',
      claimedBy: null,
      claimedAt: null,
      interfaceMessageId: null,
      imageUrl: null,
      addedUsers: [],
      createdAt: Date.now(),
      closedAt: null,
      closedBy: null,
      transcriptCount: 0,
      lastTranscriptAt: 0,
      events: [],
    };
    await ticketStore.create(ticket);

    try {
      const { payload, imageUrl } = buildTicketPayload({ ticket, option });
      const sent = await channel.send({ ...payload, allowedMentions: { users: [member.id], roles: [staffRole.id] } });
      await ticketStore.update(channel.id, { interfaceMessageId: sent.id, imageUrl });
    } catch (e) {
      warn('ticket', `Ticket interface failed: ${e.message}`);
      await channel.send({ content: `Welcome <@${member.id}>! <@&${staffRole.id}> will assist you shortly. Please describe your issue.`, allowedMentions: { users: [member.id], roles: [staffRole.id] } }).catch(() => {});
    }

    await logAction(guild, {
      title: '🎫 Ticket created',
      color: COLORS.SUCCESS,
      userId: member.id,
      channelId: channel.id,
      fields: [
        { name: 'Category', value: option.label, inline: true },
        { name: 'Staff role', value: `<@&${staffRole.id}>`, inline: true },
        { name: 'Ticket', value: `#${String(number).padStart(3, '0')}`, inline: true },
      ],
    });
    return res(true, `Your ticket has been created: <#${channel.id}>`, { channel });
  });

  if (outcome === BUSY) return res(false, 'Your ticket is already being created — please wait a moment.');
  return outcome;
}

// ----------------------------------------------------------------- claim

/** Claims the ticket, or releases it when the actor already holds / owns the claim. */
function toggleClaim({ guild, channel, actor, forceRelease = false, claimOnly = false }) {
  return claimQueue.run(channel.id, async () => {
    const { ticket, error } = getOpenTicket(channel.id, guild.id);
    if (error) return res(false, error);
    const settings = getSettings();
    if (!canManageTicket(actor, ticket, settings)) return res(false, 'Only staff members of this ticket category can claim tickets.');

    if (!ticket.claimedBy) {
      if (forceRelease) return res(false, 'This ticket is not claimed.');
      await ticketStore.update(channel.id, { claimedBy: actor.id, claimedAt: Date.now() });
      await ticketStore.addEvent(channel.id, { type: 'claim', userId: actor.id, userTag: tag(actor) });
      await refreshInterface(channel, ticketStore.get(channel.id)).catch((e) => warn('ticket', e.message));
      await channel.send({ content: `🙋 <@${actor.id}> has claimed this ticket.`, allowedMentions: NO_MENTIONS }).catch(() => {});
      await logAction(guild, { title: '🙋 Ticket claimed', color: COLORS.WARNING, userId: actor.id, channelId: channel.id });
      return res(true, 'You claimed this ticket.');
    }

    if (ticket.claimedBy !== actor.id && !isOwner(actor, settings)) {
      return res(false, `This ticket is already claimed by <@${ticket.claimedBy}>. Only they (or the ticket owner role) can release it.`);
    }
    if (claimOnly) return res(false, 'You already claimed this ticket. Use the **Release Claim** button or `/ticket claim release:true` to release it.');

    const previous = ticket.claimedBy;
    await ticketStore.update(channel.id, { claimedBy: null, claimedAt: null });
    await ticketStore.addEvent(channel.id, { type: 'release', userId: actor.id, userTag: tag(actor) });
    await refreshInterface(channel, ticketStore.get(channel.id)).catch((e) => warn('ticket', e.message));
    await channel.send({ content: `🔓 <@${actor.id}> released the claim${previous !== actor.id ? ` held by <@${previous}>` : ''}.`, allowedMentions: NO_MENTIONS }).catch(() => {});
    await logAction(guild, { title: '🔓 Claim released', color: COLORS.NEUTRAL, userId: actor.id, channelId: channel.id, description: previous !== actor.id ? `Claim previously held by <@${previous}>.` : undefined });
    return res(true, 'The claim was released.');
  });
}

// ----------------------------------------------------------------- participants

async function addUser({ guild, channel, actor, targetId }) {
  if (!isValidSnowflake(targetId)) return res(false, 'That is not a valid Discord user ID.');
  const { ticket, error } = getOpenTicket(channel.id, guild.id);
  if (error) return res(false, error);
  if (!canManageTicket(actor, ticket, getSettings())) return res(false, 'Only ticket staff can add users.');

  const target = await fetchMemberSafe(guild, targetId);
  if (!target) return res(false, 'That user is not a member of this server.');
  if (target.user.bot) return res(false, 'Bots cannot be added to tickets.');
  if (target.id === ticket.creatorId) return res(false, 'The ticket creator already has access.');

  const existing = channel.permissionOverwrites.cache.get(target.id);
  if (existing?.allow.has(P.ViewChannel) || channel.permissionsFor(target)?.has(P.ViewChannel)) {
    return res(false, `${target.displayName} already has access to this ticket.`);
  }

  try {
    await channel.permissionOverwrites.edit(target.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true }, { type: OverwriteType.Member, reason: `Added by ${tag(actor)}` });
  } catch (e) {
    warn('ticket', `addUser failed: ${e.message}`);
    return res(false, 'I could not update the channel permissions. Check that I have Manage Channels and Manage Permissions.');
  }

  await ticketStore.update(channel.id, (t) => {
    if (!t.addedUsers.includes(target.id)) t.addedUsers.push(target.id);
  });
  await ticketStore.addEvent(channel.id, { type: 'add_user', userId: actor.id, userTag: tag(actor), targetId: target.id, targetTag: tag(target) });
  await channel.send({ content: `➕ <@${target.id}> was added to this ticket by <@${actor.id}>.`, allowedMentions: { users: [target.id] } }).catch(() => {});
  await logAction(guild, { title: '➕ User added to ticket', color: COLORS.SUCCESS, userId: actor.id, channelId: channel.id, fields: [{ name: 'Added', value: `<@${target.id}> (\`${target.id}\`)`, inline: true }] });
  return res(true, `${target.displayName} was added to the ticket.`);
}

/** IDs of users who have an explicit (removable) access overwrite. */
function removableUserIds(client, channel, ticket) {
  return [...channel.permissionOverwrites.cache.values()]
    .filter((o) => o.type === OverwriteType.Member && o.id !== client.user.id && o.id !== ticket.creatorId && o.allow.has(P.ViewChannel))
    .map((o) => o.id)
    .sort();
}

/** @returns {Promise<{ total: number, pages: number, page: number, entries: {id:string,label:string,description:string}[] }>} */
async function listRemovableUsers({ client, guild, channel, ticket, page = 1 }) {
  const ids = removableUserIds(client, channel, ticket);
  const pages = Math.max(1, Math.ceil(ids.length / LIMITS.SELECT_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const slice = ids.slice((current - 1) * LIMITS.SELECT_PAGE_SIZE, current * LIMITS.SELECT_PAGE_SIZE);
  const entries = await Promise.all(
    slice.map(async (id) => {
      const m = await fetchMemberSafe(guild, id);
      return m
        ? { id, label: clip(`${m.displayName} (@${m.user.username})`, 100), description: `ID: ${id}` }
        : { id, label: 'Former member (left the server)', description: `ID: ${id}` };
    }),
  );
  return { total: ids.length, pages, page: current, entries };
}

async function removeUser({ client, guild, channel, actor, targetId }) {
  if (!isValidSnowflake(targetId)) return res(false, 'That is not a valid Discord user ID.');
  const { ticket, error } = getOpenTicket(channel.id, guild.id);
  if (error) return res(false, error);
  if (!canManageTicket(actor, ticket, getSettings())) return res(false, 'Only ticket staff can remove users.');
  if (targetId === ticket.creatorId) return res(false, 'The ticket creator cannot be removed.');
  if (targetId === client.user.id) return res(false, 'The bot cannot be removed from a ticket.');

  const member = await fetchMemberSafe(guild, targetId);
  const overwrite = channel.permissionOverwrites.cache.get(targetId);

  if (!overwrite || overwrite.type !== OverwriteType.Member || !overwrite.allow.has(P.ViewChannel)) {
    if (member && channel.permissionsFor(member)?.has(P.ViewChannel)) {
      const why = isStaff(member, ticket) ? 'they are part of the ticket staff team' : 'their access comes from a role';
      return res(false, `${member.displayName} cannot be removed individually because ${why}. Role-based access is managed with roles, not per ticket.`);
    }
    return res(false, 'That user does not have individual access to this ticket.');
  }

  try {
    await channel.permissionOverwrites.delete(targetId, `Removed by ${tag(actor)}`);
  } catch (e) {
    warn('ticket', `removeUser failed: ${e.message}`);
    return res(false, 'I could not update the channel permissions.');
  }

  await ticketStore.update(channel.id, (t) => {
    t.addedUsers = t.addedUsers.filter((id) => id !== targetId);
  });
  await ticketStore.addEvent(channel.id, { type: 'remove_user', userId: actor.id, userTag: tag(actor), targetId, targetTag: member ? tag(member) : undefined });
  await channel.send({ content: `➖ <@${targetId}> was removed from this ticket by <@${actor.id}>.`, allowedMentions: NO_MENTIONS }).catch(() => {});
  await logAction(guild, { title: '➖ User removed from ticket', color: COLORS.WARNING, userId: actor.id, channelId: channel.id, fields: [{ name: 'Removed', value: `<@${targetId}> (\`${targetId}\`)`, inline: true }] });

  const stillAccess = member && channel.permissionsFor(member)?.has(P.ViewChannel);
  return res(true, `${member?.displayName ?? targetId} was removed from the ticket.${stillAccess ? ' (They can still see it through a role.)' : ''}`);
}

// ----------------------------------------------------------------- transcript

async function saveTranscript({ guild, channel, actor }) {
  const { ticket, error } = getOpenTicket(channel.id, guild.id);
  if (error) return res(false, error);
  if (!canManageTicket(actor, ticket, getSettings())) return res(false, 'Only ticket staff can save transcripts.');
  if (!getTicketSettings().transcript.enabled) return res(false, 'Transcripts are disabled in settings.json.');

  const out = await busyLock.run(channel.id, async () => {
    const fresh = ticketStore.get(channel.id);
    if (!fresh || fresh.status !== 'open') return res(false, 'This ticket is being closed.');
    if (Date.now() - (fresh.lastTranscriptAt ?? 0) < LIMITS.TRANSCRIPT_COOLDOWN_MS) {
      return res(false, 'A transcript was just saved. Please wait a few seconds before requesting another.');
    }
    const r = await transcriptService.generateAndDeliver({ guild, channel, ticket: fresh, actor, reason: 'manual' });
    return r.ok ? res(true, `Transcript saved (${r.messageCount} messages${r.parts > 1 ? `, ${r.parts} files` : ''}) and sent to the logs channel.`) : res(false, r.userMessage);
  });
  return out === BUSY ? res(false, 'An operation on this ticket is already in progress.') : out;
}

// ----------------------------------------------------------------- close

/**
 * Safe close workflow: lock -> mark closing -> transcript delivered -> record -> delete/archive.
 * The channel is never destroyed unless the transcript was delivered (or the owner role forces it).
 * @returns {Promise<{ ok: boolean, message: string, retryable?: boolean }>}
 */
async function closeTicket({ client, guild, channel, actor, skipTranscript = false }) {
  const settings = getSettings();
  const ticketSettings = settings.ticket;
  const { ticket, error } = getOpenTicket(channel.id, guild.id);
  if (error) return res(false, error);
  if (!canCloseTicket(actor, ticket, settings)) return res(false, 'You are not allowed to close this ticket.');
  if (skipTranscript && !isOwner(actor, settings)) return res(false, 'Only the ticket owner role can close a ticket without a transcript.');

  const outcome = await busyLock.run(channel.id, async () => {
    const current = ticketStore.get(channel.id);
    if (!current || current.status !== 'open') return res(false, 'This ticket is already being closed.');

    await ticketStore.update(channel.id, { status: 'closing' });
    await refreshInterface(channel, ticketStore.get(channel.id), { disabled: true, closing: true }).catch(() => {});

    const closedAt = Date.now();
    if (ticketSettings.transcript.enabled && !skipTranscript) {
      const t = await transcriptService.generateAndDeliver({ guild, channel, ticket: ticketStore.get(channel.id), actor, reason: 'close', closedAt });
      if (!t.ok) {
        await ticketStore.update(channel.id, { status: 'open' });
        await refreshInterface(channel, ticketStore.get(channel.id)).catch(() => {});
        await channel.send({ content: '⚠️ This ticket could not be closed because its transcript could not be saved. Staff can retry.', allowedMentions: NO_MENTIONS }).catch(() => {});
        return res(false, `${t.userMessage}\nThe ticket was **not** closed, so nothing was lost.`, { retryable: true });
      }
    }

    const final = ticketStore.get(channel.id);
    await ticketStore.addEvent(channel.id, { type: 'close', userId: actor.id, userTag: tag(actor) });
    await logAction(guild, {
      title: '🔒 Ticket closed',
      color: COLORS.DANGER,
      userId: actor.id,
      channelId: channel.id,
      fields: [
        { name: 'Creator', value: `<@${final.creatorId}>`, inline: true },
        { name: 'Category', value: final.optionLabel, inline: true },
        { name: 'Claimed by', value: final.claimedBy ? `<@${final.claimedBy}>` : 'Nobody', inline: true },
        { name: 'Transcript', value: skipTranscript ? 'Skipped (owner override)' : ticketSettings.transcript.enabled ? 'Delivered' : 'Disabled', inline: true },
        { name: 'Opened', value: `<t:${Math.floor(final.createdAt / 1000)}:R>`, inline: true },
      ],
    });

    return finalizeClose({ channel, guild, actor, closedAt, policy: ticketSettings.closePolicy, delay: ticketSettings.closeDelaySeconds });
  });

  return outcome === BUSY ? res(false, 'This ticket is already being closed.') : outcome;
}

async function finalizeClose({ channel, guild, actor, closedAt, policy, delay }) {
  await ticketStore.update(channel.id, { status: 'closed', closedAt, closedBy: actor.id });

  if (policy === 'archive') {
    try {
      for (const o of channel.permissionOverwrites.cache.values()) {
        if (o.type === OverwriteType.Member && o.id !== channel.client.user.id) await channel.permissionOverwrites.delete(o.id, 'Ticket archived');
      }
      if (!channel.name.startsWith('closed-')) await channel.setName(`closed-${channel.name}`.slice(0, 100));
      await refreshInterface(channel, ticketStore.get(channel.id), { disabled: true }).catch(() => {});
      await channel.send({ content: `🔒 Ticket closed by <@${actor.id}>. Access for the ticket creator and invited users was removed; staff can still read this channel.`, allowedMentions: NO_MENTIONS }).catch(() => {});
      return res(true, 'Ticket closed and archived.');
    } catch (e) {
      warn('ticket', `Archive failed: ${e.message}`);
      return res(true, 'The transcript was saved, but I could not fully archive the channel. Please finish manually.');
    }
  }

  const seconds = Math.max(0, Math.min(60, Number(delay) || 0));
  await channel.send({ content: `🔒 Ticket closed by <@${actor.id}>. This channel will be deleted in ${seconds} second(s).`, allowedMentions: NO_MENTIONS }).catch(() => {});
  if (seconds) await sleep(seconds * 1000);
  try {
    await channel.delete(`Ticket closed by ${tag(actor)}`);
    await ticketStore.remove(channel.id);
    return res(true, 'Ticket closed.');
  } catch (e) {
    warn('ticket', `Channel delete failed: ${e.message}`);
    await refreshInterface(channel, ticketStore.get(channel.id), { disabled: true }).catch(() => {});
    return res(true, 'The transcript was saved, but I could not delete the channel. Please delete it manually (I need Manage Channels).');
  }
}

module.exports = {
  createTicket, toggleClaim, addUser, removeUser, listRemovableUsers, saveTranscript, closeTicket,
  refreshInterface, reconcileGuild, getOpenTicket,
};
