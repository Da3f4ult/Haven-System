const {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ButtonBuilder,
  ButtonStyle,
  SectionBuilder,
} = require('discord.js');

/**
 * @param {import('discord.js').GuildMember} member
 * @param {object} welcome - the `welcome` object from settings.json
 * @returns {ContainerBuilder[]}
 */
function buildWelcomeComponents(member, welcome = {}) {
  const attachmentName = 'welcome.png';
  const serverName = member.guild.name;
  const userMention = `<@${member.id}>`;

  const rulesUrl     = welcome.rulesUrl     ?? 'https://google.com';
  const verifyUrl    = welcome.verifyUrl    ?? 'https://google.com';
  const footer       = welcome.footer       ?? 'Made By Da3f4ult';
  const rulesLabel   = welcome.rulesLabel   ?? 'Rules';
  const rulesText    = welcome.rulesText    ?? '## Read rules';
  const verifyLabel  = welcome.verifyLabel  ?? 'Verify';
  const verifyText   = welcome.verifyText   ?? '## Get Verify ';

  const messageTemplate = welcome.message ?? '# Welcome to "{server}", {user} have fun ';
  const messageText = messageTemplate
    .replaceAll('{server}', serverName)
    .replaceAll('{user}', userMention);

  return [
    new ContainerBuilder()
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL(`attachment://${attachmentName}`),
        ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(messageText),
      )
      .addSectionComponents(
        new SectionBuilder()
          .setButtonAccessory(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel(rulesLabel)
              .setURL(rulesUrl),
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(rulesText),
          ),
      )
      .addSectionComponents(
        new SectionBuilder()
          .setButtonAccessory(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel(verifyLabel)
              .setURL(verifyUrl),
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(verifyText),
          ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# ${footer}`),
      ),
  ];
}

module.exports = { buildWelcomeComponents };