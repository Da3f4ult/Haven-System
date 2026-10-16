# Startup Guide

This document describes how to install, configure, and run the Discord Welcome Bot.

---

## Requirements

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | `>= 18.0.0` (20+ recommended) | https://nodejs.org/ |
| npm | Bundled with Node.js | Verify with `npm -v` |
| Git | Any recent version | https://git-scm.com/ |
| Discord Bot Token | — | From the Discord Developer Portal |

Windows users do not need Visual Studio or C++ build tools. The project uses `@napi-rs/canvas`, which ships pre-built binaries.

---

## 1. Clone the repository

```bash
git clone https://github.com/Da3f4ult/Haven-System.git
cd Haven-System
```
---

## 2. Install dependencies

```bash
npm install
```

This installs the following packages:

- `discord.js` — Discord API wrapper
- `@napi-rs/canvas` — image rendering (no native build step required)
- `dotenv` — loads secrets from `.env`

---

## 3. Create the `.env` file

The repository includes a `.env.example` file as a template. Rename it to `.env`:

```bash
mv .env.example .env
```

On Windows (Command Prompt):

```cmd
ren .env.example .env
```

On Windows (PowerShell):

```powershell
Rename-Item .env.example .env
```

Then open `.env` and replace the placeholder with your bot token:

```env
DISCORD_TOKEN=your_bot_token_here
```

### Obtaining a bot token

1. Open the Discord Developer Portal: https://discord.com/developers/applications
2. Click **New Application** and provide a name.
3. In the left sidebar, open **Bot**, then click **Reset Token** and copy the value.
4. Paste it into `.env` as `DISCORD_TOKEN=...`.

### Enabling required intents

On the same **Bot** page, scroll to **Privileged Gateway Intents** and enable:

- **Server Members Intent** — required for welcome messages on join
- **Message Content Intent** — required for prefix commands

Save the changes.

---

## 4. Inviting the bot

1. In the Developer Portal, open **OAuth2** → **URL Generator**.
2. Under Scopes, select `bot`.
3. Under Bot Permissions, select at minimum:
   - Send Messages
   - Attach Files
   - Embed Links
   - Read Message History
4. Copy the generated URL, open it in a browser, and select your server.

---

## 5. Configuring `settings.json`

Edit `settings.json` in the project root:

```json
{
  "prefix": "!",
  "welcome": {
    "channelId": "1545458927863341147",
    "rulesUrl": "https://exam.com",
    "verifyUrl": "https://exam.com",
    "footer": "Made By Da3f4ult",
    "message": "### {user}\nWe're happy to have you with us. Please read the rules and verify to unlock the rest of the server.",
    "rulesLabel": "Rules",
    "rulesText": "**Read rules**",
    "verifyLabel": "Verify",
    "verifyText": "**Get Verify**"
  }
}
```

### Locating the channel ID

1. In Discord, open **User Settings** → **Advanced** and enable **Developer Mode**.
2. Right-click the target channel and select **Copy Channel ID**.
3. Paste the value into `welcome.channelId`.

`settings.json` must be valid JSON. Comments and trailing commas are not permitted.

---

## 6. Adding the welcome banner

Place the banner image at:

```
public/imgs/welcome.png
```

The canvas renderer expects the file at that exact path.

If a custom banner is used, adjust `avatarCenterX`, `avatarCenterY`, and `avatarWidth` in `src/welcome/canva.js` so the avatar aligns with the placeholder circle.

---

## 7. Running the bot

### Development (restarts on file changes)

```bash
npm run dev
```

### Production

```bash
npm start
```

Expected startup output:

```
[commands] Loaded testwelcome
[events] Bound clientReady (once)
[events] Bound messageCreate
[events] Bound guildMemberAdd

[bot] YourBot#0001 is online
[bot] Serving 1 guild(s)
[bot] Prefix: !
```

---

## 8. Verifying the setup

In any channel the bot can read, send:

```
!testwelcome
```

The bot will:

1. Render the invoking user's avatar into the welcome banner.
2. Send a Components V2 message containing the banner, welcome text, Rules and Verify buttons, and footer.

If only the image is sent and the components are missing, the installed `discord.js` version is too old. Upgrade and restart:

```bash
npm install discord.js@latest
```

To test the real join flow, leave and rejoin the server or use a secondary account.

---

## Troubleshooting

| Error | Resolution |
|-------|------------|
| `SyntaxError: Unexpected token '/'` in `settings.json` | Remove comments and trailing commas from the JSON. |
| `DISCORD_TOKEN` is undefined | `.env` is missing or not located in the project root. |
| `Used disallowed intents` | Enable Server Members and Message Content intents in the Developer Portal. |
| Bot online but no welcome message on join | Verify `welcome.channelId` and that the bot has Send Messages and Attach Files permissions in that channel. |
| Avatar not aligned with the circle | Adjust `avatarCenterX`, `avatarCenterY`, `avatarWidth` in `src/welcome/canva.js`. |
| Only the image appears, no components | Upgrade `discord.js` to `>= 14.19.0`. |

---

## Project structure

```
.
├── bot.js
├── package.json
├── settings.json
├── .env.example            # template, copy to .env                   
├── commands/
│   └── testwelcome.js
├── public/
│   └── imgs/
│       └── welcome.png
└── src/
    ├── utils.js
    ├── middleware.js
    ├── loader.js
    ├── events/
    │   ├── ready.js
    │   ├── messageCreate.js
    │   └── guildMemberAdd.js
    └── welcome/
        ├── index.js
        ├── canva.js
        └── components.js
```

---

## Quick reference

```bash
git clone https://github.com/Da3f4ult/Haven-System.git        # clone
cd Haven-System              # enter the project folder
npm install               # install dependencies
mv .env.example .env      # create .env from template
# edit .env and settings.json
npm run dev               # start (development)
npm start                 # start (production)
```