'use strict';

const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const { ROOT, PUBLIC_DIR } = require('../paths');

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

/** Returns a normalized https URL, or null. Used for anything that auto-loads (images). */
function safeHttpsUrl(value, maxLen = 2048) {
  if (typeof value !== 'string' || value.length > maxLen) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Returns a normalized http(s) URL, or null. Used for clickable links only. */
function safeLinkUrl(value, maxLen = 2048) {
  if (typeof value !== 'string' || value.length > maxLen) return null;
  try {
    const u = new URL(value);
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Resolves a project-relative image path to a real file inside public/.
 * Rejects traversal, absolute paths, symlink escapes, directories and non-image files.
 * @returns {string|null} absolute path
 */
function resolveLocalImagePath(ref) {
  if (typeof ref !== 'string' || !ref.trim()) return null;
  const norm = ref.trim().replace(/\\/g, '/');
  if (norm.startsWith('/') || /^[a-z]:/i.test(norm)) return null;
  const abs = path.resolve(ROOT, norm);
  const rel = path.relative(PUBLIC_DIR, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  if (!IMAGE_EXT.has(path.extname(abs).toLowerCase())) return null;
  try {
    const real = fs.realpathSync(abs);
    const realPublic = fs.realpathSync(PUBLIC_DIR);
    const rel2 = path.relative(realPublic, real);
    if (!rel2 || rel2.startsWith('..') || path.isAbsolute(rel2)) return null;
    if (!fs.statSync(real).isFile()) return null;
    return real;
  } catch {
    return null;
  }
}

/**
 * Resolves an image reference (https URL or local path) into something Components V2 can show.
 * @param {string} ref
 * @param {{ baseName: string, fallback?: string }} opts
 * @returns {{ url: string, attachment: AttachmentBuilder|null } | null}
 */
function resolveImage(ref, { baseName, fallback } = {}) {
  const attempt = (value) => {
    if (typeof value !== 'string' || !value.trim()) return null;
    const v = value.trim();
    if (/^https?:\/\//i.test(v)) {
      const url = safeHttpsUrl(v);
      return url ? { url, attachment: null } : null;
    }
    const abs = resolveLocalImagePath(v);
    if (!abs) return null;
    const name = `${baseName}${path.extname(abs).toLowerCase()}`;
    return { url: `attachment://${name}`, attachment: new AttachmentBuilder(abs, { name }) };
  };
  return attempt(ref) ?? attempt(fallback);
}

module.exports = { safeHttpsUrl, safeLinkUrl, resolveLocalImagePath, resolveImage };
