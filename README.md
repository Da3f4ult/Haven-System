# Haven System

A Discord.js bot for branded welcome messages and private support tickets.

Haven System combines a configurable welcome experience with a production-oriented ticket workflow. It renders personalized welcome banners, publishes interactive Components V2 messages, and provides private ticket channels with role-based access, transcripts, logging, and live configuration updates.

## Documentation

- **[Installation and configuration](public/docs/overview.md)** — Set up the bot, configure Discord permissions, and run it locally.
- **[Welcome commands](public/docs/Welcome.md)** — Use the welcome preview command and add new prefix commands.
- **[Ticket system](public/docs/Tickets.md)** — Configure ticket categories, publish the panel, manage tickets, and understand transcripts.

## Capabilities

### Welcome experience

- Posts an automatic welcome message when a member joins.
- Generates a personalized banner using the member’s Discord avatar.
- Uses Discord Components V2 for structured, interactive welcome cards.
- Supports configurable greeting text, footer text, button labels, and destination links.
- Provides a preview command so staff can test changes without waiting for a new member.

### Ticket management

- Publishes a configurable support panel with ticket categories.
- Creates private ticket channels with category-specific staff permissions.
- Supports claiming, participant management, closing, archiving, and transcript generation.
- Delivers logs and transcripts to a configured Discord channel.
- Applies configuration changes without requiring a restart.
- Preserves category snapshots for open tickets so later category edits do not disrupt active conversations.

### Operational design

- Loads prefix commands and Discord events automatically.
- Uses atomic writes for ticket option updates to reduce the risk of corrupted state.
- Keeps the last valid configuration active when a JSON file cannot be parsed.
- Includes automated tests for permissions, concurrency, limits, transcript handling, and failure safety.
- Uses pre-built canvas binaries, so native build tools are not required on supported platforms.

## Configuration at a glance

Runtime settings are stored in `settings.json`. Secrets belong in `.env` and must not be committed.

| File or setting | Purpose |
| --- | --- |
| `.env` | Discord token and optional guild ID for command registration |
| `settings.json` | Welcome and ticket configuration |
| `public/imgs/welcome.png` | Welcome banner background |
| `public/imgs/ticket.png` | Default ticket panel image |
| `src/welcome/canva.js` | Welcome avatar placement and rendering details |
| `src/ticket/options.json` | Ticket category definitions managed by the bot |
| `src/ticket/tickets.json` | Persisted open-ticket registry |

See the [installation guide](public/docs/overview.md) for the complete setup procedure.

## Common commands

```bash
npm install                  # Install dependencies
npm run dev                  # Start with Node's file watcher
npm start                    # Start normally
npm run deploy-commands      # Register the /ticket command
npm test                     # Run the automated test suite
```

In Discord, the default welcome preview command is:

```text
!testwelcome
```

The prefix is configurable through `settings.json`.

## Project structure

```text
.
├── bot.js                    # Discord client entry point
├── settings.json             # Runtime configuration
├── commands/                 # Prefix and ticket command modules
├── scripts/                  # Operational scripts, including command deployment
├── public/                   # Documentation and image assets
├── src/events/               # Discord event handlers
├── src/welcome/              # Welcome banner and Components V2 card
├── src/ticket/               # Ticket services, handlers, and renderers
└── tests/                    # Automated tests
```

## Scope

Haven System is intentionally focused on onboarding and support workflows. It does not include moderation, role leveling, music, or general-purpose utility commands.

## License

This project is distributed under the MIT License. See [`LICENSE`](LICENSE) for details.
