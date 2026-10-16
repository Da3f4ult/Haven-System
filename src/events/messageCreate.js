const settings = require('../../settings.json');
const { parseCommand, runCommand } = require('../middleware');

module.exports = {
  name: 'messageCreate',
  execute(client, message) {
    const prefix = settings.prefix || '!';
    const parsed = parseCommand(message, prefix, client.commands);
    if (!parsed) return;

    runCommand(parsed, message, client);
  },
};