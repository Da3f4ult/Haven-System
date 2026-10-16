'use strict';

const { sanitizeHtml: esc } = require('../utils/validation');
const { safeLinkUrl } = require('../utils/media');

const OPEN = '\uE000';
const CLOSE = '\uE001';
const COLOR_RE = /^#[0-9a-f]{6}$/i;

function formatUtc(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return 'invalid date';
  return `${d.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}

/**
 * Converts Discord-flavoured markdown to SAFE HTML.
 * Strategy: raw text -> stash code/links/mentions as placeholders (each built from escaped
 * parts) -> escape everything else -> apply formatting -> restore placeholders.
 * User text can never contribute a tag or attribute.
 *
 * @param {string} raw
 * @param {{ users?: Record<string,string>, roles?: Record<string,{name:string,color:string|null}>, channels?: Record<string,string> }} lookups
 */
function renderMarkdown(raw, lookups = {}) {
  const users = lookups.users ?? {};
  const roles = lookups.roles ?? {};
  const channels = lookups.channels ?? {};

  let text = String(raw ?? '').replace(/[\uE000\uE001]/g, '');
  const stash = [];
  const hold = (html) => `${OPEN}${stash.push(html) - 1}${CLOSE}`;

  // 1. Code (never formatted further)
  text = text.replace(/```(?:[a-zA-Z0-9_+#.-]{1,20}\n)?([\s\S]*?)```/g, (_, code) =>
    hold(`<pre class="codeblock"><code>${esc(code.replace(/^\n|\n$/g, ''))}</code></pre>`));
  text = text.replace(/(``?)([^`]+?)\1(?!`)/g, (_, __, code) => hold(`<code class="inline">${esc(code)}</code>`));

  // 2. Links
  text = text.replace(/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]{1,1800})\)/g, (match, label, url) => {
    const safe = safeLinkUrl(url);
    return safe
      ? hold(`<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer nofollow">${esc(label)}</a>`)
      : match;
  });
  text = text.replace(/<?(https?:\/\/[^\s<>"'`]+)>?/g, (match, url) => {
    const trailing = /[.,;:!?)\]]+$/.exec(url)?.[0] ?? '';
    const clean = trailing ? url.slice(0, -trailing.length) : url;
    const safe = safeLinkUrl(clean);
    if (!safe) return match;
    return hold(`<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer nofollow">${esc(clean)}</a>`) + trailing;
  });

  // 3. Mentions, emoji, timestamps
  text = text.replace(/<@!?(\d{17,20})>/g, (_, id) => hold(`<span class="mention">@${esc(users[id] ?? 'Unknown User')}</span>`));
  text = text.replace(/<@&(\d{17,20})>/g, (_, id) => {
    const role = roles[id];
    const color = role?.color && COLOR_RE.test(role.color) ? role.color : null;
    const style = color ? ` style="color:${color};background:${color}26"` : '';
    return hold(`<span class="mention"${style}>@${esc(role?.name ?? 'deleted-role')}</span>`);
  });
  text = text.replace(/<#(\d{17,20})>/g, (_, id) => hold(`<span class="mention">#${esc(channels[id] ?? 'deleted-channel')}</span>`));
  text = text.replace(/<(a?):(\w{2,32}):(\d{17,20})>/g, (_, animated, name, id) =>
    hold(`<img class="emoji" src="https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=48" alt=":${esc(name)}:" title=":${esc(name)}:" loading="lazy" referrerpolicy="no-referrer">`));
  text = text.replace(/<t:(-?\d{1,13})(?::[tTdDfFR])?>/g, (_, ts) =>
    hold(`<time class="mention" data-ts="${Number(ts) * 1000}" data-utc="${esc(formatUtc(Number(ts) * 1000))}">${esc(formatUtc(Number(ts) * 1000))}</time>`));
  text = text.replace(/(?<!\w)@(everyone|here)\b/g, (_, word) => hold(`<span class="mention">@${word}</span>`));

  // 4. Escape the rest, then block-level pass
  text = esc(text);

  const out = [];
  let plain = [];
  let quote = [];
  const flushPlain = () => {
    if (plain.length) out.push(`<div>${plain.join('<br>')}</div>`);
    plain = [];
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote>${quote.join('<br>')}</blockquote>`);
    quote = [];
  };
  for (const line of text.split('\n')) {
    let m;
    if ((m = /^&gt; ?(.*)$/.exec(line))) {
      flushPlain();
      quote.push(m[1]);
      continue;
    }
    flushQuote();
    if ((m = /^(#{1,3}) +(.+)$/.exec(line))) {
      flushPlain();
      out.push(`<div class="md-h${m[1].length}">${m[2]}</div>`);
    } else if ((m = /^-# +(.+)$/.exec(line))) {
      flushPlain();
      out.push(`<div class="md-sub">${m[1]}</div>`);
    } else if ((m = /^\s*[-*] +(.+)$/.exec(line))) {
      flushPlain();
      out.push(`<div class="md-li">• ${m[1]}</div>`);
    } else {
      plain.push(line);
    }
  }
  flushPlain();
  flushQuote();
  text = out.join('');

  // 5. Inline formatting (never crosses tags)
  text = text
    .replace(/\*\*\*([^<]+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^<]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^<]+?)__/g, '<u>$1</u>')
    .replace(/\*(?!\s)([^<*]+?)(?<!\s)\*/g, '<em>$1</em>')
    .replace(/(?<!\w)_(?!\s)([^<_]+?)(?<!\s)_(?!\w)/g, '<em>$1</em>')
    .replace(/~~([^<]+?)~~/g, '<s>$1</s>')
    .replace(/\|\|([^<]+?)\|\|/g, '<span class="spoiler">$1</span>');

  // 6. Restore placeholders
  return text.replace(/\uE000(\d+)\uE001/g, (_, i) => stash[Number(i)] ?? '');
}

module.exports = { renderMarkdown, formatUtc };
