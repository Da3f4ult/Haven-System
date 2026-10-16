'use strict';

const fs = require('fs');
const path = require('path');

const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);

async function renameWithRetry(from, to, tries = 6) {
  for (let i = 0; ; i++) {
    try {
      await fs.promises.rename(from, to);
      return;
    } catch (e) {
      if (i >= tries - 1 || !RETRYABLE.has(e.code)) throw e;
      await new Promise((r) => setTimeout(r, 25 * (i + 1)));
    }
  }
}

/**
 * Writes JSON atomically: temp file in the same directory, fsync, then rename.
 * An interrupted write never leaves a half-written target file.
 */
async function writeJsonAtomic(file, data) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  const json = `${JSON.stringify(data, null, 2)}\n`;
  const fh = await fs.promises.open(tmp, 'w');
  try {
    await fh.writeFile(json, 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await renameWithRetry(tmp, file);
  } catch (e) {
    await fs.promises.rm(tmp, { force: true });
    throw e;
  }
}

function readJsonSync(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

module.exports = { writeJsonAtomic, readJsonSync };
