'use strict';

const { PermissionFlagsBits: P } = require('discord.js');

/** Every custom ID used by the ticket system. Format: `ticket:<action>[:<int>]`. */
const IDS = Object.freeze({
  CREATE: 'ticket:create',
  ADD_USER: 'ticket:add_user',
  ADD_USER_MODAL: 'ticket:add_user_modal',
  ADD_USER_INPUT: 'user_id',
  REMOVE_USER: 'ticket:remove_user',
  REMOVE_USER_SELECT: 'ticket:remove_user_select',
  REMOVE_PAGE: 'ticket:remove_page',
  CLAIM: 'ticket:claim',
  CLOSE: 'ticket:close',
  CLOSE_CONFIRM: 'ticket:close_confirm',
  CLOSE_CANCEL: 'ticket:close_cancel',
  CLOSE_RETRY: 'ticket:close_retry',
  CLOSE_FORCE: 'ticket:close_force',
  TRANSCRIPT: 'ticket:transcript',
  LIST_PAGE: 'ticket:list_page',
});

const COLORS = Object.freeze({
  PRIMARY: 0x5865f2,
  SUCCESS: 0x57f287,
  WARNING: 0xfee75c,
  DANGER: 0xed4245,
  NEUTRAL: 0x2b2d31,
});

const LIMITS = Object.freeze({
  MAX_OPTIONS: 25, // Discord select-menu limit
  SELECT_PAGE_SIZE: 25,
  LIST_PAGE_SIZE: 5,
  MAX_EVENTS_PER_TICKET: 300,
  TRANSCRIPT_COOLDOWN_MS: 10_000,
});

/** Permissions the bot needs to run the system. */
const BOT_PERMISSIONS = Object.freeze({
  ViewChannel: P.ViewChannel,
  SendMessages: P.SendMessages,
  ReadMessageHistory: P.ReadMessageHistory,
  AttachFiles: P.AttachFiles,
  EmbedLinks: P.EmbedLinks,
  ManageChannels: P.ManageChannels,
  ManageRoles: P.ManageRoles,
});

/** Permissions granted to the creator / invited users inside a ticket. */
const PARTICIPANT_ALLOW = Object.freeze([
  P.ViewChannel,
  P.SendMessages,
  P.ReadMessageHistory,
  P.AttachFiles,
  P.EmbedLinks,
]);

const DEFAULT_PANEL_IMAGE = 'public/imgs/ticket.png';

module.exports = { IDS, COLORS, LIMITS, BOT_PERMISSIONS, PARTICIPANT_ALLOW, DEFAULT_PANEL_IMAGE };
