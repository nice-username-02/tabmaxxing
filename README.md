# tabmaxxing

A new-tab workspace for Chrome with Markdown notes, Google Calendar events, themes, and optional video backgrounds.

## Install locally in Chrome

1. On this GitHub page, click **Code → Download ZIP**.
2. Extract the ZIP into a folder you want to keep on your computer.
3. Open Chrome and enter `chrome://extensions` in the address bar.
4. Turn on **Developer mode** in the top-right corner.
5. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
6. Open a new tab. If Chrome asks about the new-tab change, choose **Keep it**.

That's it. No build step, Node.js, API key, or extension account is needed. Calendar feeds and video backgrounds are optional.

Keep the extracted folder in place while the extension is installed. If another extension controls your new-tab page, disable it first. You can pin **tabmaxxing** from Chrome's Extensions menu to access its toolbar popup.

## Get started

- **Notes:** type to save automatically. Use **+** to add another note tab. Markdown headings, lists, links, and checkboxes are supported.
- **Appearance:** click the gear in the top-right corner to choose themes and optional video backgrounds.
- **Privacy:** click the eye icon to hide workspace text while screen sharing.
- **Backups:** in **Settings → Markdown backups**, choose a folder, then enable automatic exports or click **Update backup**. Backups are off by default.

## Add Google Calendar events (optional)

1. Open Google Calendar in your browser.
2. Go to **Settings → Settings for my calendars → your calendar → Integrate calendar**.
3. Copy the **Secret address in iCal format**.
4. In a tabmaxxing new tab, click the gear and paste the address under **Calendars**. Use one address per line for multiple calendars.
5. Click **Save**.

Your upcoming events appear in the sidebar. Click an event to open it in Google Calendar. Keep secret calendar addresses private; anyone with the link can read that calendar. Some managed calendars do not offer a secret address.

## Update your local installation

Download and extract the latest files into the same installation folder. Then open `chrome://extensions`, click **Reload** on **tabmaxxing**, and open a fresh new tab. Keep the existing extension installed to retain its locally stored notes and settings.

## Development (optional)

The ready-to-use JavaScript is included in the repository. To rebuild the editor after changing its source, install Node.js and pnpm, then run:

```sh
pnpm install --frozen-lockfile
pnpm build
```

Run the regression tests with `pnpm test` or `node --test tests/calendar.test.js tests/background.test.js tests/note-export.test.js`.

## Privacy and third-party notices

Notes and settings are stored locally in your Chrome profile. Optional calendars and backgrounds contact Google and YouTube.

See [PRIVACY.md](PRIVACY.md) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for details and third-party notices.
