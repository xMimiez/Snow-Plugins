# Snow-Plugins

Bunny-compatible spec-3 plugins for Snow. Each plugin folder contains its own
`manifest.json` and JavaScript-compatible `index.ts`; no build step is needed.

## GifRoulette (formerly MoreCommands)

MoreCommands has been replaced by **GifRoulette**, which registers only
`/gifroulette`. The other commands and message-transform settings have been removed.

Remove the old MoreCommands installation and install this folder URL in Snow/Bunny:

https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/GifRoulette/

## Development checks

Run `npm ci` followed by `npm test`. These tests exercise the plugins in a mocked
Bunny runtime with React. Check native layout and interaction in Snow on a device
before treating the tests as device validation.
