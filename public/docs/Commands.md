# Commands

Reference for every command the bot currently supports. All commands use the prefix defined in `settings.json` (default: `!`).

---

## `!testwelcome`

Renders the welcome card using the invoking user's own avatar and posts it in the current channel. Used to preview the welcome message without waiting for a new member to join.

### Usage

```
!testwelcome
```

### Arguments

None.

### Permissions

None required beyond the ability to send messages in the channel.

### Example output

The command produces the same card that is posted when a member joins: a rendered banner with the invoking user's avatar, the welcome greeting, Rules and Verify buttons, and the footer.

![Example output of !testwelcome](./Imgs/test.png)

*Screenshot: `!testwelcome` output in a test channel.*

### Notes

- The bot must have **Attach Files** and **Send Messages** permissions in the channel.
- If only the image is posted without the surrounding card, the installed `discord.js` version is older than `14.19.0`. See [Overview](https://havendoc.us.ci/#/doc/overview.md#troubleshooting).
- Adjusting the banner layout is done in `src/welcome/canva.js`. Adjusting the text, buttons, and links is done in `settings.json`.

---

## Adding more commands

New commands are picked up automatically from the `commands/` directory. A command file exports two fields:

```js
module.exports = {
  name: 'commandname',
  description: 'Short description of what the command does.',
  async execute(message, args, client) {
    // command logic
  },
};
```

Once the file is saved in `commands/`, the command becomes available as `!commandname` on the next bot restart. No registration step is required.

## Ticket slash commands

The ticket system uses slash commands under `/ticket` (see [Tickets.md](Tickets.md)). Register them with `npm run deploy-commands`.
