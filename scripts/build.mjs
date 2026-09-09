import { build } from 'esbuild';
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const registry = JSON.parse(await readFile(path.join(root, 'src/registry.json'), 'utf8'));

for (const plugin of registry) {
    const { folder, module, exportName = 'default', ...meta } = plugin;
    const source = `import { register } from './src/runtime.js'; import { ${exportName === 'default' ? 'default as factory' : exportName + ' as factory'} } from './src/plugins/${module}.js'; export default register(${JSON.stringify(meta)}, factory);\n`;
    const files = {
        name: 'project-files',
        setup(b) {
            b.onResolve({ filter: /.*/ }, args => ({
                path: path.relative(root, createRequire(path.resolve(root, args.importer || 'entry.js')).resolve(args.path)).replaceAll('\\', '/'),
                namespace: 'project',
            }));
            b.onLoad({ filter: /.*/, namespace: 'project' }, async args => ({
                contents: await readFile(path.join(root, args.path), 'utf8'),
                loader: args.path.endsWith('.json') ? 'json' : 'js',
            }));
        },
    };
    const output = await build({
        stdin: { contents: source, sourcefile: folder + '.entry.js' },
        plugins: [files],
        tsconfigRaw: {},
        bundle: true,
        write: false,
        format: 'iife',
        globalName: 'plugin',
        platform: 'neutral',
        target: 'es2022',
        minify: false,
        legalComments: 'inline',
        logLevel: 'warning',
    });
    const bytes = output.outputFiles[0].contents;
    if (!bytes.length || bytes.length > 1048576) throw new Error(`${folder}: invalid bundle size ${bytes.length}`);
    const directory = path.join(root, folder);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'index.js'), bytes);
    const manifest = {
        spec: 3,
        type: 'plugin',
        id: meta.id,
        version: meta.version,
        display: {
            name: meta.name,
            description: meta.description,
            authors: meta.authors,
        },
        main: 'index.js',
        extras: {
            license: meta.license,
            source: meta.source,
            bunny: {},
        },
    };
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    for (const name of await readdir(directory)) {
        if (name === 'snow.plugin.json' || /^plugin-\d/.test(name)) {
            await unlink(path.join(directory, name));
        }
    }
    console.log(`${folder} ${meta.version}: ${bytes.length} bytes`);
}
