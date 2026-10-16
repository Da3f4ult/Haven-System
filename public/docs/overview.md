# Installation and Configuration

This guide explains how to install Haven System, configure the Discord application, publish the ticket command, and verify the bot is working.

## Prerequisites

| Requirement | Supported version or value | Notes |
| --- | --- | --- |
| Node.js | `>= 18.0.0` | Node.js 20 or newer is recommended. |
| npm | Bundled with Node.js | Verify with `npm -v`. |
| Git | Any recent version | Required when cloning the repository. |
| Discord application | Bot token | Create one in the [Discord Developer Portal](https://discord.com/developers/applications). |

The project uses `@napi-rs/canvas`, which provides pre-built binaries. Windows installations do not require Visual Studio or C++ build tools.

## 1. Clone the repository

```bash
git clone https://github.com/Da3f4ult/Haven-System.git
cd Haven-System
```

## 2. Install dependencies

```bash
npm install
```

The main runtime dependencies are:

- `discord.js` — Discord API client and Components V2 support.
- `@napi-rs/canvas` — Welcome-banner rendering.
- `dotenv` — Loads environment variables from `.env`.

## 3. Configure environment variables

Create a local `.env` file from the included template.

### macOS or Linux

```bash
cp .env.example .env
```

### Windows PowerShell

```powershell
Copy-Item .env.example .env
```

### Windows Command Prompt

```cmd
copy .env.example .env
```

Open `.env` and add your bot token:

```env
DISCORD_TOKEN=your_bot_token_here
```

For fast per-server slash-command registration during development, you may also add:

```env
GUILD_ID=your_test_server_id
```

Keep `.env` private. Never commit a real token or paste it into an issue, log, or public configuration file.

### Create a Discord application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications).
2. Select **New Application** and provide a name.
3. Open **Bot** in the left navigation and create or reset the bot token.
4. Copy the token into `.env` as `DISCORD_TOKEN=...`.
5. Under **Privileged Gateway Intents**, enable:
   - **Server Members Intent** — required for member-join welcome messages.
   - **Message Content Intent** — required for prefix commands such as `!testwelcome`.

## 4. Invite the bot

In the Developer Portal, open **OAuth2 → URL Generator** and select:

- Scope: `bot`
- Minimum permissions:
  - View Channels
  - Send Messages
  - Read Message History
  - Attach Files
  - Embed Links

The ticket system additionally requires **Manage Channels** and **Manage Roles**. Grant only the permissions appropriate for your server, then open the generated URL and select the target server.

## 5. Configure `settings.json`

Edit `settings.json` in the project root. A minimal welcome configuration looks like this:

```json
{
  "prefix": "!",
  "welcome": {
    "channelId": "your_welcome_channel_id",
    "rulesUrl": "https://example.com/rules",
    "verifyUrl": "https://example.com/verify",
    "footer": "Welcome to our community",
    "message": "### {user}\nWe're happy to have you with us. Please read the rules and verify to unlock the rest of the server.",
    "rulesLabel": "Rules",
    "rulesText": "Read the rules",
    "verifyLabel": "Verify",
    "verifyText": "Complete verification"
  }
}
```

The repository includes ticket settings as well. Configure `ticket.ownerRoleId`, `ticket.logsChannelId`, and `ticket.panelChannelId` before using the ticket workflow. See the [ticket system guide](Tickets.md) for the full configuration reference.

> `settings.json` must contain valid JSON. Do not use comments or trailing commas.

### Find a channel ID

1. In Discord, open **User Settings → Advanced**.
2. Enable **Developer Mode**.
3. Right-click the target channel and select **Copy Channel ID**.
4. Paste the value into the relevant `settings.json` field.

## 6. Add the welcome banner

Place the background image at the exact path below:

```text
public/imgs/welcome.png
```

If you use a custom design, adjust `avatarCenterX`, `avatarCenterY`, and `avatarWidth` in `src/welcome/canva.js` so the avatar aligns with the intended placeholder.

## 7. Register ticket commands

After configuring the ticket system, register the `/ticket` slash command:

```bash
npm run deploy-commands
```

If `GUILD_ID` is set, the command is registered immediately in that server. Without it, Discord registers the command globally, which can take longer to appear.

## 8. Start the bot

### Development

```bash
npm run dev
```

This starts the bot with Node’s file watcher.

### Production

```bash
npm start
```

A successful startup logs the loaded commands and events, the connected bot identity, the number of servers, and the configured prefix.

## 9. Verify the installation

In a channel where the bot can send messages, run:

```text
!testwelcome
```

The bot should render the invoking user’s avatar and send the welcome card with its configured text and buttons.

To verify the live join flow, test with a secondary account or leave and rejoin the server.

Run the automated test suite with:

```bash
npm test
```

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| `DISCORD_TOKEN` is undefined | Confirm `.env` exists in the project root and contains `DISCORD_TOKEN`. |
| `Used disallowed intents` | Enable Server Members Intent and Message Content Intent in the Developer Portal. |
| Bot is online but no welcome message appears | Confirm `welcome.channelId`, channel permissions, and Server Members Intent. |
| `settings.json` reports a syntax error | Remove comments and trailing commas; validate the file as JSON. |
| Avatar is not centered correctly | Adjust `avatarCenterX`, `avatarCenterY`, and `avatarWidth` in `src/welcome/canva.js`. |
| Only the image appears without Components V2 content | Confirm `discord.js` is at least `14.19.0`, then reinstall dependencies and restart. |
| Ticket panel cannot be published | Check `ticket.panelChannelId`, `ticket.ownerRoleId`, and the bot’s channel permissions. |
| Transcript or log delivery fails | Check `ticket.logsChannelId` and ensure the bot can send messages and attach files there. |

## Quick reference

```bash
git clone https://github.com/Da3f4ult/Haven-System.git
cd Haven-System
npm install
cp .env.example .env       # Use Copy-Item on PowerShell
# Edit .env and settings.json
npm run deploy-commands
npm run dev                 # Development
npm start                   # Production
npm test                    # Tests
```
