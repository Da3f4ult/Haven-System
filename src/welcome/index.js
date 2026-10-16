const { AttachmentBuilder, MessageFlags } = require('discord.js');
const { generateWelcomeImage } = require('./canva');
const { buildWelcomeComponents } = require('./components');
const settings = require('../../settings.json');

const ATTACHMENT_NAME = 'welcome.png';

/**
 * @param {import('discord.js').GuildMember} member
 * @returns {Promise<AttachmentBuilder>}
 */
async function buildWelcomeAttachment(member) {
  const avatarURL = member.user.displayAvatarURL({
    extension: 'png',
    size: 512,
    forceStatic: true,
  });

  const buffer = await generateWelcomeImage(avatarURL);
  return new AttachmentBuilder(buffer, { name: ATTACHMENT_NAME });
}

/**
 * @param {import('discord.js').GuildMember} member
 */
async function buildWelcomePayload(member) {
  const attachment = await buildWelcomeAttachment(member);
  const components = buildWelcomeComponents(
    member,
    settings.welcome ?? {},
    ATTACHMENT_NAME,
  );

  return {
    components,
    files: [attachment],
    flags: MessageFlags.IsComponentsV2,
  };
}

/**
 * @param {import('discord.js').GuildMember} member
 */
async function sendWelcome(member) {
  const channelId = settings.welcome?.channelId;
  if (!channelId) {
    console.warn('[welcome] No welcome.channelId set in settings.json');
    return;
  }

  const channel =
    member.guild.channels.cache.get(channelId) ||
    (await member.guild.channels.fetch(channelId).catch(() => null));

  if (!channel?.isTextBased()) {
    console.warn(`[welcome] Channel ${channelId} not found or not text-based.`);
    return;
  }

  const payload = await buildWelcomePayload(member);
  await channel.send(payload);
}

module.exports = { sendWelcome, buildWelcomeAttachment, buildWelcomePayload };