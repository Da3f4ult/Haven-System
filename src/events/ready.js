const { ok, info, c } = require('../utils');
const settings = require('../../settings.json');

module.exports = {
  name: 'clientReady',
  once: true,
  execute(client) {
    console.log('');
    ok('bot', `${c.bold}${client.user.tag}${c.reset} is online`);
    info('bot', `Serving ${c.bold}${client.guilds.cache.size}${c.reset} guild(s)`);
    info('bot', `Prefix: ${c.bold}${settings.prefix || '!'}${c.reset}`);
    console.log('');
  },
};