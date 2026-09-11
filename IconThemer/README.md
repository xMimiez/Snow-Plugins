# icon themer

By **Mime | N0_.q3**. A standalone Snow/Bunny spec-3 plugin.

Install this manifest in Snow:

https://raw.githubusercontent.com/xMimiez/Snow-plugins/main/IconThemer/manifest.json

## Features

- Five mobile icon families: Plumpy, Iconsax, Solar, Solar Duotone, Solar Broken. Duplicate repository copies and image density variants are merged; missing assets are supplemented from the other repository.
- Pack previews, searchable individual icon colors, and an optional default hex color. Alpha hex colors are accepted. Search an exact new Discord asset name to configure a color even if it is not yet in the catalog.
- A **custom icons** toggle at the top opens a warning. Custom editing appears above presets only after pressing the red **i know what i'm doing** button. Disabling custom icons preserves the saved links.
- Direct HTTPS PNG/WebP/JPEG links are validated with native image decoding and dimensions before saving. SVG and GitHub file-page links are rejected.
- Per-icon colors override the default color; custom images override presets. Preset artwork overrides theme image replacements, and explicit colors override theme tint colors. Blank color with a preset retains the pack's artwork colors. Original/theme mode with blank colors leaves theme rendering alone.
- Failed image URLs fall back to the pre-existing rendered icon. Retry failed images from settings. No theme files, accounts, other plugins, or their storage are changed.

The catalog is bundled and image URLs are pinned to repository commits. Pack discovery does not depend on GitHub API availability at runtime. Images require network access on first use; subsequent caching is managed by React Native. Source hosts receive ordinary image requests.

## Compatibility

Targets React Native function and forwardRef Image renderers exposed by Snow's Bunny spec-3 API. Themes+ retains `source.original`, allowing the plugin to resolve a themed image back to its Discord asset. Overrides are applied to the final native image source and tint props after the theme's rendering step. Unknown remote photos and assets outside the icon catalog are left alone unless explicitly configured.

Missing assets retain their existing icon. Icon packs cannot supply replacements for icons they do not contain, or for components that draw SVG/vector paths instead of using native Image. Unsupported asset registries/renderers fail with an explanatory message. Reopen a screen or reload Snow if it retains cached component references after enabling/disabling. Do not enable multiple copies of this plugin.

Verified with mocked React Native renderers, both Themes+ patch orders, live setting updates, custom confirmation, failed-download fallback and plugin cleanup. A physical Snow/Discord device was not available for on-device validation.

## Development

From the repository root, install its existing locked development dependencies with `npm ci`, then run:

```sh
node IconThemer/build.mjs
node --test IconThemer/test.mjs
```

This separate build writes only `IconThemer/index.js`. It does not change the shared registry or rebuild any existing plugin. Source imports the existing runtime without modifying it. Build output remains below Snow's 1 MiB bundle limit.

`src/catalog.json` records the complete selected PNG paths, source URLs and pinned commits for each mobile pack. The Vencord desktop SVG adaptations and font directories are not native mobile icon packs and are not included.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for upstream attribution and artwork licensing.
