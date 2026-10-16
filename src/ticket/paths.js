'use strict';

const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TICKET_DIR = __dirname;

module.exports = Object.freeze({
  ROOT,
  TICKET_DIR,
  PUBLIC_DIR: path.join(ROOT, 'public'),
  SETTINGS_PATH: path.join(ROOT, 'settings.json'),
  OPTIONS_PATH: process.env.TICKET_OPTIONS_PATH || path.join(TICKET_DIR, 'options.json'),
  TICKETS_PATH: process.env.TICKET_STORE_PATH || path.join(TICKET_DIR, 'tickets.json'),
  TEMPLATES_DIR: path.join(TICKET_DIR, 'templates'),
  COMMANDS_DIR: path.join(ROOT, 'commands', 'ticket'),
});
