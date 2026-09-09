# Snow Plugins

Past plugins and new ports for **Snow**, an upcoming third-party mobile Discord client. Maintained by **Mime | N0_.q3** with credit to every original author.

These releases use **native Snow API v1** and schema-v2 manifests, following the supplied September 8, 2026 authoring guide. They do not use the Bunny loader. Automated tests pass; **on-device Snow validation is still required**. Desktop ports have mobile-specific limits.

## Install

Copy a plugin’s **Install** link below into Snow’s plugin installer, then enable it. When replacing a Bunny version, disable/remove that old installation first, then install the native manifest. Compatibility and native installations have different runtime identities; keeping both enabled can duplicate buttons or commands. Existing compatibility settings may need to be re-entered.

Use **GifRoulette** instead of MoreCommands. TestPlugin’s loader label becomes **Snow** after installing its native manifest; a hosted version-number edit cannot change an already installed Bunny artifact.

## Plugins

| Plugin | Current release | What it does | Install |
| --- | --- | --- | --- |
| [DebugConsole](DebugConsole/) | 2.0.0 | Clear/copy buttons, timestamps, grouped repeats, severity filter and search. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/DebugConsole/manifest.json) |
| [Decor](Decor/) | 2.0.0 | Equicord-compatible creation/equip API; PNG/APNG preservation and local JPEG → PNG. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/Decor/manifest.json) |
| [GifRoulette](GifRoulette/) | 2.0.0 | Only /gifroulette: sends one random favorite GIF. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/GifRoulette/manifest.json) |
| [HighlightCode](HighlightCode/) | 2.0.0 | Native code-block formatting with cloned chat rows. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/HighlightCode/manifest.json) |
| [MoreCommands](MoreCommands/) | 2.0.0 | Retired command collection. Migration notice; install GifRoulette. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/MoreCommands/manifest.json) |
| [NitroSniper](NitroSniper/) | 2.0.0 | Serial gift queue, duplicate prevention, timeouts, rate-limit handling and optional result webhook. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/NitroSniper/manifest.json) |
| [PreviewFile](PreviewFile/) | 2.0.0 | Small text attachment cards with expand/copy/open; /previewfile fallback for native-only rows. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/PreviewFile/manifest.json) |
| [ReplyToStatus](ReplyToStatus/) | 2.0.0 | Single profile button, themed reply sheet, rendered custom emojis; quoted DM replies. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/ReplyToStatus/manifest.json) |
| [SpotifyPreview](SpotifyPreview/) | 2.0.0 | Official Spotify embeds with loading/error/retry and app/browser actions. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/SpotifyPreview/manifest.json) |
| [TestPlugin](TestPlugin/) | 2.0.0 | Native API, settings, patch cleanup, sibling file fetch, popup and isolated WebView CSS checks. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/TestPlugin/manifest.json) |
| [AlwaysAnimate](AlwaysAnimate/) | 1.0.0 | Experimental: enables existing animation props; respects Reduce Motion by default. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/AlwaysAnimate/manifest.json) |
| [BlurNSFW](BlurNSFW/) | 1.0.0 | Experimental: tap-to-reveal cover for supported media components; native rows may be unaffected. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/BlurNSFW/manifest.json) |
| [NSFWGateBypass](NSFWGateBypass/) | 1.0.0 | Experimental: feature-detected local guild gate hooks; no account or server restriction changes. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/NSFWGateBypass/manifest.json) |
| [VolumeBooster](VolumeBooster/) | 1.0.0 | Probe only. No verified mobile audio gain API; boosting is not implemented. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/VolumeBooster/manifest.json) |
| [ValidUser](ValidUser/) | 1.0.0 | Mobile subset: local user-ID lookup via settings or /resolveuser. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/ValidUser/manifest.json) |
| [OpenInApp](OpenInApp/) | 1.0.0 | Mobile subset: supported service app links with original-link fallback. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/OpenInApp/manifest.json) |
| [PauseInvitesForever](PauseInvitesForever/) | 1.0.0 | /pauseinvites and /resumeinvites with server-specific confirmation and preserved guild features. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/PauseInvitesForever/manifest.json) |
| [OnePingPerDM](OnePingPerDM/) | 1.0.0 | Probe only. Policy ported/tested; no verified message-aware mobile sound hook. | [Install](https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/OnePingPerDM/manifest.json) |

## Past versions and development

The 1.x collection used Bunny spec-3 syntax. Old `index.ts` files are retained as frozen historical release artifacts for existing URLs and caches. **Edit `src/` for current development**, then run `npm ci`, `npm run build`, and `npm test`. New code is emitted to versioned `plugin-*.js` files with exact SHA-256/byte pins in each `manifest.json`. Keep older published bundles available when releasing an update.

`snow.plugin.json` is the authoring form; install `manifest.json`. The supplied Snow tooling is private, so the build uses the documented native registration contract without importing an unpublished SDK package.

See [readme2.md](readme2.md) for implementation notes, test coverage and the mobile validation checklist, and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for original authors, sources and licenses.
