import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { packs, normalizePath, colorValue, imageUrl, validateDimensions, originalSource, createEngine, replaceTree } from './src/core.js';
import factory from './src/plugin.js';
import { createRuntime } from '../src/runtime.js';
const asset = { name: 'SettingsIcon', type: 'png', httpServerLocation: '/assets/design/components/Icon/native/redesign/generated/images', width: 24, height: 24 };

function harness(forward = true) {
    const store = structuredClone(factory.defaults), sheets = new Map();
    const patcher = {};
    for (const kind of ['after','instead']) patcher[kind] = (key, parent, callback) => {
        const old = parent[key];
        function wrap(...args) { if (kind === 'after') { const result = old.apply(this, args); return callback(args, result) ?? result; } return callback(args, (...next) => old.apply(this, next)); }
        parent[key] = wrap;
        return () => { if (parent[key] === wrap) parent[key] = old; };
    };
    const rawImage = props => React.createElement('NativeImage', { ...props, source: typeof props.source === 'number' ? [{ uri: 'asset:/settings' }] : props.source });
    const Image = forward ? React.forwardRef((props, ref) => rawImage({ ...props, ref })) : rawImage;
    Image.getSize = (_uri, yes) => yes(96, 96);
    const RN = { Image, View: 'View', Text: 'Text', ScrollView: 'ScrollView', TextInput: 'Input', Pressable: 'Button', Switch: 'Switch', Linking: { openURL() {} } };
    const registry = { getAssetByID: id => id === 1 ? asset : undefined };
    const B = { React, ReactNative: RN, metro: { findByProps: (...props) => props.every(p => p in registry) ? registry : undefined, common: { components: { ActionSheet: 'Sheet' } } }, patcher, plugin: { createStorage: () => store, flushStorage: async () => {} }, ui: { showToast() {}, sheets: { showSheet: (id, component) => sheets.set(id, component), hideSheet: id => sheets.delete(id) } } };
    const r = createRuntime(B, { id: 'mime.iconthemer', name: 'icon themer' }, factory.defaults);
    const plugin = factory(r);
    return { r, B, RN, store, sheets, plugin, rawImage, patcher };
}

