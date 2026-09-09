import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const registry = JSON.parse(await readFile(new URL('src/registry.json', root), 'utf8'));
const ref = process.argv.find(arg => arg.startsWith('--ref='))?.slice(6) || 'main';
if (!/^[\w.-]+$/.test(ref)) throw new Error('Invalid Git ref');
let next = 0, verified = 0;
async function get(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response;
}
await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < registry.length) {
        const { folder } = registry[next++];
        const local = JSON.parse(await readFile(new URL(`${folder}/manifest.json`, root), 'utf8'));
        const base = `https://raw.githubusercontent.com/xMimiez/Snow-Plugins/${ref}/${folder}/manifest.json`;
        const remote = await (await get(base)).json();
        if (JSON.stringify(remote) !== JSON.stringify(local)) throw new Error(`${folder}: hosted manifest mismatch`);
        const bytes = new Uint8Array(await (await get(new URL(local.main, base))).arrayBuffer());
        const expected = new Uint8Array(await readFile(new URL(`${folder}/${local.main}`, root)));
        if (bytes.length !== expected.length) throw new Error(`${folder}: hosted bundle size mismatch`);
        verified++;
    }
}));
console.log(`Verified ${verified} hosted Bunny spec-3 manifest/main pairs at ${ref}.`);
