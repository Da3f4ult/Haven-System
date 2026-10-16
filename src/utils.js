const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  magenta:'\x1b[35m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
};

const tag  = (name, color) => `${color}${c.bold}[${name}]${c.reset}`;
const log  = (name, color, msg) => console.log(`${tag(name, color)} ${msg}`);

const ok   = (name, msg) => log(name, c.green,  msg);
const info = (name, msg) => log(name, c.cyan,   msg);
const warn = (name, msg) => log(name, c.yellow, msg);
const err  = (name, msg) => log(name, c.red,    msg);

module.exports = { c, tag, log, ok, info, warn, err };