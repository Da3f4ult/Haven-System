# Features

An overview of what the Discord Welcome Bot does. For installation and setup, see [Overview](https://havendoc.us.ci/#/doc/overview.md).

---

## Automatic welcome messages

When a new member joins the server, the bot posts a welcome message in a configured channel. The message includes a custom-rendered banner with the member's avatar, a greeting, quick links, and a footer. No manual action is required from staff.

---

## Rendered welcome banner

The welcome image is generated on the fly for each new member. The member's Discord avatar is placed into a placeholder on a banner background, giving every welcome message a personalized visual without any manual editing.

The banner is defined by a single background image (`public/imgs/welcome.png`), which can be replaced with any custom design.

---

## Components V2 welcome card

The welcome message uses Discord's Components V2 system, producing a structured card rather than a plain embed. Each welcome card contains:

- The rendered banner image
- A heading greeting the new member by mention
- A short message welcoming them to the server
- A **Rules** button linking to the server rules
- A **Verify** button linking to the verification page
- A footer with an author credit

All text, labels, and links are configurable through `settings.json`.

---

## Customizable message content

Server owners can change the welcome text, button labels, button links, and footer without touching any code. Placeholders in the message — `{server}` and `{user}` — are automatically replaced with the server name and a mention of the new member.

---

## Manual preview command

The bot exposes a prefix command for testing the welcome message without waiting for a new member to join:

```
!testwelcome
```

Running the command renders the welcome card using the invoking user's own avatar and posts it in the current channel. This is useful when adjusting the banner layout, message text, or button configuration.

---

## Command framework

Commands are loaded automatically from the `commands/` directory at startup. Any `.js` file placed there with a `name` and `execute` function is registered on the bot, with no additional wiring required. The default prefix is `!` and is configurable in `settings.json`.

---

## Event framework

Discord events are loaded automatically from `src/events/`. Each file exports a `name`, an optional `once` flag, and an `execute` function. This keeps the entry point (`bot.js`) minimal and makes it straightforward to add new behavior such as logging, moderation hooks, or additional greetings.

---

## Configuration file

All runtime configuration lives in `settings.json`:

| Field | Purpose |
|-------|---------|
| `prefix` | Prefix used for text commands |
| `welcome.channelId` | Channel where welcome messages are posted |
| `welcome.rulesUrl` | Destination for the Rules button |
| `welcome.verifyUrl` | Destination for the Verify button |
| `welcome.footer` | Text shown at the bottom of the welcome card |
| `welcome.message` | Greeting shown above the buttons |
| `welcome.rulesLabel` | Label for the Rules button |
| `welcome.rulesText` | Text shown next to the Rules button |
| `welcome.verifyLabel` | Label for the Verify button |
| `welcome.verifyText` | Text shown next to the Verify button |

Secrets such as the bot token remain in `.env` and are never mixed with user-facing configuration.

---

## Logging

The bot prints color-coded status messages to the terminal, including:

- Which commands and events were loaded at startup
- The bot's username, server count, and active prefix
- Every prefix command that is run and whether it succeeded
- Every member join and whether the welcome message was delivered

Errors are logged with the source, the affected user or command, and the underlying exception, which makes diagnosing issues straightforward.

---

## Reliability

- Command execution is wrapped in error handling. A failure in one command does not crash the bot.
- Global handlers for `unhandledRejection` and `uncaughtException` prevent silent crashes and log the reason.
- The background banner and recently used avatars are cached in memory, so repeated welcome renders are fast.
- Pre-built binaries are used for image rendering, so no native compilation step is required on any platform.

---

## Out of scope

The bot is intentionally focused. It does not provide moderation tools, role management, leveling, or music. It greets new members with a branded welcome message and includes a full ticket system (see [`public/docs/Tickets.md`](public/docs/Tickets.md)).