'use strict';
const os = require('os');
const path = require('path');
const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-test-'));
process.env.TICKET_OPTIONS_PATH = path.join(tmp, 'options.json');
process.env.TICKET_STORE_PATH = path.join(tmp, 'tickets.json');

const { ChannelType, OverwriteType, PermissionFlagsBits: P } = require('discord.js');
const { createWorld, FakeMember } = require('./helpers/fakeDiscord');
const config = require('../src/ticket/config');
const optionService = require('../src/ticket/services/optionService');
const ticketStore = require('../src/ticket/services/ticketStore');
const ticketService = require('../src/ticket/services/ticketService');
const { renderMarkdown } = require('../src/ticket/transcript/markdown');
const { renderTranscript } = require('../src/ticket/transcript/renderer');
const { parseCustomId } = require('../src/ticket/utils/customId');
const { parseUserId } = require('../src/ticket/handlers/modalHandler');
const { isValidEmoji, validateImageRef } = require('../src/ticket/utils/validation');
const { resolveLocalImagePath } = require('../src/ticket/utils/media');
const { buildPanelComponents } = require('../src/ticket/component');
const { isOwner, canManageTicket, canCloseTicket } = require('../src/ticket/utils/permissions');

// ------------------------------------------------------------------ pure units
test('custom IDs: valid parse, malformed rejected', () => {
  assert.deepEqual(parseCustomId('ticket:remove_page:3'), { base: 'ticket:remove_page', arg: 3 });
  for (const bad of ['ticket:', 'ticket:x:abc', 'other:claim', 'ticket:claim;DROP', 'ticket:' + 'a'.repeat(40), 5, null]) assert.equal(parseCustomId(bad), null);
});

test('user ID parsing accepts ID and mention only', () => {
  assert.equal(parseUserId(' 123456789012345678 '), '123456789012345678');
  assert.equal(parseUserId('<@!123456789012345678>'), '123456789012345678');
  assert.equal(parseUserId('12345'), null);
  assert.equal(parseUserId('abc'), null);
});

test('emoji + image validation', () => {
  assert.ok(isValidEmoji('🎫') && isValidEmoji('🛠️') && !isValidEmoji('1') && !isValidEmoji('ab'));
  assert.equal(validateImageRef('public/imgs/ticket.png'), null);
  assert.ok(validateImageRef('public/../settings.json'));
  assert.ok(validateImageRef('../../etc/passwd.png'));
  assert.ok(validateImageRef('/etc/passwd.png'));
  assert.ok(validateImageRef('http://evil/x.png'));
});

test('local image resolution blocks traversal, accepts the shipped banner', () => {
  assert.ok(resolveLocalImagePath('public/imgs/ticket.png'));
  assert.equal(resolveLocalImagePath('public/../settings.json'), null);
  assert.equal(resolveLocalImagePath('public/../package.json'), null);
  assert.equal(resolveLocalImagePath('public/imgs'), null);
});