test('catalog has five merged families, unique canonical asset paths and pinned URLs', () => {
    assert.equal(packs.length, 5);
    assert.equal(new Set(packs.map(p => p.id)).size, 5);
    for (const pack of packs) {
        const paths = pack.groups.flatMap(group => { assert.match(group.base, /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/discord-iconpacks\/[a-f0-9]{40}\//); return group.files.map(normalizePath); });
        assert.equal(paths.length, new Set(paths).size);
        assert.equal(paths.length, pack.count);
    }
});
test('validates colors, direct links, sizes and cyclic theme references', () => {
    for (const color of ['', '#abc', '#aabbcc', '#abcd', '#001122ff']) assert.equal(colorValue(color), color);
    for (const color of ['red', '#12', 'url(x)']) assert.throws(() => colorValue(color));
    assert.equal(imageUrl('https://example.com/a.png'), 'https://example.com/a.png');
    for (const url of ['http://example.com/a.png', 'https://u:p@example.com/a.png', 'https://github.com/a/b/blob/main/a.png', 'https://example.com/a.svg', 'javascript:alert(1)']) assert.throws(() => imageUrl(url));
    validateDimensions(96, 96);
    for (const dims of [[0,32], [4096,4096], [100,16]]) assert.throws(() => validateDimensions(...dims));
    const cycle = {}; cycle.original = cycle; assert.equal(originalSource(cycle), cycle);
    assert.equal(originalSource({ original: { original: 1 } }), 1);
});
test('custom, pack and per-icon color priorities; failed downloads fall back; remote photos untouched', () => {
    const store = { pack: 'solar', colors: { SettingsIcon: '#ff0000' }, defaultColor: '#00ff00', customEnabled: false, customIcons: { SettingsIcon: 'https://example.com/a.png' } };
    const engine = createEngine(store, () => asset);
    const first = engine.resolve({ uri: 'https://theme.example/icon.png', original: 1 });
    assert.match(first.uri, /mudrhiod/); assert.equal(first.color, '#ff0000');
    store.customEnabled = true; assert.equal(engine.resolve(1).uri, 'https://example.com/a.png');
    engine.failed.add('https://example.com/a.png'); assert.equal(engine.resolve(1).uri, undefined);
    engine.retry(); assert.equal(engine.resolve(1).uri, 'https://example.com/a.png');
    assert.equal(engine.resolve({ uri: 'https://cdn.discordapp.com/avatars/person.png' }), null);
    store.pack = ''; store.customEnabled = false; store.defaultColor = ''; store.colors = {};
    assert.equal(engine.resolve(1), null);
});
test('native image output overrides source and both tint channels without mutating original tree', () => {
    const props = { source: [{ uri: 'theme.png' }], src: [{ uri: 'theme.png' }], tintColor: '#000', style: [{ tintColor: '#000' }], onError() {} };
    const tree = React.createElement('View', null, React.createElement('NativeImage', props));
    let failed;
    const next = replaceTree(React, tree, { uri: 'pack.png', color: '#fff', width: 24, height: 24 }, uri => { failed = uri; });
    const child = React.Children.toArray(next.props.children)[0];
    assert.equal(child.props.source[0].uri, 'pack.png'); assert.equal(child.props.src[0].uri, 'pack.png'); assert.equal(child.props.tintColor, '#fff');
    assert.equal(child.props.style.at(-1).tintColor, '#fff');
    assert.equal(props.source[0].uri, 'theme.png');
    child.props.onError({}); assert.equal(failed, 'pack.png');
});
for (const forward of [true, false]) for (const themeFirst of [true, false]) test(`theme override order: forwardRef=${forward}, theme first=${themeFirst}`, async () => {
    const env = harness(forward), { RN, plugin, patcher, r, store } = env;
    store.pack = 'solar'; store.colors.SettingsIcon = '#123456';
    const parent = forward ? RN.Image : RN, key = forward ? 'render' : 'Image';
    const addTheme = () => patcher.instead(key, parent, (args, orig) => orig({ ...args[0], source: { uri: 'theme.png', original: args[0].source }, tintColor: '#ff0000', style: [{ tintColor: '#ff0000' }] }, ...args.slice(1)));
    let untheme;
    if (themeFirst) untheme = addTheme();
    plugin.start();
    if (!themeFirst) untheme = addTheme();
    let renderer;
    Renderer.act(() => { renderer = Renderer.create(React.createElement(RN.Image, { source: 1 })); });
    let native = renderer.root.findByType('NativeImage');
    const uri = Array.isArray(native.props.source) ? native.props.source[0].uri : native.props.source.uri;
    assert.match(uri, /raw.github/); assert.equal(native.props.tintColor, '#123456');
    Renderer.act(() => { r.set('colors', { SettingsIcon: '#abcdef' }); });
    assert.equal(renderer.root.findByType('NativeImage').props.tintColor, '#abcdef');
    Renderer.act(() => { plugin.stop(); });
    assert.equal(renderer.root.findByType('NativeImage').props.tintColor, '#ff0000');
    Renderer.act(() => renderer.unmount()); untheme(); await r.dispose();
});
test('custom settings stay hidden until the red confirmation; disabling preserves links', async () => {
    const { plugin, sheets, store, r } = harness(); plugin.start();
    let renderer; Renderer.act(() => { renderer = Renderer.create(React.createElement(plugin.Settings)); });
    const labels = () => renderer.root.findAllByType('Button').map(x => x.props.accessibilityLabel);
    assert(!labels().includes('Validate and save icon'));
    Renderer.act(() => renderer.root.findByType('Switch').props.onValueChange(true));
    assert.equal(store.customEnabled, false); assert.equal(sheets.size, 1);
    let warning; Renderer.act(() => { warning = Renderer.create(React.createElement([...sheets.values()][0])); });
    const confirm = warning.root.findAllByType('Button').find(x => x.props.accessibilityLabel === "i know what i'm doing");
    assert.equal(confirm.props.style[1].backgroundColor, '#b42335');
    Renderer.act(() => confirm.props.onPress());
    assert.equal(store.customEnabled, true); assert(labels().includes('Validate and save icon'));
    store.customIcons.SettingsIcon = 'https://example.com/a.png';
    Renderer.act(() => renderer.root.findByType('Switch').props.onValueChange(false));
    assert.equal(store.customEnabled, false); assert.equal(store.customIcons.SettingsIcon, 'https://example.com/a.png');
    assert(!labels().includes('Validate and save icon'));
    Renderer.act(() => { renderer.unmount(); warning.unmount(); plugin.stop(); }); await r.dispose();
});
test('bundle matches Snow spec 3 and author metadata', () => {
    const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url)));
    assert.deepEqual(manifest.display.authors, JSON.parse(readFileSync(new URL('../TokenUtils/manifest.json', import.meta.url))).display.authors);
    assert.equal(manifest.spec, 3); assert.equal(manifest.display.name, 'icon themer');
    let definition;
    const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
    assert(Buffer.byteLength(source) < 1048576);
    vm.runInNewContext(source, { bunny: {}, definePlugin: def => { definition = def; return def; }, console, URL, AbortController, setTimeout, clearTimeout });
    for (const name of ['start','stop','SettingsComponent']) assert.equal(typeof definition[name], 'function');
});
test('a failed native image falls back immediately and can be retried', async () => {
    const { plugin, RN, store, r } = harness(); store.pack = 'solar'; plugin.start();
    let renderer; Renderer.act(() => { renderer = Renderer.create(React.createElement(RN.Image, { source: 1 })); });
    Renderer.act(() => renderer.root.findByType('NativeImage').props.onError({}));
    assert.equal(renderer.root.findByType('NativeImage').props.source[0].uri, 'asset:/settings');
    assert.equal(plugin.engine.failed.size, 1);
    Renderer.act(() => { plugin.engine.retry(); r.changed(); });
    assert.match(renderer.root.findByType('NativeImage').props.source[0].uri, /raw.github/);
    Renderer.act(() => renderer.unmount()); plugin.stop(); await r.dispose();
});
test('custom save validates dimensions and cannot save after the custom toggle is disabled', async () => {
    const { plugin, RN, store, r } = harness(); store.customEnabled = true; plugin.start();
    let complete;
    RN.Image.getSize = (_url, yes) => { complete = yes; };
    let renderer; Renderer.act(() => { renderer = Renderer.create(React.createElement(plugin.Settings)); });
    const input = label => renderer.root.findAllByType('Input').find(x => x.props.accessibilityLabel === label);
    Renderer.act(() => { input('Custom icon asset name').props.onChangeText('SettingsIcon'); input('Custom icon direct image URL').props.onChangeText('https://example.com/a.png'); });
    let saving;
    Renderer.act(() => { saving = renderer.root.findAllByType('Button').find(x => x.props.accessibilityLabel === 'Validate and save icon').props.onPress(); });
    Renderer.act(() => renderer.root.findByType('Switch').props.onValueChange(false));
    await Renderer.act(async () => { complete(96,96); await saving; });
    assert.deepEqual(store.customIcons, {});
    Renderer.act(() => renderer.unmount()); plugin.stop(); await r.dispose();
});
test('default color excludes unrelated numeric assets', () => {
    const engine = createEngine({ defaultColor: '#fff' }, () => ({ ...asset, name: 'UnrelatedPhotoIllustration' }));
    assert.equal(engine.resolve(1), null);
});
