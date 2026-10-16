'use strict';
// Minimal in-memory Discord used to drive the real ticket services in tests.
const { ContainerComponent, Collection, PermissionsBitField, PermissionFlagsBits: P, ChannelType, OverwriteType } = require('discord.js');

let idCounter = 100000000000000000n;
const nextId = () => String((idCounter += 1n));

function perms(list) { return new PermissionsBitField(list); }

class FakeRole { constructor(guild, name, id = nextId()) { Object.assign(this, { guild, name, id, color: 0, hexColor: '#000000' }); } }

class FakeMember {
  constructor(guild, username, { roles = [], bot = false, admin = false } = {}) {
    this.guild = guild; this.id = nextId();
    this.user = { id: this.id, username, globalName: null, bot, displayAvatarURL: () => `https://cdn.discordapp.com/avatars/${this.id}/x.png` };
    this.displayAvatarURL = () => `https://cdn.discordapp.com/avatars/${this.id}/y.png`;
    this.displayName = username; this.displayColor = 0; this.displayHexColor = '#000000';
    this.roles = { cache: new Collection(roles.map((r) => [r.id, r])), highest: roles[0] ?? guild.everyone };
    this.permissions = admin ? perms([P.Administrator]) : perms([]);
    guild.members.cache.set(this.id, this);
  }
}

class FakeChannel {
  constructor(guild, { name, type = ChannelType.GuildText, parent = null, permissionOverwrites = [], topic = '' }) {
    this.guild = guild; this.id = nextId(); this.name = name; this.type = type; this.parentId = parent; this.topic = topic;
    this.client = guild.client; this.deleted = false; this.sent = [];
    this.permissionOverwrites = {
      cache: new Collection(),
      edit: async (id, obj) => {
        const allow = Object.entries(obj).filter(([, v]) => v).map(([k]) => P[k]);
        this.permissionOverwrites.cache.set(id, { id, type: OverwriteType.Member, allow: perms(allow), deny: perms([]) });
      },
      delete: async (id) => { this.permissionOverwrites.cache.delete(id); },
    };
    for (const o of permissionOverwrites) this.permissionOverwrites.cache.set(o.id, { id: o.id, type: o.type, allow: perms(o.allow ?? []), deny: perms(o.deny ?? []) });
    this.msgs = [];
    this.messages = {
      fetch: async (arg) => {
        if (typeof arg === 'string') return this.msgs.find((m) => m.id === arg) ?? null;
        let list = [...this.msgs].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
        if (arg.before) list = list.filter((m) => BigInt(m.id) < BigInt(arg.before));
        return new Collection(list.slice(0, arg.limit ?? 50).map((m) => [m.id, m]));
      },
    };
  }
  isTextBased() { return this.type === ChannelType.GuildText; }
  isDMBased() { return false; }
  permissionsFor(who) {
    if (who.id === this.client.user.id) return perms([P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory, P.ManageChannels, P.ManageRoles]);
    const view = this.permissionOverwrites.cache.get(who.id)?.allow.has(P.ViewChannel)
      || [...(who.roles?.cache.keys() ?? [])].some((r) => this.permissionOverwrites.cache.get(r)?.allow.has(P.ViewChannel));
    return perms(view ? [P.ViewChannel] : []);
  }
  async send(payload) {
    if (this.failSend) throw new Error('Missing Access');
    const m = {
      id: nextId(), createdTimestamp: Date.now(), editedTimestamp: null, channel: this, payload, editable: true, system: false, type: 0,
      content: payload.content ?? '', author: this.client.user, member: this.guild.members.cache.get(this.client.user.id),
      mentions: { users: new Collection(), roles: new Collection(), members: new Collection() },
      attachments: new Collection((payload.files ?? []).map((f, i) => [String(i), { id: String(i), name: f.name, url: `https://cdn.discordapp.com/attachments/1/${i}/${f.name}`, size: 10, contentType: 'image/png' }])),
      embeds: [], stickers: new Collection(), reactions: { cache: new Collection() }, reference: null,
      components: (payload.components ?? []).filter((c) => c.toJSON && c.toJSON().type === 17).map((c) => new ContainerComponent(c.toJSON())),
      edit: async (p) => { m.payload = { ...m.payload, ...p }; m.editedTimestamp = Date.now(); return m; },
    };
    this.msgs.push(m); this.sent.push(payload);
    return m;
  }
  async delete() { this.deleted = true; this.guild.channels.cache.delete(this.id); }
  async setName(n) { this.name = n; }
  addUserMessage(member, content, extra = {}) {
    const m = {
      id: nextId(), createdTimestamp: Date.now(), editedTimestamp: null, content, system: false, type: 0, member, author: member.user,
      mentions: { users: new Collection(), roles: new Collection(), members: new Collection() },
      attachments: new Collection(), embeds: [], stickers: new Collection(), reactions: { cache: new Collection() }, components: [], reference: null, ...extra,
    };
    this.msgs.push(m); return m;
  }
}

class FakeGuild {
  constructor(client) {
    this.client = client; this.id = nextId(); this.name = 'Part of <b>Heaven</b>'; this.premiumTier = 0; this.ownerId = 'owner';
    this.everyone = new FakeRole(this, '@everyone', this.id);
    this.roles = { cache: new Collection([[this.id, this.everyone]]), fetch: async (id) => this.roles.cache.get(id) ?? null };
    this.members = { cache: new Collection(), fetch: async (id) => this.members.cache.get(id) ?? Promise.reject(new Error('Unknown Member')), me: null };
    this.channels = {
      cache: new Collection(),
      fetch: async (id) => this.channels.cache.get(id) ?? Promise.reject(new Error('Unknown Channel')),
      create: async (opts) => {
        if (!this.channels.cache.get(opts.parent)) throw new Error('Unknown parent');
        const ch = new FakeChannel(this, opts); this.channels.cache.set(ch.id, ch); return ch;
      },
    };
  }
  iconURL() { return 'https://cdn.discordapp.com/icons/1/x.png'; }
  addRole(name) { const r = new FakeRole(this, name); this.roles.cache.set(r.id, r); return r; }
  addChannel(opts) { const c = new FakeChannel(this, opts); this.channels.cache.set(c.id, c); return c; }
}

function createWorld() {
  const client = { user: { id: nextId(), username: 'Haven' }, emojis: { cache: new Collection() } };
  client.channels = { fetch: async (id) => [...client.guild.channels.cache.values()].find((c) => c.id === id) ?? null };
  const guild = new FakeGuild(client); client.guild = guild;
  const me = new FakeMember(guild, 'Haven', { bot: true }); me.id = client.user.id; me.user.id = client.user.id; guild.members.cache.set(me.id, me); guild.members.me = me;
  return { client, guild };
}

module.exports = { createWorld, FakeMember, ChannelType, nextId };
