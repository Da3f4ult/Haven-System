const { handleInteraction } = require('../ticket');

// Single interaction router for the ticket system (bound once by loader.loadEvents).
module.exports = {
  name: 'interactionCreate',
  async execute(client, interaction) {
    await handleInteraction(client, interaction);
  },
};
