'use strict';

const { ChannelType } = require('discord.js');
const { isValidSnowflake } = require('./validation');
const { BOT_PERMISSIONS } = require('../constants');

const clip = (str, max) => (str.length > max ? `${str.slice(0, max - 1)}…` : str);

async function fetchChannelSafe(guild, id) {
  if (!isValidSnowflake(id)) return null;
  return guild.channels.cache.get(id) ?? (await guild.channels.fetch(id).catch(() => null));
}

async function fetchRoleSafe(guild, id) {
  if (!isValidSnowflake(id)) return null;
  return guild.roles.cache.get(id) ?? (await guild.roles.fetch(id).catch(() => null));
}

async function fetchMemberSafe(guild, id) {
  if (!isValidSnowflake(id)) return null;
  return guild.members.cache.get(id) ?? (await guild.members.fetch(id).catch(() => null));
}

/** @returns {string[]} names of required permissions the bot lacks in `channel` (or guild-wide). */
function missingBotPermissions(guild, channel = null, required = Object.keys(BOT_PERMISSIONS)) {
  const me = guild.members.me;
  if (!me) return required;
  const perms = channel ? channel.permissionsFor(me) : me.permissions;
  if (!perms) return required;
  return required.filter((name) => !perms.has(BOT_PERMISSIONS[name]));
}

function buildTicketChannelName(option, number) {
  const base = option.id.replace(/_/g, '-').slice(0, 60);
  return `${base}-${String(number).padStart(3, '0')}`;
}

const isCategory = (channel) => channel?.type === ChannelType.GuildCategory;

module.exports = {
  clip,
  fetchChannelSafe,
  fetchRoleSafe,
  fetchMemberSafe,
  missingBotPermissions,
  buildTicketChannelName,
  isCategory,
};
