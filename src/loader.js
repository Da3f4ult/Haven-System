const fs   = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const { info, err } = require('./utils');


function loadCommands(client) {
  client.commands = new Collection();

  const dir = path.join(__dirname, '..', 'commands');
  if (!fs.existsSync(dir)) return client.commands;

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    try {
      const command = require(path.join(dir, file));
      if (command?.name) {
        client.commands.set(command.name, command);
        info('commands', `Loaded \x1b[35m${command.name}\x1b[0m`);
      }
    } catch (e) {
      err('commands', `Failed to load ${file}: ${e.message}`);
    }
  }

  return client.commands;
}


function loadEvents(client) {
  const dir = path.join(__dirname, 'events');
  if (!fs.existsSync(dir)) return;

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    try {
      const event = require(path.join(dir, file));
      if (event?.name && typeof event.execute === 'function') {
        const method = event.once ? 'once' : 'on';
        client[method](event.name, (...args) => event.execute(client, ...args));
        info('events', `Bound \x1b[35m${event.name}\x1b[0m${event.once ? ' (once)' : ''}`);
      }
    } catch (e) {
      err('events', `Failed to load ${file}: ${e.message}`);
    }
  }
}

module.exports = { loadCommands, loadEvents };