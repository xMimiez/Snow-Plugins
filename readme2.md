# Snow plugin development notes — readme2.md

Updated: September 9, 2026. Maintainer: **Mime | N0_.q3**, Discord ID **957164619061932045**. Keep all original authors alongside Mime in both native manifest `authors` and runtime `author` metadata.

## Scope and result

Ten existing plugin entries migrated to native Snow: DebugConsole, Decor, GifRoulette, HighlightCode, MoreCommands, NitroSniper, PreviewFile, ReplyToStatus, SpotifyPreview and TestPlugin. Eight requested desktop/mobile ports have native packages: AlwaysAnimate, BlurNSFW, NSFWGateBypass, VolumeBooster, ValidUser, OpenInApp, PauseInvitesForever and OnePingPerDM. VolumeBooster and OnePingPerDM are explicitly labelled probes, not working audio ports. MoreCommands is a migration notice with no command registrations.

Existing native releases use 2.0.0 to mark the format migration; newly introduced ports use 1.0.0. The version suffix is supplied by Snow’s loader. Switching from “Bunny” to “Snow” requires installing the schema-v2 native manifest and disabling the old compatibility installation.

No live Discord message, gift redemption, image upload or server setting change was performed during development. Automated tests use mock network transports. The requested final documentation webhook is a separate, explicitly authorized delivery; its secret URL is not stored in this repository.

## Native SDK contracts learned

Source: the user-supplied **Snow-Plugin-Authoring-Guide.md**, September 8, 2026 snapshot, covering Discord iOS 343.0 build 109809, React Native 0.86 and Hermes 98. The guide remains local; these notes summarize the relevant contracts.

- Native distribution manifests use `schemaVersion: 2`, `apiVersion: 1`, `reload: "plugin"`, declared capabilities, and a `bundle` containing its HTTPS-resolvable URL, SHA-256 and byte length. The bundle limit is 1 MiB. Authoring `entry` and distribution `bundle` are mutually exclusive.
- A native IIFE calls `globalThis.__snowRegisterPlugin(definition)` exactly once, synchronously during evaluation. Runtime ID, version, dependencies and reload mode must match the manifest. Runtime author IDs are BigInt; JSON author IDs are decimal strings.
- The private `@snow/dev/sdk` helper does not itself register a plugin. Do not depend on an assumed public npm SDK. This repository bundles ordinary JavaScript and performs the documented registration directly.
- `start(context)` gets the requested groups in `context.api`: commands, Flux, patcher, storage and UI. Request only what a plugin uses. There is no documented native CSS, filesystem or general network capability group.
- Commands use `context.api.commands.registerCommand`. The registrar supplies IDs and sends a returned `{content}` once. Do not assign negative IDs, patch the command registry, or manually send while also returning content. Local popup commands return nothing.
- Patch signatures are name-first: `before/after/instead(method, parent, callback)`. `instead` forwards with `next(...args)`. Commands, patches, Flux subscriptions and keyed alerts have scoped ownership.
- Native storage has `createStorage`, `value` and `flush`, not the compatibility `useProxy` hook. Fill missing defaults explicitly and notify React subscribers when settings change.
- Current broader host access is `globalThis.snow.metro.common` and `snow.api.*`. React, React Native and Discord components come from the host, never a bundled second React. Raw JSX/sheet integrations need explicit cleanup. There is no documented `snow.api.commands` registrar.
- Modern Discord Text uses variants and semantic colors; Button uses `text`, `variant`, `size` and `onPress`; modern TextInput uses `onChange`, unlike RN’s `onChangeText`. Sheet content is wrapped in Discord’s ActionSheet, with a Close button and a rendering-error fallback.
- JSX hook names and private Discord Metro exports depend on the client build. A registered hook is not evidence it ever matched a real rendered component. CamelCase mobile models and snake_case REST models both occur.
- Fetch/body reads have deadlines. Disabling a plugin aborts its pending requests and closes its owned sheets. UI state setters are guarded after unmount where asynchronous interactions occur.

## Existing plugin changes

### ReplyToStatus

Multiple nested or sibling profile components can render at once. A shared ownership registry plus React context permits one reply button per visible user profile. Unmount releases ownership. A scoped sheet replaces guessed popup calls; rendering failures show a Close action rather than leaving an invisible modal barrier.

Status emoji fields support camelCase/snake_case models, Unicode, `<:name:id>`, `<a:name:id>` and raw `<id>` text. Custom emoji tokens render as Discord CDN images, with readable name fallback if loading fails. Replies use a quoted DM with mentions disabled. A verified mobile equivalent of desktop status-reply metadata was not available, so this is explicitly a transport difference, not a claimed 1:1 port.

### DebugConsole

Live timestamps, severity labels, pretty object formatting, circular references, repeat grouping, search and a warnings/errors filter. Clear and Copy buttons appear in settings and `/console`; `/consoleclear` is also available. Capture is bounded to 400 entries and 12,000 characters per entry. Known authorization, GitHub credential and Discord webhook patterns are redacted; this is not a guarantee arbitrary application logs contain no private data. Existing console/global-error handlers are preserved and restored on unload.

