# Third-party notices

The icon themer implementation is MIT licensed. Icon artwork is loaded from its upstream sources; images are not embedded or relicensed by this plugin.

## Icon pack repositories

- [mudrhiod/discord-iconpacks](https://github.com/mudrhiod/discord-iconpacks), snapshot `6e32a7678531d1be32bb59aa1b6d282f6fb73e8a`, `plus/` mobile packs.
- [Rairof/discord-iconpacks](https://github.com/Rairof/discord-iconpacks), snapshot `ce812f40f184c75327f4d72812b9e35cf8fcb820`, `Packs/` mobile packs.

Both repositories provide a [GNU GPL version 3 license](https://www.gnu.org/licenses/gpl-3.0.html). Their upstream artwork also retains its original attribution and applicable terms:

- Rosiecord Plumpy: Rosie, samara, Rairof, and [Icons8 Plumpy](https://icons8.com/icons/plumpy).
- Rosiecord Iconsax: Rosie, Flower :3, mudrhiod and [Iconsax](https://iconsax.io/).
- Solar, Solar Duotone, Solar Broken: mudrhiod and the [Solar icon collection](https://www.figma.com/community/file/1166831539721848736/).

Catalog entries combine missing paths from both copies of a pack. Rairof's maintained Plumpy copy has precedence; mudrhiod's upstream Iconsax and Solar copies have precedence. Each group in `src/catalog.json` records the exact source of its files. Highest available pixel-density variants are used once per canonical asset path.

## Themes+ reference

[ThemesPlus](https://github.com/nexpid/ThemesPlus) documentation and [nexpid/RevengePlugins Themes+](https://github.com/nexpid/RevengePlugins/tree/main/src/plugins/themes-plus) were inspected to understand mobile asset paths, source.original, and theme tint behavior. Themes+ code is not bundled. Themes+ is not required to use this plugin.

## Shared Snow runtime

This plugin bundles the repository's existing MIT-licensed `src/runtime.js`, unchanged. See the repository root LICENSE for its notice. No existing plugin files are modified by this addition.
