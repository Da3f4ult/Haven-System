const { buildWelcomePayload } = require('../src/welcome');

module.exports = {
  name: 'testwelcome',
  description: 'Preview the welcome message using your own avatar.',
  async execute(message) {
    const payload = await buildWelcomePayload(message.member);
    await message.channel.send(payload);
  },
};