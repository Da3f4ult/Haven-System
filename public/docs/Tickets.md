# Ticket System

Haven System includes a private support-ticket workflow built on **Discord.js 14.19+** and **Discord Components V2**. It uses the existing Discord client and event loader; no second client or separate listener process is required.

## Features

- Configurable ticket categories and staff roles.
- Private channels with controlled participant access.
- Ticket claiming and release.
- Optional creator-initiated closing.
- Delete or archive close policies.
- HTML transcripts with embedded media where possible.
- Centralized logs and transcript delivery.
- Live option updates without a restart.
- Persistent ticket state across restarts.

## Architecture

```text
src/
├── events/
│   ├── interactionCreate.js      # Routes Discord interactions once
│   └── ticketReady.js            # Startup validation and stale-state cleanup
└── ticket/
    ├── index.js                  # Interaction handling and initialization
    ├── component.js              # Public ticket panel
    ├── channelComponent.js       # Private ticket interface
    ├── options.json              # Live ticket-category definitions
    ├── tickets.json              # Persisted open-ticket registry
    ├── config.js                 # settings.json reader and defaults
    ├── constants.js / paths.js   # Shared values and filesystem paths
    ├── handlers/                 # Buttons, menus, modals, and commands
    ├── services/                 # Ticket, option, panel, log, and transcript services
    ├── transcript/               # Markdown and HTML rendering
    ├── templates/                # Transcript HTML, CSS, and JavaScript
    └── utils/                    # Validation, permissions, media, locking, and I/O
commands/ticket/                  # `/ticket` subcommands
scripts/deploy-commands.js        # Registers `/ticket`
tests/                            # Automated tests
```

The prefix-command loader reads only direct files in `commands/`, so the `commands/ticket/` directory does not conflict with existing prefix commands.

## Setup

### 1. Configure `settings.json`

Set the following ticket fields:

| Setting | Purpose |
| --- | --- |
| `ownerRoleId` | Role allowed to manage ticket options and publish the panel. The server owner can always manage them. |
| `logsChannelId` | Channel that receives operational logs and transcripts. |
| `panelChannelId` | Channel where the ticket panel is published. |
| `panelImage` | Panel banner path under `public/` or an HTTPS URL. |
| `closePolicy` | `delete` (default) or `archive`. |
| `closeDelaySeconds` | Delay before deletion, from 0 to 60 seconds. |
| `creatorCanClose` | Whether ticket creators may close their own tickets. |
| `panel.title` / `description` / `footer` | Text displayed on the public panel. |
| `transcript.enabled` / `maxMessages` / `embedImages` | Transcript behavior. |
| `limits.maxOpenTicketsPerUser` | Global number of open tickets allowed per user. |

The repository’s default `settings.json` contains the full structure. The ticket configuration is re-read automatically when the file changes.

### 2. Configure Discord permissions

The bot must have the following permissions in the relevant server and channels:

- View Channels
- Send Messages
- Read Message History
- Attach Files
- Embed Links
- Manage Channels
- Manage Roles

The bot must be able to create and view channels in each configured ticket category, and send messages and attachments in the panel and logs channels.

The client uses these gateway intents:

- Guilds
- Guild Members
- Guild Messages
- Message Content

Enable **Server Members Intent** and **Message Content Intent** in the Developer Portal.

### 3. Register the slash command

```bash
npm run deploy-commands
```

Set `GUILD_ID` in `.env` for immediate registration in one test server. Leave it unset to register globally; global registration may take longer to appear.

### 4. Create the panel

After the bot starts, configure at least one category and publish the panel:

```text
/ticket addoption id:general_support label:"General Support" description:"Get help" category:#Tickets staff_role:@Support
/ticket setticketpanel
```

The complete option schema is available in `src/ticket/options.example.json`.

## Slash-command reference

| Command | Permission | Description |
| --- | --- | --- |
| `/ticket addoption` | Owner role or server owner | Add a category to the panel. |
| `/ticket editoption` | Owner role or server owner | Edit supplied category fields; use `none` to clear emoji or image values. |
| `/ticket removeoption` | Owner role or server owner | Remove a category. Existing open tickets continue to work. |
| `/ticket listoptions` | Owner role or server owner | Display configured categories in pages. |
| `/ticket setticketpanel` | Owner role or server owner | Publish or refresh the panel without creating duplicates. |
| `/ticket adduser` | Ticket staff | Add a participant to an open ticket. |
| `/ticket removeuser` | Ticket staff | Remove a participant from an open ticket. |
| `/ticket claim` / `release` | Ticket staff | Claim or release a ticket. |
| `/ticket close` | Staff or creator | Begin the close flow with confirmation. |
| `/ticket transcript` | Ticket staff | Save a transcript without closing the ticket. |

## Permission model

- **Owner role or server owner:** Manage ticket configuration and force-close any ticket.
- **Category staff role:** Claim tickets, manage participants, save transcripts, and close tickets in that category.
- **Administrators:** Manage tickets through their existing server permissions.
- **Ticket creator:** Participate in the ticket and close it when `creatorCanClose` is enabled; they do not receive administrative access.
- **Invited users:** Read and send messages in the ticket.

Ticket channels deny access to `@everyone`. The configured owner role retains access so administrators can intervene when necessary.

## Live configuration updates

`optionService` is the single writer for `options.json`. Each update is serialized and follows this sequence:

1. Re-read the current file.
2. Clone the current state.
3. Apply and validate the requested change.
4. Write through a temporary file, `fsync`, and rename.
5. Replace the in-memory state.
6. Refresh the published panel.

The ticket-creation flow and panel use the service state for every interaction, so valid changes take effect without a restart. If `options.json` contains invalid JSON, the last valid configuration remains active and the broken file is not overwritten. Fixing the file clears the error automatically.

Each open ticket stores a snapshot of its category label and staff role. Editing or removing a category therefore does not break tickets that already exist.

## Closing and transcripts

The standard close flow is:

1. A user starts the close action.
2. The ticket requests confirmation.
3. The ticket enters `closing` status.
4. A transcript is generated and delivered to the logs channel.
5. The closure is logged.
6. The channel is deleted or archived according to `closePolicy`.

If transcript delivery fails, the channel is retained, the ticket is reopened, and staff can retry. Owners also have a **Close without transcript** option. Repeated close actions are ignored while a close operation is in progress.

Transcripts are standalone HTML files with:

- Responsive dark layout.
- Avatars and role colors.
- Replies, edits, embeds, and attachments.
- Embedded images when possible; Discord CDN links can expire.
- Search and UTC/local time display controls.
- HTML escaping for user content.
- A per-file Content Security Policy.

Files that exceed Discord’s upload limit are re-rendered with linked images and split into `part1ofN` files when necessary. Messages are not silently discarded; a visible notice is included when `maxMessages` is reached.

## Testing

Run the automated suite with:

```bash
npm test
```

The suite covers permissions, concurrency, ticket limits, XSS escaping, transcript splitting, live panel updates, and failed-delivery safety.

### Manual verification checklist

1. Create the required category and staff role; run `addoption` and `setticketpanel`.
2. Select a category twice quickly and confirm that only one channel is created.
3. Confirm non-staff users cannot view another user’s ticket.
4. As staff, test Claim, Add User, Remove User, and Save Transcript.
5. Run `editoption` with `enabled:false` and confirm the category disappears without a restart.
6. Close a ticket and confirm the transcript arrives in the logs channel before deletion or archiving.
7. Temporarily revoke log-channel access and confirm the ticket is retained when delivery fails.
