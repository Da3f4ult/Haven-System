'use strict';

const path = require('path');

const SNOWFLAKE_REGEX = /^\d{17,20}$/;
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

function isValidSnowflake(id) {
  return typeof id === 'string' && SNOWFLAKE_REGEX.test(id);
}

/** Unicode emoji (single grapheme) or Discord custom emoji `<:name:id>` / `<a:name:id>`. */
function isValidEmoji(str) {
  if (typeof str !== 'string' || !str) return false;
  if (/^<a?:\w{2,32}:\d{17,20}>$/.test(str)) return true;
  const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(str)];
  if (segments.length !== 1) return false;
  return /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3)/u.test(str);
}

/** Escapes HTML special characters. */
function sanitizeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Syntactic check of an image reference: https URL, or a relative path inside `public/`.
 * (Existence / containment on disk is re-checked in utils/media.js.)
 * @returns {string|null} error message or null when acceptable
 */
function validateImageRef(ref) {
  if (typeof ref !== 'string') return 'Image must be a string.';
  const value = ref.trim();
  if (!value) return null;
  if (value.length > 512) return 'Image must be 512 characters or fewer.';
  if (/^https?:\/\//i.test(value)) {
    try {
      const u = new URL(value);
      if (u.protocol !== 'https:') return 'Image URLs must use https.';
      if (u.username || u.password) return 'Image URLs must not contain credentials.';
      return null;
    } catch {
      return 'Image URL is not valid.';
    }
  }
  const norm = path.posix.normalize(value.replace(/\\/g, '/'));
  if (norm.startsWith('/') || /^[a-z]:/i.test(norm) || norm.split('/').includes('..')) {
    return 'Image path must be relative and inside the public/ folder.';
  }
  if (!norm.startsWith('public/')) return 'Image path must be inside the public/ folder.';
  if (!IMAGE_EXT.has(path.posix.extname(norm).toLowerCase())) {
    return 'Image must be .png, .jpg, .jpeg, .gif or .webp.';
  }
  return null;
}

/** Validates a complete ticket option object. */
function validateOptionData(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: ['Option data must be an object.'] };
  }

  if (typeof data.id !== 'string' || !data.id) errors.push('Option ID is required and must be a string.');
  else if (!/^[a-z0-9_]+$/.test(data.id)) errors.push('Option ID must contain only lowercase letters, numbers, and underscores.');
  else if (data.id.length > 50) errors.push('Option ID must be 50 characters or fewer.');

  if (typeof data.label !== 'string' || !data.label.trim()) errors.push('Label is required.');
  else if (data.label.length > 100) errors.push('Label must be 100 characters or fewer.');

  if (data.emoji !== undefined && data.emoji !== null && data.emoji !== '' && !isValidEmoji(data.emoji)) {
    errors.push('Invalid emoji. Use one Unicode emoji or a custom emoji like <:name:id>.');
  }

  if (typeof data.description !== 'string' || !data.description.trim()) errors.push('Description is required.');
  else if (data.description.length > 100) errors.push('Description must be 100 characters or fewer.');

  if (data.image !== undefined && data.image !== null) {
    const imgErr = validateImageRef(data.image);
    if (imgErr) errors.push(imgErr);
  }

  if (!isValidSnowflake(data.categoryId)) errors.push('A valid Discord category ID is required.');
  if (!isValidSnowflake(data.staffRoleId)) errors.push('A valid staff role ID is required.');

  if (data.enabled !== undefined && typeof data.enabled !== 'boolean') errors.push('enabled must be true or false.');

  if (data.maxOpenTicketsPerUser !== undefined && data.maxOpenTicketsPerUser !== null) {
    const max = data.maxOpenTicketsPerUser;
    if (!Number.isInteger(max) || max < 1 || max > 10) errors.push('maxOpenTicketsPerUser must be an integer between 1 and 10.');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { isValidSnowflake, isValidEmoji, sanitizeHtml, validateImageRef, validateOptionData };
