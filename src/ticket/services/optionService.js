'use strict';

const fs = require('fs');
const { EventEmitter } = require('events');
const { OPTIONS_PATH } = require('../paths');
const { LIMITS } = require('../constants');
const { writeJsonAtomic, readJsonSync } = require('../utils/atomicFile');
const { validateOptionData } = require('../utils/validation');

class OptionError extends Error {
  constructor(code, message, details = []) {
    super(message);
    this.name = 'OptionError';
    this.code = code;
    this.details = details;
  }
}

const EMPTY = () => ({ options: [], panelMessageId: null, panelChannelId: null });

function normalizeOption(raw) {
  return {
    id: String(raw.id).trim(),
    label: String(raw.label).trim(),
    emoji: typeof raw.emoji === 'string' ? raw.emoji.trim() : '',
    description: String(raw.description).trim(),
    image: typeof raw.image === 'string' ? raw.image.trim() : '',
    categoryId: String(raw.categoryId),
    staffRoleId: String(raw.staffRoleId),
    enabled: raw.enabled !== false,
    maxOpenTicketsPerUser: raw.maxOpenTicketsPerUser ?? null,
  };
}

/**
 * Central, serialized owner of options.json.
 * All writes go through _mutate(): validate -> atomic write -> swap in-memory state.
 * Reads transparently pick up manual edits of the file (mtime check).
 */
class OptionService extends EventEmitter {
  constructor({ filePath = OPTIONS_PATH } = {}) {
    super();
    this.filePath = filePath;
    this.state = EMPTY();
    this.loadError = null;
    this.mtime = null;
    this.queue = Promise.resolve();
    this.loadOptions();
  }

  /** Reads and validates the file. On failure the last valid state is kept. */
  loadOptions() {
    let stat;
    try {
      stat = fs.statSync(this.filePath);
    } catch (e) {
      if (e.code === 'ENOENT') {
        this.loadError = null;
        this.mtime = null;
        return { ok: true };
      }
      this.loadError = `options.json could not be read: ${e.message}`;
      return { ok: false, error: this.loadError };
    }

    try {
      const data = readJsonSync(this.filePath);
      const state = this._validateState(data);
      this.state = state;
      this.loadError = null;
      this.mtime = stat.mtimeMs;
      return { ok: true };
    } catch (e) {
      this.loadError = e instanceof OptionError ? e.message : `options.json is not valid JSON: ${e.message}`;
      this.mtime = stat.mtimeMs;
      return { ok: false, error: this.loadError };
    }
  }

  _refreshIfChanged() {
    try {
      const stat = fs.statSync(this.filePath);
      if (stat.mtimeMs !== this.mtime) this.loadOptions();
    } catch (e) {
      if (e.code === 'ENOENT' && this.mtime !== null) this.loadOptions();
    }
  }

