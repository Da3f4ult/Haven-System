'use strict';

const fs = require('fs');
const { TICKETS_PATH } = require('../paths');
const { LIMITS } = require('../constants');
const { writeJsonAtomic, readJsonSync } = require('../utils/atomicFile');
const { warn } = require('../../utils');

/**
 * Persistent ticket registry (tickets.json). The in-memory map is authoritative;
 * writes are coalesced and atomic. Survives restarts.
 */
class TicketStore {
  constructor({ filePath = TICKETS_PATH } = {}) {
    this.filePath = filePath;
    this.state = { tickets: {}, counter: 0 };
    this.writing = null;
    this.dirty = false;
    this._load();
  }

  _load() {
    if (!fs.existsSync(this.filePath)) return;
    try {
      const data = readJsonSync(this.filePath);
      this.state = {
        tickets: data && typeof data.tickets === 'object' && !Array.isArray(data.tickets) ? data.tickets : {},
        counter: Number.isInteger(data?.counter) ? data.counter : 0,
      };
    } catch (e) {
      // Never overwrite a file we could not parse: back it up and start clean.
      const backup = `${this.filePath}.corrupt-${Date.now()}`;
      try {
        fs.copyFileSync(this.filePath, backup);
      } catch {
        /* ignore */
      }
      warn('ticket', `tickets.json is unreadable (${e.message}); backed up to ${backup}.`);
    }
  }

  _persist() {
    this.dirty = true;
    if (!this.writing) {
      this.writing = (async () => {
        while (this.dirty) {
          this.dirty = false;
          await writeJsonAtomic(this.filePath, this.state);
        }
      })().finally(() => {
        this.writing = null;
      });
    }
    return this.writing;
  }

  get(channelId) {
    return this.state.tickets[channelId] ?? null;
  }

  list() {
    return Object.values(this.state.tickets);
  }

  listOpenByCreator(guildId, userId) {
    return this.list().filter((t) => t.guildId === guildId && t.creatorId === userId && (t.status === 'open' || t.status === 'closing'));
  }

  async nextNumber() {
    this.state.counter += 1;
    await this._persist();
    return this.state.counter;
  }

  async create(ticket) {
    this.state.tickets[ticket.channelId] = ticket;
    await this._persist();
    return ticket;
  }

  /** @param {string} channelId @param {object|((t:object)=>void)} patch */
  async update(channelId, patch) {
    const ticket = this.state.tickets[channelId];
    if (!ticket) return null;
    if (typeof patch === 'function') patch(ticket);
    else Object.assign(ticket, patch);
    await this._persist();
    return ticket;
  }

  async addEvent(channelId, event) {
    return this.update(channelId, (t) => {
      t.events = t.events ?? [];
      t.events.push({ at: Date.now(), ...event });
      if (t.events.length > LIMITS.MAX_EVENTS_PER_TICKET) t.events.splice(0, t.events.length - LIMITS.MAX_EVENTS_PER_TICKET);
    });
  }

  async remove(channelId) {
    if (!(channelId in this.state.tickets)) return false;
    delete this.state.tickets[channelId];
    await this._persist();
    return true;
  }
}

const ticketStore = new TicketStore();

module.exports = ticketStore;
module.exports.TicketStore = TicketStore;
