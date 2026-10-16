'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { TEMPLATES_DIR } = require('../paths');
const { sanitizeHtml: esc } = require('../utils/validation');
const { safeHttpsUrl, safeLinkUrl } = require('../utils/media');
const { renderMarkdown, formatUtc } = require('./markdown');

const COLOR_RE = /^#[0-9a-f]{6}$/i;
let templates = null;

function loadTemplates() {
  if (!templates) {
    const read = (f) => fs.readFileSync(path.join(TEMPLATES_DIR, f), 'utf8');
    templates = { html: read('transcript.html'), css: read('transcript.css'), js: read('transcript.js') };
  }
  return templates;
}

const fill = (tpl, map) => tpl.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in map ? map[k] : m));

const timeTag = (ms, cls = 'time') =>
  `<time class="${cls}" data-ts="${Number(ms)}" data-utc="${esc(formatUtc(ms))}" datetime="${esc(new Date(ms).toISOString())}">${esc(formatUtc(ms))}</time>`;

function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const cssUrl = (url) => {
  // Only https URLs or base64 data URIs of known image types may enter a CSS url().
  if (/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(url)) return url;
  const safe = safeHttpsUrl(url);
  return safe && !/["'\\()\s]/.test(safe) ? safe : null;
};

function renderAttachments(msg, useInline) {
  if (!msg.attachments?.length) return '';
  const items = msg.attachments.map((a) => {
    const link = safeHttpsUrl(a.url);
    const name = esc(a.name || 'attachment');
    const size = a.size ? ` <span class="att-name">(${formatBytes(a.size)})</span>` : '';
    if (a.isImage && link) {
      const src = useInline && a.dataUri && cssUrl(a.dataUri) ? a.dataUri : link;
      return `<div><a href="${esc(link)}" target="_blank" rel="noopener noreferrer nofollow"><img class="att-img" src="${esc(src)}" alt="${name}" loading="lazy" referrerpolicy="no-referrer"></a><div class="att-name">${name}${size}</div></div>`;
    }
    if (link) {
      return `<a class="att-file" href="${esc(link)}" target="_blank" rel="noopener noreferrer nofollow">📎 <span>${name}</span>${size}</a>`;
    }
    return `<div class="att-gone">Attachment unavailable: ${name}</div>`;
  });
  return `<div class="attachments">${items.join('')}</div>`;
}

function renderEmbeds(msg) {
  if (!msg.embeds?.length) return '';
  return msg.embeds
    .map((e) => {
      const color = e.color && COLOR_RE.test(e.color) ? e.color : '#5865f2';
      const parts = [];
      const thumb = e.thumbnail && safeHttpsUrl(e.thumbnail);
      if (thumb) parts.push(`<img class="e-thumb" src="${esc(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">`);
      if (e.author) parts.push(`<div class="e-author">${esc(e.author)}</div>`);
      if (e.title) {
        const url = e.url && safeLinkUrl(e.url);
        parts.push(`<div class="e-title">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(e.title)}</a>` : esc(e.title)}</div>`);
      }
      if (e.description) parts.push(`<div class="e-desc">${renderMarkdown(e.description, msg.lookups)}</div>`);
      if (e.fields?.length) {
        parts.push(
          `<div class="e-fields">${e.fields
            .map((f) => `<div class="${f.inline ? '' : 'full'}"><b>${esc(f.name)}</b>${renderMarkdown(f.value, msg.lookups)}</div>`)
            .join('')}</div>`,
        );
      }
      const image = e.image && safeHttpsUrl(e.image);
      if (image) parts.push(`<img class="e-img" src="${esc(image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`);
      if (e.footer) parts.push(`<div class="e-foot">${esc(e.footer)}</div>`);
      return `<div class="embed" style="border-left-color:${color}">${parts.join('')}</div>`;
    })
    .join('');
}

/** @returns {string} HTML for one normalized message */
function renderMessage(msg, authorIndex, useInline) {
  if (msg.system) {
    return `<div class="system" id="m-${esc(msg.id)}">${esc(msg.system)} ${timeTag(msg.ts)}</div>`;
  }
  const a = msg.author;
  const color = a.color && COLOR_RE.test(a.color) ? ` style="color:${a.color}"` : '';
  const initial = esc([...(a.displayName || '?')][0] ?? '?');
  const badges = [
    a.bot ? '<span class="badge">Bot</span>' : '',
    a.roleName ? `<span class="badge role">${esc(a.roleName)}</span>` : '',
  ].join('');

  let reply = '';
  if (msg.reply) {
    reply = msg.reply.found
      ? `<div class="reply"><b>${esc(msg.reply.authorName)}</b><span>${esc(msg.reply.snippet || 'Click to see attachment')}</span></div>`
      : '<div class="reply"><span>Original message was deleted or could not be loaded</span></div>';
  }

  const body = [];
  if (msg.content) body.push(`<div class="content">${renderMarkdown(msg.content, msg.lookups)}</div>`);
  for (const text of msg.componentText ?? []) body.push(`<div class="content">${renderMarkdown(text, msg.lookups)}</div>`);
  body.push(renderAttachments(msg, useInline), renderEmbeds(msg));
  if (msg.stickers?.length) body.push(`<div class="content"><em>Sticker: ${msg.stickers.map(esc).join(', ')}</em></div>`);
  if (msg.reactions?.length) {
    body.push(`<div class="reactions">${msg.reactions.map((r) => `<span class="reaction">${esc(r.label)} ${Number(r.count)}</span>`).join('')}</div>`);
  }

  return (
    `<article class="msg" id="m-${esc(msg.id)}">` +
    `<div class="avatar av-${authorIndex}" aria-hidden="true">${initial}</div>` +
    `<div class="body"><div class="head"><span class="author"${color}>${esc(a.displayName)}</span>` +
    `<span class="uname">@${esc(a.username)}</span>${badges}${timeTag(msg.ts)}` +
    `${msg.editedTs ? `<span class="edited">(edited)</span>` : ''}</div>` +
    `${reply}${body.join('')}</div></article>`
  );
}

function avatarCss(authors, useInline) {
  return authors
    .map((a) => {
      const url = a.avatarUrl && (useInline && a.avatarData && cssUrl(a.avatarData) ? a.avatarData : cssUrl(a.avatarUrl));
      return url ? `.av-${a.index}{background-image:url("${url}")}` : '';
    })
    .join('\n');
}

function renderHeader(model, part) {
  const t = model.ticket;
  const iconUrl = model.guild.iconData ?? model.guild.iconUrl;
  const iconSafe = iconUrl && cssUrl(iconUrl);
  const icon = iconSafe
    ? `<div class="guild-icon"><img src="${esc(iconSafe)}" alt="" referrerpolicy="no-referrer"></div>`
    : `<div class="guild-icon">${esc([...model.guild.name][0] ?? '?')}</div>`;
  const row = (k, v) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`;

  const events = (model.events ?? [])
    .map((e) => `<li>${timeTag(e.at, 'time')} — ${esc(e.text)}</li>`)
    .join('');

  return (
    `<section class="summary" id="top"><div class="summary-top">${icon}<div>` +
    `<h1>SUPPORT TRANSCRIPT</h1><h2>${esc(model.guild.name)}</h2>` +
    `${part.total > 1 ? `<div class="part">Part ${part.index} of ${part.total} · messages ${part.from}–${part.to}</div>` : ''}` +
    `</div></div><dl class="meta">` +
    row('Server', esc(model.guild.name)) +
    row('Ticket', `#${esc(model.channel.name)} <span class="uname">(${esc(model.channel.id)})</span>`) +
    row('Category', esc(t.category)) +
    row('Created by', `${esc(t.creatorName)} <span class="uname">(${esc(t.creatorId)})</span>`) +
    row('Created', timeTag(t.createdAt)) +
    row('Closed', t.closedAt ? timeTag(t.closedAt) : 'Still open') +
    (t.claimedBy ? row('Claimed by', esc(t.claimedBy)) : '') +
    row('Total messages', String(model.totalMessages)) +
    `</dl>` +
    (model.truncated
      ? `<div class="notice">This conversation is longer than the configured limit of ${esc(String(model.maxMessages))} messages. The oldest messages are not included in this transcript.</div>`
      : '') +
    (model.degraded
      ? '<div class="notice">Images are linked rather than embedded to keep this file within Discord’s upload limit. Discord may expire those links over time.</div>'
      : '') +
    (events ? `<details class="activity"><summary>Ticket activity (${model.events.length})</summary><ul>${events}</ul></details>` : '') +
    `</section>`
  );
}

function assemble(model, rows, part, useInline) {
  const { html, css, js } = loadTemplates();
  const nonce = crypto.randomBytes(16).toString('base64');
  const authors = new Map();
  for (const r of rows) if (r.author) authors.set(r.author.index, r.author);
  return fill(html, {
    NONCE: nonce,
    TITLE: esc(`Transcript - #${model.channel.name}${part.total > 1 ? ` (part ${part.index}/${part.total})` : ''}`),
    CSS: css,
    AVATAR_CSS: avatarCss([...authors.values()], useInline),
    HEADER: renderHeader(model, part),
    MESSAGES: rows.map((r) => r.html).join('\n'),
    FOOTER: `Transcript generated by the ticket system on ${esc(formatUtc(model.generatedAt))}.`,
    JS: js,
  });
}

/**
 * Renders a transcript model into one or more self-contained HTML documents,
 * splitting by messages when a single file would exceed `maxBytes`.
 *
 * @param {object} model normalized transcript model (see transcriptService)
 * @param {{ maxBytes?: number, useInline?: boolean }} opts
 * @returns {{ html: string, from: number, to: number }[]}
 */
function renderTranscript(model, { maxBytes = Infinity, useInline = true } = {}) {
  const rows = model.messages.map((m) => {
    const author = m.system ? null : model.authors.get(m.author.id);
    return { html: renderMessage(m, author?.index ?? 0, useInline), author, bytes: 0 };
  });
  for (const r of rows) r.bytes = Buffer.byteLength(r.html) + 1;

  const single = assemble(model, rows, { index: 1, total: 1, from: 1, to: rows.length }, useInline);
  if (Buffer.byteLength(single) <= maxBytes) return [{ html: single, from: 1, to: rows.length }];

  // Split: reserve room for template, header and avatar CSS.
  const overhead = Buffer.byteLength(assemble(model, [], { index: 99, total: 99, from: 1, to: 1 }, useInline)) + model.authors.size * 400 + 2048;
  const capacity = Math.max(maxBytes - overhead, 64 * 1024);
  const chunks = [];
  let current = [];
  let size = 0;
  for (const r of rows) {
    if (current.length && size + r.bytes > capacity) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(r);
    size += r.bytes;
  }
  if (current.length) chunks.push(current);

  let cursor = 0;
  return chunks.map((chunk, i) => {
    const from = cursor + 1;
    cursor += chunk.length;
    return {
      html: assemble(model, chunk, { index: i + 1, total: chunks.length, from, to: cursor }, useInline),
      from,
      to: cursor,
    };
  });
}

module.exports = { renderTranscript, renderMessage, formatBytes };
