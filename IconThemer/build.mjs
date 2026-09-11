import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
const output = await build({
    stdin: { contents: "import plugin from './src/entry.js'; export default plugin;", sourcefile: 'entry.js' },
    plugins: [{ name: 'plugin-files', setup(b) {
        b.onResolve({ filter: /.*/ }, args => ({ path: path.resolve(path.isAbsolute(args.importer) ? path.dirname(args.importer) : root, args.path), namespace: 'plugin' }));
        b.onLoad({ filter: /.*/, namespace: 'plugin' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: args.path.endsWith('.json') ? 'json' : 'js' }));
    } }],
    tsconfigRaw: {}, write: false, bundle: true, format: 'iife', globalName: 'plugin', platform: 'neutral', target: 'es2022', minify: true, legalComments: 'inline',
});
const bytes = output.outputFiles[0].contents;
const size = bytes.length;
if (size > 1048576) throw new Error(`Plugin exceeds 1 MiB: ${size}`);
await writeFile(root + 'index.js', bytes);
console.log(`IconThemer: ${size} bytes`);
