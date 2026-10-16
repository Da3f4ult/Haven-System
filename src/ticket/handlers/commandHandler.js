'use strict';

const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('discord.js');
const { COMMANDS_DIR } = require('../paths');
const { safeReply, fail } = require('../utils/replies');

let registry = null;

/** Loads every commands/ticket/*.js once. Each exports { data: SlashCommandSubcommandBuilder, execute, autocomplete? }. */
function loadCommands() {
  if (registry) return registry;
  registry = new Map();
  if (!fs.existsSync(COMMANDS_DIR)) return registry;
  for (const file of fs.readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.js'))) {
    const mod = require(path.join(COMMANDS_DIR, file));
    if (!mod?.data?.name || typeof mod.execute !== 'function') continue;
    registry.set(mod.data.name, mod);
  }
  return registry;
}

/** Builds the single `/ticket` command with every file as a subcommand. */
function buildSlashCommand() {
  const root = new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket system')
    .setContexts(0) // guild only
    .setDefaultMemberPermissions(null);
  for (const cmd of loadCommands().values()) root.addSubcommand(cmd.data);
  return root;
}

async function handleCommand(interaction) {
  const cmd = loadCommands().get(interaction.options.getSubcommand(false));
  if (!cmd) return safeReply(interaction, fail('Unknown ticket command.'));
  return cmd.execute(interaction);
}

async function handleAutocomplete(interaction) {
  const cmd = loadCommands().get(interaction.options.getSubcommand(false));
  if (!cmd?.autocomplete) return interaction.respond([]);
  return cmd.autocomplete(interaction);
}

module.exports = { loadCommands, buildSlashCommand, handleCommand, handleAutocomplete };
