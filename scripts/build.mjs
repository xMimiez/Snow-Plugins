import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
const root = path.resolve(import.meta.dirname, '..');
const registry = JSON.parse(await readFile(path.join(root,'src/registry.json'),'utf8'));
for (const plugin of registry) {
    const { folder, module, exportName = 'default', ...meta } = plugin;
    const source = `import { register } from './src/runtime.js'; import { ${exportName === 'default' ? 'default as factory' : exportName + ' as factory'} } from './src/plugins/${module}.js'; register(${JSON.stringify(meta)},factory);`;
    // Explicit resolution also avoids scanning unrelated parent directories for config.
    const files = { name:'project-files', setup(b) {
        b.onResolve({filter:/.*/}, args => ({path:path.relative(root,createRequire(path.resolve(root,args.importer || 'entry.js')).resolve(args.path)).replaceAll('\\','/'),namespace:'project'}));
        b.onLoad({filter:/.*/,namespace:'project'}, async args => ({contents:await readFile(path.join(root,args.path),'utf8'),loader:args.path.endsWith('.json')?'json':'js'}));
    }};
    const output = await build({ stdin: { contents:source, sourcefile:folder+'.entry.js' }, plugins:[files], tsconfigRaw:{}, bundle:true, write:false, format:'iife', platform:'browser', target:'es2020', minify:false, legalComments:'inline', logLevel:'warning' });
    const bytes = output.outputFiles[0].contents;
    if (!bytes.length || bytes.length > 1048576) throw new Error(`${folder}: invalid bundle size ${bytes.length}`);
    const directory = path.join(root,folder), filename = `plugin-${meta.version}.js`;
    await mkdir(directory,{recursive:true});
    await writeFile(path.join(directory,filename),bytes);
    const manifest = {schemaVersion:2,...meta,apiVersion:1,reload:'plugin'};
    await writeFile(path.join(directory,'snow.plugin.json'),JSON.stringify({...manifest,entry:filename},null,2)+'\n');
    await writeFile(path.join(directory,'manifest.json'),JSON.stringify({...manifest,bundle:{url:'./'+filename,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}},null,2)+'\n');
    console.log(`${folder} ${meta.version}: ${bytes.length} bytes`);
}
