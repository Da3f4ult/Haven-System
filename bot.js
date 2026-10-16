require('dotenv').config();

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { loadCommands, loadEvents } = require('./src/loader');
const { err } = require('./src/utils');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.GuildMember, Partials.User],
});

loadCommands(client);
loadEvents(client);

process.on('unhandledRejection', (reason) => err('process', `Unhandled rejection: ${reason}`));
process.on('uncaughtException',  (e)      => { err('process', `Uncaught exception: ${e.message}`); console.error(e); });

client.login(process.env.DISCORD_TOKEN);