test('markdown renderer escapes HTML and never emits user tags/attributes', () => {
  const evil = [
    '<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '"><svg/onload=alert(1)>',
    '[click](javascript:alert(1))', '[x](https://a.com/"onmouseover="alert(1))', 'https://a.com/"><script>x</script>',
    '**<b>bold</b>**', '`<u>`', '```\n<script>\n```', '<@123456789012345678> <#123456789012345678>', '\uE000999\uE001',
  ].join('\n');
  const html = renderMarkdown(evil, { users: { '123456789012345678': '<img onerror=1>' } });
  assert.ok(!/<script/i.test(html), html);
  assert.ok(!/<img[^>]*onerror/i.test(html));
  assert.ok(!/<svg/i.test(html));
  assert.ok(!/href="javascript:/i.test(html));
  assert.ok(!/<[^>]*\son\w+\s*=/i.test(html), 'no real tag may carry an event-handler attribute');
  assert.ok(![...html.matchAll(/<([a-z0-9]+)/gi)].some(([, t]) => !['div','br','a','strong','em','u','s','code','pre','span','img','blockquote','time'].includes(t.toLowerCase())), 'only whitelisted tags');
  assert.ok(html.includes('&lt;script&gt;'));
});

test('markdown renderer formats common syntax', () => {
  const html = renderMarkdown('**b** *i* __u__ ~~s~~ `c` ||sp||\n> q\n# H\nhttps://example.com/a?x=1&y=2.');
  for (const frag of ['<strong>b</strong>', '<em>i</em>', '<u>u</u>', '<s>s</s>', '<code class="inline">c</code>', 'class="spoiler"', '<blockquote>', 'md-h1', 'href="https://example.com/a?x=1&amp;y=2"']) assert.ok(html.includes(frag), frag);
});

function model(count, { content = 'hello' } = {}) {
  const author = { id: '1', username: 'u', displayName: 'User <b>', color: '#ff0000', avatarUrl: 'https://cdn.discordapp.com/avatars/1/a.png', bot: false, roleName: 'Mod', index: 0 };
  return {
    guild: { name: 'G', iconUrl: null, iconData: null }, channel: { id: '9', name: 'general-support-001' },
    ticket: { category: 'General', creatorId: '1', creatorName: 'u', createdAt: 1700000000000, closedAt: 1700000100000, claimedBy: null },
    messages: Array.from({ length: count }, (_, i) => ({ id: String(i + 1), ts: 1700000000000 + i * 1000, editedTs: i % 2 ? 1 : null, author, content: `${content} ${i}`, lookups: {}, attachments: [{ id: 'a', name: '<x>.png', url: 'https://cdn.discordapp.com/a/b/c.png', size: 2048, isImage: true }], embeds: [], stickers: [], reactions: [], componentText: [], reply: i === 2 ? { found: false } : null })),
    authors: new Map([['1', author]]), totalMessages: count, truncated: false, maxMessages: 20000, degraded: false, generatedAt: Date.now(), events: [{ at: 1700000001000, text: 'Staff claimed the ticket' }],
  };
}

test('transcript: self-contained, escaped, CSP nonce, chronological, metadata present', () => {
  const [page] = renderTranscript(model(5, { content: '<script>alert(1)</script>' }));
  assert.ok(!page.html.includes('<script>alert(1)'));
  assert.match(page.html, /Content-Security-Policy[^>]*script-src 'nonce-/);
  for (const frag of ['SUPPORT TRANSCRIPT', 'general-support-001', 'Total messages', 'User &lt;b&gt;', '(edited)', 'Transcript generated by the ticket system', 'Ticket activity']) assert.ok(page.html.includes(frag), frag);
  const order = [...page.html.matchAll(/id="m-(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test('transcript: oversized conversations split into parts without losing messages', () => {
  const m = model(3000, { content: 'x'.repeat(300) });
  const pages = renderTranscript(m, { maxBytes: 600 * 1024 });
  assert.ok(pages.length > 1);
  assert.ok(pages.every((p) => Buffer.byteLength(p.html) <= 600 * 1024), 'each part within limit');
  assert.equal(pages.reduce((s, p) => s + (p.to - p.from + 1), 0), 3000);
  const ids = pages.flatMap((p) => [...p.html.matchAll(/id="m-(\d+)"/g)].map((x) => x[1]));
  assert.equal(new Set(ids).size, 3000);
});

test('panel: no enabled options -> unavailable message, no select menu', () => {
  const settings = config.getSettings();
  const json = JSON.stringify(buildPanelComponents({ options: [{ id: 'a', label: 'A', description: 'd', enabled: false }], settings }));
  assert.ok(json.includes('temporarily unavailable'));
  assert.ok(!json.includes('ticket:create'));
});

// ------------------------------------------------------------------ option service
test('option service: concurrent writes serialize, invalid rejected, file stays valid JSON', async () => {
  const base = { label: 'L', description: 'd', categoryId: '123456789012345678', staffRoleId: '223456789012345678' };
  await Promise.all(['a', 'b', 'c', 'd'].map((id) => optionService.addOption({ ...base, id })));
  assert.equal(optionService.getOptions().length, 4);
  await assert.rejects(() => optionService.addOption({ ...base, id: 'a' }), /already exists/);
  await assert.rejects(() => optionService.addOption({ ...base, id: 'Bad Id' }), /lowercase/);
  await assert.rejects(() => optionService.editOption('a', { staffRoleId: 'nope' }), /staff role/);
  const { changed } = await optionService.editOption('a', { label: 'New', enabled: false });
  assert.deepEqual(changed, ['label', 'enabled']);
  assert.equal(JSON.parse(fs.readFileSync(process.env.TICKET_OPTIONS_PATH, 'utf8')).options.length, 4);
  assert.ok(!fs.readdirSync(tmp).some((f) => f.endsWith('.tmp')), 'no temp files left');
  for (const id of ['a', 'b', 'c', 'd']) await optionService.removeOption(id);
  assert.equal(optionService.getOptions().length, 0);
});

test('option service: corrupt file keeps last valid config and refuses to overwrite', async () => {
  const base = { label: 'L', description: 'd', categoryId: '123456789012345678', staffRoleId: '223456789012345678' };
  await optionService.addOption({ ...base, id: 'keep' });
  fs.writeFileSync(process.env.TICKET_OPTIONS_PATH, '{ broken');
  assert.ok(optionService.getLoadError());
  assert.equal(optionService.getOptions()[0].id, 'keep');
  await assert.rejects(() => optionService.addOption({ ...base, id: 'x' }), /currently invalid/);
  assert.equal(fs.readFileSync(process.env.TICKET_OPTIONS_PATH, 'utf8'), '{ broken');
  fs.writeFileSync(process.env.TICKET_OPTIONS_PATH, JSON.stringify({ options: [] }));
  assert.equal(optionService.getLoadError(), null);
});

// ------------------------------------------------------------------ lifecycle
function setup() {
  const { client, guild } = createWorld();
  const category = guild.addChannel({ name: 'Tickets', type: ChannelType.GuildCategory });
  const staffRole = guild.addRole('Support');
  const ownerRole = guild.addRole('Owner');
  const logs = guild.addChannel({ name: 'ticket-logs' });
  const panel = guild.addChannel({ name: 'panel' });
  config.setOverride({ ticket: { ownerRoleId: ownerRole.id, logsChannelId: logs.id, panelChannelId: panel.id, closeDelaySeconds: 0, transcript: { embedImages: false }, limits: { maxOpenTicketsPerUser: 2 } } });
  const user = new FakeMember(guild, 'alice');
  const staff = new FakeMember(guild, 'bob', { roles: [staffRole] });
  const staff2 = new FakeMember(guild, 'carol', { roles: [staffRole] });
  const stranger = new FakeMember(guild, 'dave');
  const owner = new FakeMember(guild, 'erin', { roles: [ownerRole] });
  return { client, guild, category, staffRole, ownerRole, logs, user, staff, staff2, stranger, owner };
}
const opt = async (w, id = 'general_support', extra = {}) => { await optionService.removeOption(id).catch(() => {}); return optionService.addOption({ id, label: 'General Support', emoji: '🎫', description: 'Help', categoryId: w.category.id, staffRoleId: w.staffRole.id, ...extra }); };

test('create: permissions, concurrency dedupe, limits, snapshot, logging', async () => {
  const w = setup();
  await opt(w, 'general_support', { maxOpenTicketsPerUser: 1 });
  await opt(w, 'tech', { label: 'Tech' });

  const [a, b] = await Promise.all([1, 2].map(() => ticketService.createTicket({ client: w.client, guild: w.guild, member: w.user, optionId: 'general_support' })));
  assert.equal([a, b].filter((r) => r.ok).length, 1, 'rapid double click creates exactly one ticket');
  const ch = (a.ok ? a : b).channel;
  assert.match(ch.name, /^general-support-\d{3,}$/);

  const ow = ch.permissionOverwrites.cache;
  assert.ok(ow.get(w.guild.id).deny.has(P.ViewChannel), '@everyone denied');
  for (const id of [w.user.id, w.staffRole.id, w.client.user.id, w.ownerRole.id]) assert.ok(ow.get(id).allow.has(P.ViewChannel));
  assert.equal(ow.get(w.stranger.id), undefined);
  assert.equal(w.guild.channels.cache.get(ch.id).parentId, w.category.id);
  const first = ch.sent[0];
  assert.deepEqual(first.allowedMentions.roles, [w.staffRole.id]);
  assert.equal(first.flags, 32768);
  assert.ok(first.files.length === 1 && JSON.stringify(first.components).includes('attachment://ticket-image.png'));

  const dup = await ticketService.createTicket({ client: w.client, guild: w.guild, member: w.user, optionId: 'general_support' });
  assert.ok(!dup.ok && /already have an open/.test(dup.message), 'per-category limit');
  const t2 = await ticketService.createTicket({ client: w.client, guild: w.guild, member: w.user, optionId: 'tech' });
  assert.ok(t2.ok);
  const t3 = await ticketService.createTicket({ client: w.client, guild: w.guild, member: w.user, optionId: 'tech' });
  assert.ok(!t3.ok && /limit/.test(t3.message), 'global limit');

  assert.ok((await ticketService.createTicket({ client: w.client, guild: w.guild, member: w.user, optionId: 'nope' })).ok === false);
  assert.ok(w.logs.sent.some((p) => p.embeds?.[0]?.data.title.includes('Ticket created')));

  // option removed + role edited later: ticket keeps working
  await optionService.removeOption('general_support');
  const rec = ticketStore.get(ch.id);
  assert.equal(rec.staffRoleId, w.staffRole.id);
  assert.ok(canManageTicket(w.staff, rec, config.getSettings()));
  const disabled = await ticketService.createTicket({ client: w.client, guild: w.guild, member: w.stranger, optionId: 'general_support' });
  assert.ok(!disabled.ok && /no longer available/.test(disabled.message));
});

test('create: broken category config is reported without creating channels', async () => {
  const w = setup();
  await optionService.addOption({ id: 'ghost', label: 'G', description: 'd', categoryId: '999999999999999999', staffRoleId: w.staffRole.id });
  const before = w.guild.channels.cache.size;
  const r = await ticketService.createTicket({ client: w.client, guild: w.guild, member: w.user, optionId: 'ghost' });
  assert.ok(!r.ok && /not configured correctly/.test(r.message));
  assert.equal(w.guild.channels.cache.size, before);
});

test('claim, participants, authorization', async () => {
  const w = setup();
  await opt(w);
  const { channel } = await ticketService.createTicket({ client: w.client, guild: w.guild, member: w.user, optionId: 'general_support' });
  const base = { guild: w.guild, channel };

  assert.ok(!(await ticketService.toggleClaim({ ...base, actor: w.stranger })).ok, 'non-staff cannot claim');
  assert.ok(!(await ticketService.toggleClaim({ ...base, actor: w.user })).ok, 'creator cannot claim');
  const [c1, c2] = await Promise.all([ticketService.toggleClaim({ ...base, actor: w.staff }), ticketService.toggleClaim({ ...base, actor: w.staff2 })]);
  assert.equal([c1, c2].filter((r) => r.ok && /claimed/.test(r.message)).length, 1, 'only one simultaneous claim wins');
  const loser = c1.ok ? c2 : c1;
  assert.match(loser.message, /already claimed by/);
  const claimer = c1.ok ? w.staff : w.staff2;
  const other = c1.ok ? w.staff2 : w.staff;
  assert.ok(!(await ticketService.toggleClaim({ ...base, actor: other, forceRelease: true })).ok, 'other staff cannot release');
  assert.ok((await ticketService.toggleClaim({ ...base, actor: w.owner, forceRelease: true })).ok, 'owner role can release');
  assert.ok((await ticketService.toggleClaim({ ...base, actor: claimer })).ok);
  assert.ok((await ticketService.toggleClaim({ ...base, actor: claimer })).ok, 'toggle releases');

  // add user
  assert.ok(!(await ticketService.addUser({ ...base, actor: w.user, targetId: w.stranger.id })).ok, 'creator cannot add');
  assert.ok(!(await ticketService.addUser({ ...base, actor: w.staff, targetId: 'abc' })).ok);
  assert.ok(!(await ticketService.addUser({ ...base, actor: w.staff, targetId: '999999999999999999' })).ok, 'unknown user');
  const botMember = new FakeMember(w.guild, 'botty', { bot: true });
  assert.ok(!(await ticketService.addUser({ ...base, actor: w.staff, targetId: botMember.id })).ok, 'bots rejected');
  assert.ok((await ticketService.addUser({ ...base, actor: w.staff, targetId: w.stranger.id })).ok);
  assert.match((await ticketService.addUser({ ...base, actor: w.staff, targetId: w.stranger.id })).message, /already has access/);
  assert.ok(!(await ticketService.addUser({ ...base, actor: w.staff, targetId: w.staff2.id })).ok, 'role holders already have access');

  // remove user
  const list = await ticketService.listRemovableUsers({ client: w.client, guild: w.guild, channel, ticket: ticketStore.get(channel.id) });
  assert.deepEqual(list.entries.map((e) => e.id), [w.stranger.id], 'only individually-added users listed');
  assert.match((await ticketService.removeUser({ client: w.client, ...base, actor: w.staff, targetId: w.user.id })).message, /creator/);
  assert.match((await ticketService.removeUser({ client: w.client, ...base, actor: w.staff, targetId: w.staff2.id })).message, /staff team/);
  assert.ok(!(await ticketService.removeUser({ client: w.client, ...base, actor: w.stranger, targetId: w.stranger.id })).ok, 'unauthorized');
  assert.ok((await ticketService.removeUser({ client: w.client, ...base, actor: w.staff, targetId: w.stranger.id })).ok);
  assert.equal(channel.permissionOverwrites.cache.get(w.stranger.id), undefined);
  assert.ok(channel.permissionOverwrites.cache.get(w.user.id), 'creator access preserved');
  assert.ok(channel.permissionOverwrites.cache.get(w.staffRole.id), 'staff access preserved');
});

test('transcript button path: delivered to logs, cooldown, authorization, does not close', async () => {
  const w = setup();
  await opt(w);
  const { channel } = await ticketService.createTicket({ client: w.client, guild: w.guild, member: w.user, optionId: 'general_support' });
  channel.addUserMessage(w.user, 'I need help <script>alert(1)</script>');
  channel.addUserMessage(w.staff, 'Sure! https://example.com');

  assert.ok(!(await ticketService.saveTranscript({ guild: w.guild, channel, actor: w.stranger })).ok);
  const r = await ticketService.saveTranscript({ guild: w.guild, channel, actor: w.staff });
  assert.ok(r.ok, r.message);
  const upload = w.logs.sent.find((p) => p.files?.length);
  assert.ok(upload.files[0].name.endsWith('.html'));
  const html = upload.files[0].attachment.toString();
  assert.ok(html.includes('I need help &lt;script&gt;') && !html.includes('<script>alert(1)'));
  assert.ok(html.includes('Part of &lt;b&gt;Heaven&lt;/b&gt;'));
  assert.ok(html.includes('Support Ticket #'), 'bot interface text captured');
  assert.equal(ticketStore.get(channel.id).status, 'open');
  assert.match((await ticketService.saveTranscript({ guild: w.guild, channel, actor: w.staff })).message, /just saved/);
});

test('close: transcript first, then delete; double close is idempotent', async () => {
  const w = setup();
  await opt(w);
  const { channel } = await ticketService.createTicket({ client: w.client, guild: w.guild, member: w.user, optionId: 'general_support' });
  channel.addUserMessage(w.user, 'thanks');

  assert.ok(!(await ticketService.closeTicket({ client: w.client, guild: w.guild, channel, actor: w.stranger })).ok);
  const [r1, r2] = await Promise.all([1, 2].map(() => ticketService.closeTicket({ client: w.client, guild: w.guild, channel, actor: w.user })));
  assert.equal([r1, r2].filter((r) => r.ok).length, 1, 'exactly one closure');
  assert.ok(channel.deleted);
  assert.equal(ticketStore.get(channel.id), null);
  assert.equal(w.logs.sent.filter((p) => p.files?.length).length, 1, 'exactly one transcript');
  assert.ok(w.logs.sent.some((p) => p.embeds?.[0]?.data.title.includes('Ticket closed')));
});

test('close: transcript delivery failure keeps the channel; owner can force close', async () => {
  const w = setup();
  await opt(w);
  const { channel } = await ticketService.createTicket({ client: w.client, guild: w.guild, member: w.user, optionId: 'general_support' });
  w.logs.failSend = true;

  const r = await ticketService.closeTicket({ client: w.client, guild: w.guild, channel, actor: w.staff });
  assert.ok(!r.ok && r.retryable);
  assert.ok(!channel.deleted, 'channel must survive failed transcript');
  assert.equal(ticketStore.get(channel.id).status, 'open', 'ticket reopened for retry');

  assert.ok(!(await ticketService.closeTicket({ client: w.client, guild: w.guild, channel, actor: w.staff, skipTranscript: true })).ok, 'staff cannot skip transcript');
  w.logs.failSend = false;
  assert.ok((await ticketService.closeTicket({ client: w.client, guild: w.guild, channel, actor: w.staff })).ok, 'retry succeeds');
  assert.ok(channel.deleted);
});

test('close: archive policy removes participant access but keeps the channel', async () => {
  const w = setup();
  config.setOverride({ ticket: { ownerRoleId: w.ownerRole.id, logsChannelId: w.logs.id, closePolicy: 'archive', transcript: { embedImages: false } } });
  await opt(w);
  const { channel } = await ticketService.createTicket({ client: w.client, guild: w.guild, member: w.user, optionId: 'general_support' });
  await ticketService.addUser({ guild: w.guild, channel, actor: w.staff, targetId: w.stranger.id });
  assert.ok((await ticketService.closeTicket({ client: w.client, guild: w.guild, channel, actor: w.staff })).ok);
  assert.ok(!channel.deleted);
  assert.ok(channel.name.startsWith('closed-'));
  assert.equal(channel.permissionOverwrites.cache.get(w.user.id), undefined);
  assert.equal(channel.permissionOverwrites.cache.get(w.stranger.id), undefined);
  assert.ok(channel.permissionOverwrites.cache.get(w.staffRole.id));
  assert.equal(ticketStore.get(channel.id).status, 'closed');
});

test('permissions policy', () => {
  const ticket = { staffRoleId: 'S', creatorId: 'C' };
  const mk = (id, roles = [], extra = {}) => ({ id, guild: { ownerId: 'GO' }, roles: { cache: new Set(roles) }, permissions: { has: () => !!extra.admin } });
  const s = { ticket: { ownerRoleId: 'O', creatorCanClose: true } };
  assert.ok(isOwner(mk('x', ['O']), s) && isOwner(mk('GO'), s) && !isOwner(mk('x', ['S']), s));
  assert.ok(canManageTicket(mk('x', ['S']), ticket, s) && !canManageTicket(mk('C'), ticket, s));
  assert.ok(canCloseTicket(mk('C'), ticket, s));
  assert.ok(!canCloseTicket(mk('C'), ticket, { ticket: { creatorCanClose: false } }));
  assert.ok(!canCloseTicket(mk('rand'), ticket, s));
});

test('panel: publish creates once, repeat edits in place, option changes refresh live', async () => {
  const panelService = require('../src/ticket/services/panelService');
  const w = setup();
  for (const o of optionService.getOptions()) await optionService.removeOption(o.id);
  await opt(w, 'live_a', { label: 'Alpha' });
  const panelCh = [...w.guild.channels.cache.values()].find((c) => c.name === 'panel');

  const first = await panelService.publishPanel(w.client);
  assert.equal(first.status, 'created');
  const second = await panelService.publishPanel(w.client);
  assert.equal(second.status, 'updated');
  assert.equal(panelCh.msgs.length, 1, 'no duplicate panels');
  assert.ok(JSON.stringify(panelCh.msgs[0].payload.components).includes('Alpha'));

  await optionService.addOption({ id: 'live_b', label: 'Bravo', description: 'd', categoryId: w.category.id, staffRoleId: w.staffRole.id });
  assert.equal((await panelService.refreshPanel(w.client)).status, 'updated');
  const json = JSON.stringify(panelCh.msgs[0].payload.components);
  assert.ok(json.includes('Bravo'), 'new option visible immediately');

  await optionService.editOption('live_a', { enabled: false });
  await panelService.refreshPanel(w.client);
  assert.ok(!JSON.stringify(panelCh.msgs[0].payload.components).includes('Alpha'), 'disabled option hidden');
  await optionService.removeOption('live_b');
  await optionService.removeOption('live_a');
  await panelService.refreshPanel(w.client);
  assert.ok(JSON.stringify(panelCh.msgs[0].payload.components).includes('temporarily unavailable'));
});
