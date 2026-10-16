'use strict';

const CUSTOM_ID_RE = /^(ticket:[a-z_]{1,32})(?::(\d{1,6}))?$/;

/**
 * Parses and validates a ticket custom ID.
 * @param {unknown} id
 * @returns {{ base: string, arg: number | null } | null}
 */
function parseCustomId(id) {
  if (typeof id !== 'string' || id.length > 100) return null;
  const m = CUSTOM_ID_RE.exec(id);
  if (!m) return null;
  return { base: m[1], arg: m[2] !== undefined ? Number(m[2]) : null };
}

module.exports = { parseCustomId };
