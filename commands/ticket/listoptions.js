const { SlashCommandSubcommandBuilder } = require('discord.js');
const { requireOwner } = require('../../src/ticket/utils/guards');
const { EPHEMERAL } = require('../../src/ticket/utils/replies');
const { optionsPage } = require('../../src/ticket/handlers/ui');

module.exports = {
  data: new SlashCommandSubcommandBuilder().setName('listoptions').setDescription('List all configured ticket categories'),

  async execute(interaction) {
    if (!(await requireOwner(interaction))) return;
    await interaction.reply({ ...optionsPage(1), flags: EPHEMERAL, allowedMentions: { parse: [] } });
  },
};
