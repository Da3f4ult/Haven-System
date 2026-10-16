const { info, ok, err } = require('./utils');

function parseCommand(message, prefix, commands) {
  if (message.author.bot) return null;
  if (!message.content.startsWith(prefix)) return null;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const name = args.shift().toLowerCase();

  const command = commands.get(name);
  if (!command) return null;

  return { name, args, command };
}

async function runCommand({ name, args, command }, message, client) {
  info('command', `\x1b[1m${name}\x1b[0m \x1b[2mby ${message.author.tag}\x1b[0m`);
  try {
    await command.execute(message, args, client);
    ok('command', `\x1b[1m${name}\x1b[0m completed`);
  } catch (e) {
    err('command', `\x1b[1m${name}\x1b[0m failed: ${e.message}`);
    console.error(e);
    message.reply('Something went wrong while running that command.').catch(() => {});
  }
}

module.exports = { parseCommand, runCommand };