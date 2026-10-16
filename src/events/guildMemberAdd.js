const { info, ok, err, c } = require('../utils');
const { sendWelcome } = require('../welcome');

module.exports = {
  name: 'guildMemberAdd',
  async execute(client, member) {
    info('welcome', `${c.bold}${member.user.tag}${c.reset} joined ${c.dim}${member.guild.name}${c.reset}`);
    try {
      await sendWelcome(member);
      ok('welcome', `Sent welcome image for ${c.bold}${member.user.tag}${c.reset}`);
    } catch (e) {
      err('welcome', `Failed for ${c.bold}${member.user.tag}${c.reset}: ${e.message}`);
      console.error(e);
    }
  },
};