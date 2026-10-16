'use strict';

const fs = require('fs');
const { SETTINGS_PATH } = require('./paths');
const { readJsonSync } = require('./utils/atomicFile');
const { isValidSnowflake } = require('./utils/validation');
const { DEFAULT_PANEL_IMAGE } = require('./constants');
const { warn } = require('../utils');

const TICKET_DEFAULTS = Object.freeze({
  ownerRoleId: '',
  logsChannelId: '',
  panelChannelId: '',
  panelImage: DEFAULT_PANEL_IMAGE,
  closePolicy: 'delete', // 'delete' | 'archive'
  closeDelaySeconds: 5,
  creatorCanClose: true,
  panel: {
    title: 'Support Center',
    description: 'Welcome to our support center. Need help? Open a private ticket and our team will assist you.',
    footer: '',
  },
  transcript: { enabled: true, format: 'html', maxMessages: 20000, embedImages: true },
  limits: { maxOpenTicketsPerUser: 1 },
});

const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v);

function merge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra ?? {})) {
    out[k] = isPlain(v) && isPlain(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

function withDefaults(parsed) {
  const settings = isPlain(parsed) ? { ...parsed } : {};
  settings.ticket = merge(TICKET_DEFAULTS, isPlain(settings.ticket) ? settings.ticket : {});
  return settings;
}

let cache = null; // { mtime, value }
let override = null;

/** Returns settings.json (cached, re-read automatically when the file changes). */
function getSettings() {
  if (override) return override;
  let stat;
  try {
    stat = fs.statSync(SETTINGS_PATH);
  } catch {
    return cache?.value ?? withDefaults({});
  }
  if (!cache || cache.mtime !== stat.mtimeMs) {
    try {
      cache = { mtime: stat.mtimeMs, value: withDefaults(readJsonSync(SETTINGS_PATH)) };
    } catch (e) {
      warn('ticket', `settings.json could not be parsed (${e.message}); keeping previous values.`);
      cache = { mtime: stat.mtimeMs, value: cache?.value ?? withDefaults({}) };
    }
  }
  return cache.value;
}

const getTicketSettings = () => getSettings().ticket;

/** @returns {string[]} human-readable configuration problems */
function validateTicketSettings(settings = getSettings()) {
  const t = settings.ticket;
  const problems = [];
  if (!isValidSnowflake(t.ownerRoleId)) problems.push('ticket.ownerRoleId is missing or not a valid role ID (only the server owner can manage options).');
  if (!isValidSnowflake(t.logsChannelId)) problems.push('ticket.logsChannelId is missing or invalid (transcripts and logs cannot be delivered).');
  if (!isValidSnowflake(t.panelChannelId)) problems.push('ticket.panelChannelId is missing or invalid (the panel cannot be published).');
  if (!['delete', 'archive'].includes(t.closePolicy)) problems.push('ticket.closePolicy must be "delete" or "archive".');
  if (t.transcript?.format && t.transcript.format !== 'html') problems.push('ticket.transcript.format: only "html" is supported.');
  const max = t.limits?.maxOpenTicketsPerUser;
  if (!Number.isInteger(max) || max < 1) problems.push('ticket.limits.maxOpenTicketsPerUser must be a positive integer.');
  return problems;
}

/** Test hook: pass an object to override settings, or null to restore. */
function setOverride(value) {
  override = value ? withDefaults(value) : null;
}

module.exports = { getSettings, getTicketSettings, validateTicketSettings, setOverride, TICKET_DEFAULTS };
