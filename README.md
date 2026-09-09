# Snow Plugins

Past plugins and new ports for **Snow**, a third-party mobile Discord client. Maintained by **Mime | N0_.q3** with credit to every original author.

These releases use **Bunny spec 3**, the format the Snow Plugin Authoring Guide (8 September 2026) recommends for commands, settings, icons, Metro discovery, and Discord UI. They are not native schema-v2 plugins. Automated local checks exist; **on-device Snow validation is still required**. Desktop ports have mobile-specific limits.

## Install

Copy a plugin’s **Install** link below into Snow’s plugin installer, then enable it. If you previously installed a native schema-v2 build of the same plugin, disable and remove that installation first. Compatibility and native identities are different; keeping both enabled can duplicate buttons or commands.

Use **GifRoulette** for `/gifroulette`. MoreCommands is a migration entry only.

## Plugins

| Plugin | Current release | What it does | Install |
| --- | --- | --- | --- |
| [DebugConsole](DebugConsole/) | 2.1.0 | Clear/copy buttons, timestamps, grouped repeats, severity filter and search. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/DebugConsole/manifest.json) |
| [Decor](Decor/) | 2.1.0 | Equicord-compatible creation/equip API; PNG/APNG preservation and local JPEG → PNG. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/Decor/manifest.json) |
| [GifRoulette](GifRoulette/) | 2.1.0 | Only /gifroulette: sends one random favorite GIF. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/GifRoulette/manifest.json) |
| [HighlightCode](HighlightCode/) | 2.1.0 | Native code-block formatting with cloned chat rows. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/HighlightCode/manifest.json) |
| [MoreCommands](MoreCommands/) | 2.1.0 | Retired command collection. Migration notice; install GifRoulette. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/MoreCommands/manifest.json) |
| [NitroSniper](NitroSniper/) | 2.1.0 | Serial gift queue, duplicate prevention, timeouts, rate-limit handling and optional result webhook. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/NitroSniper/manifest.json) |
| [PreviewFile](PreviewFile/) | 2.1.0 | Small text attachment cards with expand/copy/open; /previewfile fallback for native-only rows. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/PreviewFile/manifest.json) |
| [ReplyToStatus](ReplyToStatus/) | 2.1.0 | Single profile button, themed reply sheet, rendered custom emojis; quoted DM replies. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/ReplyToStatus/manifest.json) |
| [SpotifyPreview](SpotifyPreview/) | 2.1.0 | Official Spotify embeds with loading/error/retry and app/browser actions. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/SpotifyPreview/manifest.json) |
| [TestPlugin](TestPlugin/) | 2.1.0 | Bunny API, settings, patch cleanup, sibling file fetch, popup and isolated WebView CSS checks. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/TestPlugin/manifest.json) |
| [AlwaysAnimate](AlwaysAnimate/) | 1.1.0 | Experimental: enables existing animation props; respects Reduce Motion by default. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/AlwaysAnimate/manifest.json) |
| [BlurNSFW](BlurNSFW/) | 1.1.0 | Experimental: tap-to-reveal cover for supported media components; native rows may be unaffected. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/BlurNSFW/manifest.json) |
| [NSFWGateBypass](NSFWGateBypass/) | 1.1.0 | Experimental: feature-detected local guild gate hooks; no account or server restriction changes. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/NSFWGateBypass/manifest.json) |
| [VolumeBooster](VolumeBooster/) | 1.1.0 | Probe only. No verified mobile audio gain API; boosting is not implemented. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/VolumeBooster/manifest.json) |
| [ValidUser](ValidUser/) | 1.1.0 | Mobile subset: local user-ID lookup via settings or /resolveuser. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/ValidUser/manifest.json) |
| [OpenInApp](OpenInApp/) | 1.1.0 | Mobile subset: supported service app links with original-link fallback. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/OpenInApp/manifest.json) |
| [PauseInvitesForever](PauseInvitesForever/) | 1.1.0 | /pauseinvites and /resumeinvites with server-specific confirmation and preserved guild features. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/PauseInvitesForever/manifest.json) |
| [OnePingPerDM](OnePingPerDM/) | 1.1.0 | Probe only. Policy ported/tested; no verified message-aware mobile sound hook. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/OnePingPerDM/manifest.json) |

## Development

Edit `src/` then run `npm ci`, `npm run build`, and `npm test`. The build emits Bunny spec-3 `manifest.json` + `index.js` (IIFE `plugin` export for Snow’s `(bunny, definePlugin)` loader). Historical `index.ts` files are leftover Bunny-era sources and are not the installed artifact.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for original authors, sources and licenses.
