'use strict';

const commandHandler = require('./handlers/commandHandler');
const buttonHandler = require('./handlers/buttonHandler');
const selectMenuHandler = require('./handlers/selectMenuHandler');
const modalHandler = require('./handlers/modalHandler');
const optionService = require('./services/optionService');
const ticketStore = require('./services/ticketStore');
const ticketService = require('./services/ticketService');
const { validateTicketSettings } = require('./config');
const { parseCustomId } = require('./utils/customId');
const { safeReply, fail } = require('./utils/replies');
const { warn, err: logError, info } = require('../utils');

/**
 * Single entry point called by src/events/interactionCreate.js.
 * @returns {Promise<boolean>} true when the interaction belonged to the ticket system
 */
async function handleInteraction(client, interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName !== 'ticket') return false;
      if (!interaction.inGuild()) return void (await safeReply(interaction, fail('Use this command inside a server.')));
      await commandHandler.handleCommand(interaction);
      return true;
    }
    if (interaction.isAutocomplete()) {
      if (interaction.commandName !== 'ticket') return false;
      await commandHandler.handleAutocomplete(interaction);
      return true;
    }

    const isComponent = interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit();
    if (!isComponent || !String(interaction.customId).startsWith('ticket:')) return false;

    const parsed = parseCustomId(interaction.customId);
    if (!parsed) {
      await safeReply(interaction, fail('This component is invalid or outdated.'));
      return true;
    }
    if (!interaction.inGuild()) {
      await safeReply(interaction, fail('Tickets only work inside a server.'));
      return true;
    }

    if (interaction.isButton()) await buttonHandler.handle(interaction, parsed);
    else if (interaction.isStringSelectMenu()) await selectMenuHandler.handle(interaction, parsed);
    else await modalHandler.handle(interaction, parsed);
    return true;
  } catch (e) {
    logError('ticket', `Unhandled interaction error: ${e.stack ?? e}`);
    if (typeof interaction.isRepliable === 'function' && interaction.isRepliable()) {
      await safeReply(interaction, fail('Something went wrong while processing that. Please try again.'));
    }
    return true;
  }
}

/** Called once on startup: reports configuration problems and heals stale state. */
async function initTickets(client) {
  for (const problem of validateTicketSettings()) warn('ticket', problem);
  const loadError = optionService.getLoadError();
  if (loadError) warn('ticket', loadError);

  for (const t of ticketStore.list()) {
    if (t.status === 'closing') await ticketStore.update(t.channelId, { status: 'open' }); // crashed mid-close
  }
  for (const guild of client.guilds.cache.values()) await ticketService.reconcileGuild(guild).catch(() => {});
  info('ticket', `Ticket system ready (${optionService.getEnabledOptions().length} enabled categories).`);
}

module.exports = { handleInteraction, initTickets };