### Decor

API behavior was checked against [Equicord’s API module](https://github.com/Equicord/Equicord/blob/3b617d4f02be78808dfbfc1b192e1fd20fe5db00/src/plugins/decor/lib/api.ts), [creation store](https://github.com/Equicord/Equicord/blob/3b617d4f02be78808dfbfc1b192e1fd20fe5db00/src/plugins/decor/lib/stores/CurrentUserDecorationsStore.ts) and [creation modal](https://github.com/Equicord/Equicord/blob/3b617d4f02be78808dfbfc1b192e1fd20fe5db00/src/plugins/decor/ui/modals/CreateDecorationModal.tsx), plus the original mobile client’s URI-file representation.

- Create: `PUT https://decor.fieryflames.dev/api/users/@me/decoration`, bearer **Decor** token, multipart `image` and `alt` fields. RN uses `{uri, type, name}` for the image; it does not use a browser File or a hand-built ArrayBuffer multipart payload. Let RN set the multipart boundary.
- Validate the returned decoration’s `hash`, then append it to Custom immediately. Invalidate older refresh generations so an in-flight stale refresh cannot erase that new item.
- Equip separately through the same endpoint with multipart `hash`. Creation success remains visible and cached even when equip fails. The service controls moderation/review and when other users can see a decoration.
- The old UI abandoned the upload after 12 seconds while the request could finish later. The new transport has one 60-second upload deadline with abort, visible errors, a duplicate-submission guard and a `finally` reset of the Creating state. An uncertain network result advises refreshing Custom before resubmitting.
- PNG and APNG bytes are preserved, including APNG frame chunks. JPEG is decoded locally and encoded as a true RGBA PNG. MIME labels are not merely renamed. HEIC/GIF/WebP are rejected with conversion guidance rather than silently flattening animation. Local limits are 8 MB and 4 megapixels; service limits may be lower. Photo picker resizing/compression options were removed so the plugin does not intentionally flatten APNG; picker preservation still needs device testing.
- Tiny-image tests exposed insufficient output allocation in the installed UPNG encoder. Production JPEG conversion instead uses a small PNG chunk encoder with CRCs and pako deflate; UPNG remains a decoder/APNG-fixture dependency only for tests.
- The OAuth `client=vencord` backend identifier matches Equicord and has no relationship to the installed Snow plugin format. Redirects must match the Decor origin and authorization path. Authorization is initiated by user interaction, not automatically at plugin startup.
- Decor pages use owned Snow sheets. The existing avatar decoration renderer/profile integration is preserved with native scoped patches; actual private component coverage still needs mobile testing.

The user explicitly approved image/name/Decor-token submission to this endpoint and subsequent equipping. No credential values are included here.

### GifRoulette and MoreCommands

GifRoulette is the renamed command collection and registers only `/gifroulette`. It normalizes common favorite GIF shapes and returns one selected URL for Snow to send. MoreCommands registers no commands and directs existing users to GifRoulette, preventing duplicate registration if both entries are installed. No other old MoreCommands commands are present in its current native bundle.

### PreviewFile and HighlightCode

PreviewFile keeps the original attachment card and adds a short text snippet with expand, selectable text, copy and original-link actions. Loading is explicit, restricted to Discord attachment CDN URLs and supported text extensions, with a 256 KB limit and bounded cache. Signed query strings are preserved. Native-only chat rows may bypass these JSX hooks; `/previewfile url:<attachment URL>` provides a local viewer fallback. This is a mobile approximation of desktop file previews, not its embedded editor.

HighlightCode retains the existing tokenizer and native row hooks, now using scoped Snow patches/storage. Row transformations clone their inputs so stored messages are not rewritten. Native row/component formats remain a device-validation item.

### NitroSniper

The supplied `neoarz/NitroSniperthe` link was unavailable; the existing plugin’s original reference is [neoarz/NitroSniper](https://github.com/neoarz/NitroSniper/tree/4877e9e73565e0f157df96e8b6c8735e9647b226), which was inspected.

One MESSAGE_CREATE subscription replaces duplicate intercept/subscription handling. Gift codes are deduplicated (bounded 4,096-item history); at most 100 requests queue, processed serially. Historical messages and optional own links are skipped. A single REST redemption path replaces unverified mobile callback signatures, avoiding never-fired completion callbacks. Requests time out; uncertain timeouts are not retried. Explicit 429 responses allow two bounded retries honoring `retry_after` up to 120 seconds. Shutdown stops pending queue work and late toasts/webhooks. Claim results and webhook errors are visible, and the optional webhook uses a validated Discord HTTPS URL with mentions disabled. Gift type, author and message links enrich results where available. No real gifts were redeemed during testing.

### SpotifyPreview and TestPlugin

Spotify URLs are parsed by exact host and supported resource type, including localized `intl-*` paths, then converted to one official embed URL. Sheets offer loading/error/retry, Open Spotify, Open original and Close. Missing host URL/WebView/sheet support falls back or reports a clear error. Spotify controls playback length/availability. OpenInApp and SpotifyPreview share one independently cleaned-up URL handler; preview takes priority.

TestPlugin tests native settings persistence, a local scoped patch and cleanup, bundled sibling imports, hosted JSON/JS file reads (without evaluating fetched JavaScript), a native alert, a sheet, and CSS inside an isolated WebView. It exposes module availability without dumping account data. React Native has no document-wide browser CSS injection API. `/testplugin` opens its report.

## New port limits

| Plugin | Mobile implementation and boundary |
| --- | --- |
| AlwaysAnimate | Enables supported existing boolean animation props; Reduce Motion respected by default. Does not invent native animation APIs. |
| BlurNSFW | Tap-to-reveal cover replaces desktop hover blur. Hidden media is not mounted, preventing hidden autoplay. Cannot cover native rows that bypass JSX. |
| NSFWGateBypass | Hooks supported local invite/guild gate checks only. Reports when absent; does not mutate stored account age or `nsfwAllowed`. |
| VolumeBooster | Probe only. Desktop Web Audio gain has no verified Snow native equivalent. No fake above-max slider. |
| ValidUser | Manual local lookup in settings or `/resolveuser`; populates returned user data. No desktop hover or inferred badges. |
| OpenInApp | Spotify, Steam, Tidal, Apple Music and public Telegram usernames. OS app-scheme detection can be limited; original HTTPS link is the fallback. Desktop-only services are omitted. |
| PauseInvitesForever | Confirmed server-specific `/pauseinvites` and `/resumeinvites`. Reads current guild features and changes only membership of `INVITES_DISABLED`; server permissions are checked by Discord. Concurrent admin feature edits between GET/PATCH remain an API race. |
| OnePingPerDM | Desktop unread/DM/mention exemption policy is ported and tested. No live sound suppression until a message-aware native notification hook is verified. Never blocks MESSAGE_CREATE to suppress audio. |

The user approved the confirmed server-wide invite controls. No server settings were changed while developing them.

## Validation and what to test next

`npm run build` emits 18 native packages under the 1 MiB limit. `npm test` currently passes **19 automated tests**, including all production bundles evaluating/registering once, exact hashes/sizes, start/settings/stop with only declared capabilities, profile ownership, DM-send deduplication, error-boundary Close behavior, console formatting/clear, GIF send semantics, Nitro queue/stop behavior, URL fallback and unload order, file validation, PNG/APNG/JPEG conversion, Decor multipart/cache/error/abort behavior, invite confirmation/feature preservation, and immutable code-block row transformation.

These are Node/React mock tests, **not live Snow/iOS validation**. No claim of fully working desktop parity is justified until the following checks are done on the target client:

1. Disable old Bunny versions, install native manifests, and verify the Snow loader label. Confirm disabling/re-enabling removes every button, command, hook and sheet.
2. Open multiple profile layouts, including self and other users, with Unicode/animated/custom statuses. Confirm one button, usable keyboard, one DM send and working Close/swipe dismissal in light/dark themes.
3. Decor: test a small PNG, JPEG and APNG; verify the native picker preserves animation, multipart works on the device, Custom persists after refresh/restart, equip errors remain actionable, and cancelled/failed requests never leave Creating stuck.
4. PreviewFile: test native attachment rows and the command fallback, UTF-8 files, expired signed URLs, binary/large files, expand/copy/open.
5. Spotify: test installed/uninstalled app, unavailable embeds, slow network, localized links and coexistence with OpenInApp. TestPlugin should produce a sanitized compatibility report.
6. Test guild invite pause/resume only with appropriate permissions in the intended server; confirm cancellation sends no request. Test NitroSniper only with controlled fixtures first.
7. Capture actual native animation/media/notification/audio exports before promoting experimental ports or the two probes to working status.

## Repository and release procedure

- Current editable code: `src/runtime.js`, `src/plugins/*`, `src/image-conversion.js`, `src/url-hub.js`, `src/registry.json`.
- Reproduce: `npm ci`, `npm run build`, `npm test`. Legacy `index.ts` files remain frozen for historical URLs/caches; current manifests point only to native `plugin-*.js` bundles.
- The build writes exact distribution hashes and lengths. Publish versioned bundles before manifests and retain prior files. Do not overwrite an already published version’s bytes without advancing its version and filename.
- Native and compatibility storage IDs differ. Do not silently erase settings or assume cross-format migration; document reconfiguration instead.
- Preserve original authors/licenses. Root MIT applies to original Mime code; per-plugin licenses and third-party notices cover upstream-derived parts. See THIRD_PARTY_NOTICES.md.
- Never save GitHub tokens, Discord webhook secrets, VPS credentials or unrelated desktop files in the repository or diagnostics. This work targets the local desktop plugin project, not the VPS. Never upload images to Roblox; the user uploads any Roblox images themselves.
