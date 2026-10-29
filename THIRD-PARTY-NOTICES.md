# Sources

`icons/new-tab.png` is Chromium's standard New Tab favicon, from [chromium/chromium](https://github.com/chromium/chromium/blob/main/chrome/app/theme/default_100_percent/common/favicon_ntp.png), under the BSD 3-Clause licence in `vendor/Chromium-LICENSE`.

The Abstract category links to Colorful Particles Sliding (gx7KLCC7eKY) by Music Vibes, Abstract Liquid Background Video 4K (pUWCnazcsbU) by Aerial Earth 🌎, Electric Space: Glowing Violet Filament Drift (hKckckhpbYY) by Relaxing Screensavers, and Electric Sheep in HD (jVD67pMdv9k) uploaded by Roaming Mosaics, based on Scott Draves and the Electric Sheep contributors' work. These are streamed YouTube videos, not locally bundled simulations or copied video files.

Background presets link to the original YouTube uploads by Smooth Jazz BGM, Nomadic Ambience, Coffee Shop Vibes, TheSilentWatcher, The Guild of Ambience, Lofi Girl and Oleg here! @gam_ol. Their videos and thumbnails are streamed from YouTube; they are not copied into this package. Names and video IDs are in src/background-core.js, with creator credits shown in settings. Video copyrights remain with their respective owners.

The emoji picker bundles @emoji-mart/data (Emoji Mart; MIT) and URL detection bundles linkify-it and uc.micro (MIT). Their licence notices are included in vendor/editor-licenses/. All datasets and scripts are local; no emoji search requests are sent over the network.

themes.css adapts palette variables from [Minimal for Obsidian by Steph Ango](https://github.com/kepano/obsidian-minimal), downloaded 28 October 2026, under the MIT licence in vendor/Minimal-LICENSE. Only colour variables are used. reference/minimal.css retains the original source and palette attribution comments. build-themes.mjs regenerates the palette stylesheet. Sky uses upstream's notion identifier. Dracula is offered for dark mode only, matching the upstream palette definitions.

The workspace editor bundles CodeMirror 6 and its Lezer Markdown parser under their MIT licences. Installed package versions are recorded in pnpm-lock.yaml; licence copies are in vendor/editor-licenses/. Source is in src/editor.js and can be bundled with node build.mjs after installing development dependencies.

DM Sans is bundled from https://github.com/google/fonts/tree/main/ofl/dmsans under the SIL Open Font License 1.1; see fonts/DMSans-OFL.txt. This is the body font declared in https://sgphysicsleague.org/shared.css.

`fonts/Roboto-Variable.ttf` is Roboto from [Google Fonts](https://github.com/google/fonts/tree/main/ofl/roboto), bundled locally under the SIL Open Font License 1.1. The licence and copyright notices are included in `fonts/OFL.txt`.

`vendor/ical.js` is the unmodified ES module distribution of [ICAL.js 2.2.1](https://github.com/kewisch/ical.js), distributed under the Mozilla Public License 2.0. Its licence is included as `vendor/ICAL-LICENSE`. Source: https://unpkg.com/ical.js@2.2.1/dist/ical.js. It is bundled locally; the installed extension does not load remote code.
