'use strict';

const { PermissionFlagsBits } = require('discord.js');

/**
 * Configuration administrator: the guild owner or a member of ticket.ownerRoleId.
 * @param {import('discord.js').GuildMember} member
 * @param {object} settings full settings object (reads settings.ticket.ownerRoleId)
 */
function isOwner(member, settings) {
  if (!member?.guild) return false;
  if (member.id === member.guild.ownerId) return true;
  const roleId = settings?.ticket?.ownerRoleId;
  if (!roleId) return false;
  return member.roles.cache.has(roleId);
}

function isAdministrator(member) {
  return Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator));
}

/**
 * Staff for THIS ticket. Uses the staff role snapshotted when the ticket was created,
 * so editing/removing a category never breaks open tickets.
 */
function isStaff(member, ticket) {
  if (!member || !ticket?.staffRoleId) return false;
  return member.roles.cache.has(ticket.staffRoleId);
}

function isTicketCreator(member, ticket) {
  return Boolean(member && ticket && member.id === ticket.creatorId);
}

/** Staff of the ticket, config owners, or server administrators. */
function canManageTicket(member, ticket, settings) {
  if (!member || !ticket) return false;
  return isStaff(member, ticket) || isOwner(member, settings) || isAdministrator(member);
}

/** Managers may close; creators may close their own ticket unless disabled by policy. */
function canCloseTicket(member, ticket, settings) {
  if (canManageTicket(member, ticket, settings)) return true;
  return settings?.ticket?.creatorCanClose !== false && isTicketCreator(member, ticket);
}

module.exports = { isOwner, isAdministrator, isStaff, isTicketCreator, canManageTicket, canCloseTicket };
