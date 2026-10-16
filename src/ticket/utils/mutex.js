'use strict';

/** Serial per-key queue: callers with the same key run one after another. */
class KeyedQueue {
  constructor() {
    this.tails = new Map();
  }

  async run(key, fn) {
    const prev = this.tails.get(key) ?? Promise.resolve();
    let release;
    const gate = new Promise((r) => (release = r));
    const tail = prev.then(() => gate);
    this.tails.set(key, tail);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}

const BUSY = Symbol('busy');

/** Non-blocking per-key lock: returns BUSY immediately when already held. */
class TryLock {
  constructor() {
    this.held = new Set();
  }

  isBusy(key) {
    return this.held.has(key);
  }

  async run(key, fn) {
    if (this.held.has(key)) return BUSY;
    this.held.add(key);
    try {
      return await fn();
    } finally {
      this.held.delete(key);
    }
  }
}

module.exports = { KeyedQueue, TryLock, BUSY };
