# Nighty Tab

Nighty Tab adds Nighty to Discord's mobile settings and can place a **Nighty** shortcut beside **Settings** in Discord's profile action bar. The shortcut reuses Discord's own control layout, so its spacing, label, touch target, and alignment match the other actions.

## Install on KettuTweak, Snowcord, or another compatible mobile client

You need a client that supports Bunny/Snow **spec 3** plugins and installation from a manifest URL.

1. Open your modded Discord client.
2. Go to **Settings → Plugins**.
3. Tap **Install from URL** or the **+** button.
4. Paste this manifest URL:

   ```text
   https://raw.githubusercontent.com/aboveproof/Snow-Plugins/main/NightyTab/manifest.json
   ```

5. Install and enable **Nighty Tab**.
6. Reload or fully restart Discord if the new profile-bar button does not appear immediately.

If you are testing another fork, replace `aboveproof/Snow-Plugins` and `main` in the URL with your GitHub username, repository, and branch. The `manifest.json` and `index.js` files must remain together in the `NightyTab` folder.

## Set up Nighty Tab

1. Open **Settings → Plugins → Nighty Tab**.
2. Enter the full `https://` URL of the Nighty page you want the tab to open.
3. Leave **Profile Nighty button** enabled to show it beside Discord's Settings action.
4. Choose **White logo** to match Discord's native bar icons, or **Blue logo** for Nighty's brand color. A custom HTTPS image URL is also supported.
5. Tap **Open Nighty** to test the page.

Inside the Nighty page, pull down from the top to reload. Pinch zoom and horizontal page movement are disabled so the embedded page stays fixed in place.

## Updating

Remove the older copy first if your client does not replace plugins cleanly, then install the same manifest URL again. Reload Discord after updating.

## Troubleshooting

- **The button is missing:** enable **Profile Nighty button**, then reload Discord. Discord UI updates can temporarily break injected controls.
- **The old oversized logo remains:** remove the old plugin, restart Discord, reinstall from the manifest URL, and reload once more.
- **Nighty does not load:** verify that the configured address begins with `http://` or `https://` and does not contain embedded credentials.
- **Install from URL fails:** open the manifest URL in your browser to confirm it is reachable, then copy it again without spaces.
- **KettuTweak/Snowcord has no Plugins page:** that build may not include a compatible plugin loader. Update the client or use a build that supports spec-3 plugins.

## Notes

Nighty Tab is a third-party plugin and is not affiliated with Discord or Nighty. Modified Discord clients may violate Discord's Terms of Service; use them at your own risk.
