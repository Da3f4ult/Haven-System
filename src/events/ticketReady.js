const { initTickets } = require('../ticket');
const { err } = require('../utils');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    try {
      await initTickets(client);
    } catch (e) {
      err('ticket', `Initialization failed: ${e.message}`);
    }
  },
};
