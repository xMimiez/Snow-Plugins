import catalog from './catalog.json' with { type: 'json' };

export const packs = catalog;
export const normalizePath = path => path.replace(/@[123]x(?=\.)/g, '').replace(/^\.\.\//, '_/');
const byPack = new Map();
export const iconNames = new Set();
for (const pack of packs) {
    const paths = new Map(), names = new Map();
    for (const group of pack.groups) for (const path of group.files) {
        const canonical = normalizePath(path);
        const name = canonical.split('/').pop().replace(/\.png$/, '');
        const entry = { uri: group.base + path, path: canonical, name };
        paths.set(canonical, entry);
        // Ambiguous names require an exact asset path instead of picking an unrelated image.
        names.set(name, names.has(name) ? null : entry);
        iconNames.add(name);
    }
    byPack.set(pack.id, { paths, names });
}

export function colorValue(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (!/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(text)) throw new Error('Use a hex color: #RGB, #RGBA, #RRGGBB, or #RRGGBBAA.');
    return text;
}

export function previewUrl(packId, name) {
    return byPack.get(packId)?.names.get(name)?.uri;
}

export function imageUrl(value) {
    const url = new URL(String(value).trim());
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use a public HTTPS image link without credentials.');
    if (url.hostname === 'github.com' && url.pathname.includes('/blob/')) throw new Error('Use the Raw image link, not a GitHub file page.');
    if (!/\.(png|webp|jpe?g)$/i.test(url.pathname)) throw new Error('Use a direct PNG, WebP, or JPEG link. SVG and webpage links do not work in native Image.');
    return url.href;
}

export function validateDimensions(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 16 || height < 16 || width > 1024 || height > 1024) throw new Error('Use an image between 16 and 1024 pixels per side.');
    if (Math.max(width, height) / Math.min(width, height) > 4) throw new Error('The aspect ratio is too wide or tall for an icon. Match the original icon proportions.');
}

export function originalSource(source) {
    const visited = new Set();
    for (let n = 0; n < 8 && source && typeof source === 'object' && !visited.has(source); n++) {
        visited.add(source);
        if (source.original !== undefined) source = source.original;
        else if (Array.isArray(source) && source.length === 1) source = source[0];
        else break;
    }
    return source;
}

export function assetPath(asset) {
    if (!asset?.name) return '';
    const location = (asset.httpServerLocation || '').split('/').slice(2).join('/');
    return normalizePath(`${location ? location + '/' : ''}${asset.name}.${asset.type || 'png'}`);
}

export function createEngine(store, getAsset) {
    const failed = new Set();
    function identify(source) {
        const original = originalSource(source);
        if (typeof original === 'number') {
            try { return getAsset(original); } catch { return undefined; }
        }
        if (original?.allowIconTheming && typeof original.file === 'string') {
            const path = original.file.split('/');
            const file = path.pop();
            return { name: file.replace(/\.[^.]+$/, ''), type: file.split('.').pop(), httpServerLocation: '//_/external/' + path.join('/'), width: original.width, height: original.height };
        }
    }
    function resolve(source) {
        const asset = identify(source);
        if (!asset?.name) return null;
        const name = asset.name, pack = byPack.get(store.pack);
        const entry = pack && (pack.paths.get(assetPath(asset)) || pack.names.get(name));
        const custom = store.customEnabled && store.customIcons?.[name];
        if (!entry && !custom && !iconNames.has(name) && !store.colors?.[name]) return null;
        let uri = custom || entry?.uri;
        if (uri && failed.has(uri)) uri = undefined;
        let color = store.colors?.[name] || store.defaultColor || '';
        try { color = colorValue(color); } catch { color = ''; }
        if (!uri && !color) return null;
        return { name, uri, color: color || null, width: asset.width, height: asset.height, original: originalSource(source) };
    }
    return { identify, resolve, failed, retry() { failed.clear(); } };
}

// Work on the native render result, after theme plugins have set their source/tint.
// Never mutate an existing element, a registered asset, or a theme's stored data.
export function replaceTree(React, tree, override, onError) {
    if (Array.isArray(tree)) return tree.map(child => replaceTree(React, child, override, onError));
    if (!React.isValidElement(tree)) return tree;
    const props = tree.props || {};
    if (props.source != null || props.src != null) {
        const next = { style: [props.style, { tintColor: override.color }], tintColor: override.color };
        if (override.uri) {
            const source = { uri: override.uri, width: override.width, height: override.height };
            if (props.source != null) next.source = Array.isArray(props.source) ? [source] : source;
            if (props.src != null) next.src = Array.isArray(props.src) ? [source] : source;
            next.onError = event => { onError(override.uri); props.onError?.(event); };
        }
        return React.cloneElement(tree, next);
    }
    if (props.children) return React.cloneElement(tree, undefined, React.Children.map(props.children, child => replaceTree(React, child, override, onError)));
    return tree;
}
