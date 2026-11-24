# NitroSniper

Claims Nitro gift links posted in any channel you can read, the moment they arrive. New messages are scanned for `discord.gift/…` links, deduplicated, and queued; each claim runs the same redeem path the gift sheet's Accept button uses, falling back to the REST endpoint with automatic hCaptcha solving in an on-screen WebView. The Armed auto-press clicks the gift sheet's Accept button and hCaptcha's mobile "Wait! Are you human?" Confirm button for you, and a toast reports every stage: claiming, solving, pressing, claimed, or failed.

An optional Discord webhook receives a summary embed after each attempt. A toggle skips gift links you posted yourself.

A Snow port of neoarz/NitroSniper. Use at your own risk; Vencord does not endorse or support this plugin.

## Network

- `discord.com` — redeeming gift codes and fetching their type (the same calls the app's gift sheet makes).
- `js.hcaptcha.com` — the hCaptcha widget, inside its own WebView.
- Your webhook URL, if you set one.