  _validateState(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.options)) {
      throw new OptionError('INVALID_FILE', 'options.json must be an object with an "options" array.');
    }
    if (data.options.length > LIMITS.MAX_OPTIONS) {
      throw new OptionError('TOO_MANY', `At most ${LIMITS.MAX_OPTIONS} ticket categories are supported (Discord select-menu limit).`);
    }
    const seen = new Set();
    const options = data.options.map((raw, i) => {
      const { valid, errors } = validateOptionData(raw);
      if (!valid) throw new OptionError('INVALID_OPTION', `Option #${i + 1} (${raw?.id ?? 'no id'}) is invalid: ${errors.join(' ')}`, errors);
      const opt = normalizeOption(raw);
      if (seen.has(opt.id)) throw new OptionError('DUPLICATE', `Duplicate option ID "${opt.id}".`);
      seen.add(opt.id);
      return opt;
    });
    return {
      options,
      panelMessageId: typeof data.panelMessageId === 'string' ? data.panelMessageId : null,
      panelChannelId: typeof data.panelChannelId === 'string' ? data.panelChannelId : null,
    };
  }

  _mutate(fn) {
    const run = this.queue.then(async () => {
      this._refreshIfChanged();
      if (this.loadError) {
        throw new OptionError('CONFIG_INVALID', `options.json is currently invalid, so nothing was changed: ${this.loadError}`);
      }
      const draft = structuredClone(this.state);
      const result = fn(draft);
      const validated = this._validateState(draft);
      await writeJsonAtomic(this.filePath, validated);
      this.state = validated;
      try {
        this.mtime = fs.statSync(this.filePath).mtimeMs;
      } catch {
        this.mtime = null;
      }
      this.emit('change');
      return structuredClone(result);
    });
    this.queue = run.catch(() => {});
    return run;
  }

  getOptions() {
    this._refreshIfChanged();
    return structuredClone(this.state.options);
  }

  getEnabledOptions() {
    return this.getOptions().filter((o) => o.enabled);
  }

  getOptionById(id) {
    this._refreshIfChanged();
    const found = this.state.options.find((o) => o.id === id);
    return found ? structuredClone(found) : null;
  }

  getLoadError() {
    this._refreshIfChanged();
    return this.loadError;
  }

  getPanelRef() {
    this._refreshIfChanged();
    const { panelChannelId, panelMessageId } = this.state;
    return panelChannelId && panelMessageId ? { channelId: panelChannelId, messageId: panelMessageId } : null;
  }

  addOption(data) {
    return this._mutate((draft) => {
      const { valid, errors } = validateOptionData(data);
      if (!valid) throw new OptionError('INVALID_OPTION', errors.join(' '), errors);
      const option = normalizeOption(data);
      if (draft.options.some((o) => o.id === option.id)) {
        throw new OptionError('DUPLICATE', `A category with the ID "${option.id}" already exists.`);
      }
      if (draft.options.length >= LIMITS.MAX_OPTIONS) {
        throw new OptionError('TOO_MANY', `You can have at most ${LIMITS.MAX_OPTIONS} categories.`);
      }
      draft.options.push(option);
      return option;
    });
  }

  /**
   * @param {string} id
   * @param {object} changes only keys that are !== undefined are applied
   * @returns {Promise<{ option: object, changed: string[] }>}
   */
  editOption(id, changes) {
    return this._mutate((draft) => {
      const index = draft.options.findIndex((o) => o.id === id);
      if (index === -1) throw new OptionError('NOT_FOUND', `No category with the ID "${id}" exists.`);
      const merged = { ...draft.options[index] };
      const changed = [];
      for (const key of ['label', 'emoji', 'description', 'image', 'categoryId', 'staffRoleId', 'enabled', 'maxOpenTicketsPerUser']) {
        if (changes[key] === undefined) continue;
        if (merged[key] !== changes[key]) changed.push(key);
        merged[key] = changes[key];
      }
      const { valid, errors } = validateOptionData(merged);
      if (!valid) throw new OptionError('INVALID_OPTION', errors.join(' '), errors);
      draft.options[index] = normalizeOption(merged);
      return { option: draft.options[index], changed };
    });
  }

  removeOption(id) {
    return this._mutate((draft) => {
      const index = draft.options.findIndex((o) => o.id === id);
      if (index === -1) throw new OptionError('NOT_FOUND', `No category with the ID "${id}" exists.`);
      const [removed] = draft.options.splice(index, 1);
      return removed;
    });
  }

  setPanelRef(ref) {
    return this._mutate((draft) => {
      draft.panelChannelId = ref?.channelId ?? null;
      draft.panelMessageId = ref?.messageId ?? null;
    });
  }

  /** Rebuilds the published panel from the current options. Lazy require avoids a cycle. */
  refreshPanel(client) {
    return require('./panelService').refreshPanel(client);
  }
}

const optionService = new OptionService();

module.exports = optionService;
module.exports.OptionService = OptionService;
module.exports.OptionError = OptionError;
