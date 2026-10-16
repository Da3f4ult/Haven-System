# Ticket System

A modular ticket system built on **Discord.js v14.19+ and Components V2**. It plugs into the existing
bot through the normal event loader — no second client, no extra global listeners.

## What was added

```
src/
├── events/
│   ├── interactionCreate.js      # single router entry (bound once by the loader)
│   └── ticketReady.js            # startup checks + stale-state cleanup
└── ticket/
    ├── index.js                  # handleInteraction() / initTickets()
    ├── component.js              # public panel (Components V2)
    ├── channelComponent.js       # private ticket interface (Components V2)
    ├── options.json              # live category configuration
    ├── tickets.json              # open-ticket registry (survives restarts)
    ├── config.js                 # settings.json reader (auto-reloads on change)
    ├── constants.js  paths.js
    ├── handlers/                 # buttons, select menus, modals, slash router, UI
    ├── services/                 # optionService, ticketService, transcriptService,
    │                             # panelService, logService, ticketStore
    ├── transcript/               # markdown + HTML renderer
    ├── templates/                # transcript.html / .css / .js
    └── utils/                    # permissions, validation, media, mutex, atomic file, …
commands/ticket/                  # one file per /ticket subcommand
scripts/deploy-commands.js        # registers /ticket
tests/                            # node:test suite with a fake Discord
```

The existing prefix-command loader only reads `commands/*.js`, so `commands/ticket/` never collides with it.

## Setup

1. `npm install` (requires discord.js ≥ 14.19).
2. Edit `settings.json → ticket`:

| Key | Purpose |
|---|---|
| `ownerRoleId` | Role allowed to manage options / panel (the server owner always can) |
| `logsChannelId` | Private channel for logs **and transcripts** |
| `panelChannelId` | Channel where the panel is published |
| `panelImage` | Panel banner (`public/...` path or https URL). Default `public/imgs/ticket.png` |
| `closePolicy` | `delete` (default) or `archive` (locks the channel, keeps it for staff) |
| `closeDelaySeconds` | Delay before deletion (0–60) |
| `creatorCanClose` | Let ticket creators close their own ticket |
| `panel.title / description / footer` | Panel text |
| `transcript.enabled / maxMessages / embedImages` | Transcript behaviour |
| `limits.maxOpenTicketsPerUser` | Global open-ticket limit per user |

   `settings.json` is re-read automatically when it changes.
3. Register the slash command: `npm run deploy-commands`
   (set `GUILD_ID` in `.env` for instant per-server registration while testing; otherwise it is global).
4. Start the bot, then in Discord:
   - `/ticket addoption id:general_support label:"General Support" description:"Get help" category:#Tickets staff_role:@Support`
   - `/ticket setticketpanel`

See `src/ticket/options.example.json` for the option schema.

## Discord requirements

**Intents** (already enabled by `bot.js`): Guilds, GuildMembers, GuildMessages, MessageContent.
**Bot permissions:** View Channels, Send Messages, Read Message History, Attach Files, Embed Links,
**Manage Channels**, **Manage Roles** (needed to set channel permission overwrites).
The bot's role must sit above nothing special, but it must be able to see/create channels in each ticket category,
and send + attach files in the logs and panel channels.

## Slash commands

| Command | Who | Description |
|---|---|---|
| `/ticket addoption` | owner role | Add a category |
| `/ticket editoption` | owner role | Edit only the supplied fields (`none` clears emoji/image) |
| `/ticket removeoption` | owner role | Remove a category (open tickets keep working) |
| `/ticket listoptions` | owner role | Paginated list of categories |
| `/ticket setticketpanel` | owner role | Publish / refresh the panel (never duplicates) |
| `/ticket adduser` · `removeuser` | ticket staff | Manage participants |
| `/ticket claim [release]` | ticket staff | Claim / release |
| `/ticket close` | staff or creator | Close with confirmation |
| `/ticket transcript` | ticket staff | Save a transcript without closing |

## How live option updates work

`optionService` is the only code that touches `options.json`. Every change runs through one serialized queue:
re-check the file → clone state → apply change → validate everything → **atomic write** (temp file + fsync + rename) →
swap the in-memory state → `refreshPanel()` edits the published panel message. The panel and the ticket-creation
handler read from the service on every interaction, so changes apply instantly with no restart. If the file is
hand-edited into invalid JSON, the last valid configuration stays active, writes are refused (the broken file is never
overwritten), and the problem is reported; fixing the file clears the error automatically.

Each ticket stores a snapshot of its category label and staff role, so editing or deleting a category never breaks
tickets that are already open.

## Permissions model

- **Owner role / guild owner**: configuration + can manage and force-close any ticket.
- **Category staff role**: claim, add/remove users, save transcripts, close — for tickets in that category.
- **Administrators**: can manage tickets (they already see every channel).
- **Creator**: talks in the ticket; may close it (toggle `creatorCanClose`); no admin rights.
- **Invited users**: send/read only.

Ticket channels deny `@everyone`; the owner role also gets access so configuration admins can intervene.

## Closing & transcripts

Close → confirmation → status `closing` → transcript generated → **delivered to the logs channel** → closure logged →
channel deleted/archived. If delivery fails the channel is kept, the ticket reopens, and the user can press **Retry**.
Owners additionally get **Close without transcript**. Repeated clicks are ignored while a close is running.

Transcripts are standalone `.html` files: dark responsive layout, avatars, role colors, replies, edits, embeds,
attachments (images are embedded when possible because Discord CDN links expire), a search box and UTC/local time toggle.
All user content is HTML-escaped, and a per-file Content-Security-Policy blocks any script except the bundled one.
Files over Discord's upload limit are first re-rendered with linked images, and only then split into `part1of N…` files —
messages are never silently dropped (a visible notice appears if `maxMessages` is exceeded).

## Testing

`npm test` runs 20 automated tests (permissions, concurrency, limits, XSS, transcript splitting, live panel updates,
failed-delivery safety) against an in-memory fake Discord.

Manual checklist on a real server:
1. Create category + roles, run `addoption`, `setticketpanel` → panel appears.
2. Select a category twice rapidly → exactly one channel; non-staff cannot see it.
3. Staff: Claim, Add User (ID), Remove User, Save Transcript → file arrives in logs.
4. Run `editoption … enabled:false` → option disappears from the menu without restart.
5. Close → confirm → transcript in logs, channel removed. Revoke the bot's access to the logs channel and close again → channel is kept.
