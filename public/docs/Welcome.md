# Welcome Commands

This page documents the welcome-related commands currently available in Haven System.

All prefix commands use the value configured in `settings.json`. The default prefix is `!`.

## `testwelcome`

Renders the welcome card using the invoking user’s avatar and posts it in the current channel. Use this command to preview the welcome experience without waiting for a member to join.

### Usage

```text
!testwelcome
```

Replace `!` if the `prefix` value in `settings.json` is different.

### Arguments

None.

### Required permissions

The user needs permission to send messages in the channel. The bot also needs:

- **View Channel**
- **Send Messages**
- **Attach Files**
- **Embed Links**

### Expected result

The command produces the same card used by the member-join flow:

- A rendered banner containing the invoking user’s avatar.
- The configured welcome message.
- **Rules** and **Verify** buttons.
- The configured footer.

![Example output of the welcome preview command](./Imgs/test.png)

*Example output from `!testwelcome`.*

### Customization

- Edit welcome text, button labels, button links, and footer in `settings.json`.
- Replace the background image at `public/imgs/welcome.png`.
- Adjust avatar placement in `src/welcome/canva.js`.

If the image appears without its surrounding card, confirm that the installed `discord.js` version is `14.19.0` or newer. See the [installation guide](overview.md#troubleshooting).

## Adding a prefix command

Prefix commands are loaded automatically from the `commands/` directory. A command module should export a `name` and an `execute` function:

```js
module.exports = {
  name: 'commandname',
  description: 'Describe what the command does.',

  async execute(message, args, client) {
    // Command logic
  },
};
```

Save the file as `commands/commandname.js`, then restart the bot. It will be available as `<prefix>commandname`; no separate registration step is required.

## Ticket slash commands

Ticket commands use the `/ticket` slash-command group rather than the prefix-command loader. See the [Ticket System guide](Tickets.md) for setup, permissions, and the complete command reference.

After changing ticket command code, register the command again:

```bash
npm run deploy-commands
```
