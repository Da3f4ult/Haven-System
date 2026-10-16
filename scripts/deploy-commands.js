// Registers the /ticket slash command. Run: npm run deploy-commands
// Set GUILD_ID in .env for instant per-server registration (recommended while testing);
// leave it empty to register globally.
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const { buildSlashCommand } = require('../src/ticket/handlers/commandHandler');

(async () => {
  const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
  if (!token) throw new Error('DISCORD_TOKEN (or TOKEN) is missing from .env');

  const rest = new REST({ version: '10' }).setToken(token);
  const app = await rest.get(Routes.oauth2CurrentApplication());
  const body = [buildSlashCommand().toJSON()];
  const guildId = process.env.GUILD_ID;

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(app.id, guildId), { body });
    console.log(`Registered /ticket (${body[0].options.length} subcommands) in guild ${guildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(app.id), { body });
    console.log(`Registered /ticket (${body[0].options.length} subcommands) globally.`);
  }
})().catch((e) => {
  console.error('Failed to register commands:', e.message);
  process.exit(1);
});
