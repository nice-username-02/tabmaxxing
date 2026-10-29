# Privacy policy for tabmaxxing

Updated 29 October 2026.

## Local data

The extension stores Markdown notes, tab names and emoji icons, the editor-mode preference, configured iCal URLs, the screen-sharing visibility setting, and a cache of the displayed calendar events (including titles, locations, start/end times, event UIDs/links, recurring occurrence identifiers and refresh timestamps) in chrome.storage.local in this Chrome profile. It does not use Chrome sync, analytics, tracking, or a separate server. The original single-pad notes are retained as a migration backup. The selected note tab is kept in sessionStorage per browser tab. Fonts and editor code are bundled locally.

## Markdown backups

Markdown backups are off by default and require you to choose a folder using Chrome’s folder picker. You can enable automatic updates or use Update backup manually. The selected directory handle is kept in IndexedDB; export preferences, file fingerprints, status and the last successful backup timestamp are stored locally. Directory access may need to be renewed in Settings. Existing note backup files are overwritten; older files from renamed or deleted notes remain. Backups are local files, not uploads. Uninstalling the extension does not remove exported files.

## Network requests

Optional YouTube backgrounds store the selected video ID/name, playback position and duration per video, volume, blur, panel opacity, and panel positions/sizes locally. Positions save periodically and when leaving or controlling playback, including audible background playback, to resume in future tabs. Volume is saved, but the unmuted state is kept only in the current page and is never restored or enabled by another tab. Each new page and newly started scene requires manual unmuting. The screen-sharing eye hides text without changing video/audio playback. Opening the background gallery loads video thumbnails from i.ytimg.com. Choosing a video loads YouTube's privacy-enhanced embedded player from www.youtube-nocookie.com; playback contacts YouTube/Google media servers and is subject to their data handling. No note text, calendar feed URL or calendar events are sent to the player. Solid colour disables the player. The popup only changes background settings; it does not play a second video.

If calendars are configured, their iCal feeds are fetched directly from calendar.google.com on opening a new tab, saving settings, clicking refresh, and approximately every five minutes while a tab is open. The URL's secret token is necessarily sent to Google to retrieve that calendar. Requests omit browser cookies. Notes are never sent. The calendar parser is bundled locally, with no remote script loading.

Clicking an event opens Google Calendar in a new tab with its event/calendar identifier, its supplied Google event link, or an event-title search for imported events with no native ID. Generated links never contain the secret iCal feed token. Google Calendar handles authentication and editing outside the extension.

## Permissions

- storage: save notes, preferences and calendar cache locally.
- https://calendar.google.com/*: retrieve the calendar feeds you configure.
- declarativeNetRequestWithHostAccess and access to https://www.youtube-nocookie.com/* identify this extension on its own embedded-player requests. A rule supplies a Referer based on the extension's own ID to avoid YouTube error 153. It applies only to subframe requests initiated by this extension to that host, and does not modify browsing requests from other pages.
- A bundled quality-menu helper runs in YouTube privacy-enhanced embeds but stays inactive unless its parent is this extension. It reads and operates that player's native resolution menu only; it does not send player data to a separate server or inspect ordinary pages.
- The extension replaces the new-tab page and provides a toolbar popup.

## Removing data

Clear all calendar links in settings and save to remove the links and event cache. Delete the notepad contents to clear the notes. Uninstalling the extension removes its stored data. Removing a secret link here does not revoke that link at Google; reset it in Google Calendar if it has been disclosed.

The preview page is separate: it uses the preview site's localStorage. Clear that site's data to remove preview data.
