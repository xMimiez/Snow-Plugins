import { ui } from '../../src/runtime.js';
import { packs, iconNames, createEngine, replaceTree, colorValue, imageUrl, validateDimensions, previewUrl } from './core.js';

export default function factory(r) {
    const { React, RN, h, store } = r;
    const U = ui(r);
    let enabled = true;
    const registry = r.find('getAssetByID') || r.B.ui?.assets || r.B.api?.assets;
    const engine = createEngine(store, id => registry?.getAssetByID?.(id));
    let rendererCount = 0;
    const styles = {
        card: { padding: 14, gap: 10, borderRadius: 14, backgroundColor: '#20232e', marginBottom: 10 },
        text: { color: '#f4f4fa', fontSize: 15 },
        muted: { color: '#b5b8ca', fontSize: 13 },
        input: { color: '#f4f4fa', backgroundColor: '#12151e', padding: 12, borderRadius: 10, minHeight: 44 },
        button: { padding: 12, minHeight: 44, borderRadius: 10, backgroundColor: '#514bd1', alignItems: 'center' },
    };
    const Text = ({ children, muted, ...props }) => h(RN.Text, { style: muted ? styles.muted : styles.text, ...props }, children);
    const Button = ({ text, onPress, red, disabled }) => h(RN.Pressable, { accessibilityRole: 'button', accessibilityLabel: text, accessibilityState: { disabled: !!disabled }, disabled, onPress, style: [styles.button, red && { backgroundColor: '#b42335' }, disabled && { opacity: 0.5 }] }, h(Text, null, text));
    const Input = ({ value, onChange, placeholder, label }) => h(RN.TextInput, { value, onChangeText: onChange, placeholder, accessibilityLabel: label || placeholder, placeholderTextColor: '#858ba2', autoCapitalize: 'none', autoCorrect: false, style: styles.input });

    function Boundary({ tree, source }) {
        r.useRefresh();
        if (!enabled || !r.active) return tree;
        const override = engine.resolve(source);
        return override ? replaceTree(React, tree, override, uri => {
            if (!engine.failed.has(uri)) {
                engine.failed.add(uri);
                r.status.failed = engine.failed.size;
                r.changed();
            }
        }) : tree;
    }
    function patchRender(parent, key, sourceOf) {
        if (r.patch('after', parent, key, (args, result) => {
            if (!enabled || !r.active || !result) return;
            const source = sourceOf(args);
            // Keep the subscription for recognized assets even with no selected pack,
            // so settings changes also update icons that were already on screen.
            const asset = engine.identify(source);
            if (!asset?.name) return;
            return h(Boundary, { tree: result, source });
        })) rendererCount++;
    }
    function Warning({ close }) {
        return h(U.Page, { title: 'Custom icon setup', close },
            h(Text, null, 'Use direct, publicly accessible HTTPS image links. GitHub links must be Raw links, not file pages. PNG with transparency works best; WebP and JPEG are also supported. SVG is not supported.'),
            h(Text, null, 'Match the original icon proportions. For a 24–32 point icon, a 72–96 pixel image is a good starting size. Images must be 16–1024 pixels per side. Large or incorrectly shaped files can look blurry or distorted. The image host will receive image requests from your device.'),
            h(Text, null, 'Custom icons take priority over the selected pack. Disabling this toggle keeps your saved links but stops applying them.'),
            h(Button, { red: true, text: "i know what i'm doing", onPress: () => { if (enabled && r.active) r.set('customEnabled', true); close(); } }));
    }
    function ColorEditor({ name }) {
        const [draft, setDraft] = React.useState(store.colors?.[name] || '');
        const [error, setError] = React.useState('');
        const uri = (store.customEnabled && store.customIcons?.[name]) || previewUrl(store.pack, name);
        let previewColor = store.colors?.[name] || store.defaultColor || null;
        try { previewColor = colorValue(draft) || previewColor; } catch {}
        return h(RN.View, { style: styles.card },
            h(Text, { accessibilityRole: 'header' }, name),
            uri ? h(RN.Image, { source: { uri }, accessibilityLabel: `${name} preview`, resizeMode: 'contain', style: { width: 32, height: 32, tintColor: previewColor } }) : null,
            h(Input, { value: draft, onChange: setDraft, placeholder: '#RRGGBB or blank for default', label: `Color for ${name}` }),
            error ? h(Text, null, error) : null,
            h(Button, { text: 'Save color', onPress: () => { try { const value = colorValue(draft); const next = { ...store.colors }; if (value) next[name] = value; else delete next[name]; r.set('colors', next); setError(''); r.toast('Icon color saved'); } catch (e) { setError(e.message); } } }),
            h(Button, { text: 'Reset this color', onPress: () => { const next = { ...store.colors }; delete next[name]; r.set('colors', next); setDraft(''); setError(''); } }));
    }
    function CustomEditor() {
        const [name, setName] = React.useState(''), [url, setUrl] = React.useState('');
        const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
        const mounted = React.useRef(true);
        React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
        const [page, setPage] = React.useState(0);
        const entries = Object.entries(store.customIcons || {}).sort(([a], [b]) => a.localeCompare(b));
        const maxPage = Math.max(0, Math.ceil(entries.length / 10) - 1), currentPage = Math.min(page, maxPage);
        async function save() {
            if (busy) return;
            setError(''); setBusy(true);
            try {
                const icon = name.trim();
                if (!/^[\w.-]{1,160}$/.test(icon) || ['__proto__', 'constructor', 'prototype'].includes(icon)) throw new Error('Enter the exact Discord asset name, such as SettingsIcon.');
                const uri = imageUrl(url);
                await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => reject(new Error('Image validation timed out. Check that the link is public and direct.')), 12000);
                    if (!RN.Image?.getSize) { clearTimeout(timer); reject(new Error('Image validation is unavailable in this client.')); return; }
                    RN.Image.getSize(uri, (width, height) => { clearTimeout(timer); try { validateDimensions(width, height); resolve(); } catch (e) { reject(e); } }, () => { clearTimeout(timer); reject(new Error('Could not load this image. Check the direct link.')); });
                });
                if (!mounted.current || !enabled || !r.active || !store.customEnabled) return;
                r.set('customIcons', { ...store.customIcons, [icon]: uri }); engine.retry();
                setName(''); setUrl(''); r.toast('Custom icon saved');
            } catch (e) { if (mounted.current) setError(e.message); }
            finally { if (mounted.current) setBusy(false); }
        }
        return h(RN.View, { style: styles.card },
            h(Text, { accessibilityRole: 'header' }, 'Custom icons'),
            h(Text, { muted: true }, 'Use an exact asset name from the icon browser below. Custom names for newer Discord assets are also accepted.'),
            h(Input, { value: name, onChange: setName, placeholder: 'SettingsIcon', label: 'Custom icon asset name' }),
            h(Input, { value: url, onChange: setUrl, placeholder: 'https://…/icon.png', label: 'Custom icon direct image URL' }),
            error ? h(Text, null, error) : null,
            h(Button, { text: busy ? 'Checking image…' : 'Validate and save icon', disabled: busy, onPress: save }),
            ...entries.slice(currentPage * 10, currentPage * 10 + 10).map(([key, uri]) => h(RN.View, { key, style: { gap: 8 } },
                h(Text, null, key), h(Text, { muted: true, numberOfLines: 2 }, uri),
                h(Button, { text: `Edit ${key}`, onPress: () => { setName(key); setUrl(uri); } }),
                h(Button, { text: `Remove ${key}`, onPress: () => { const next = { ...store.customIcons }; delete next[key]; r.set('customIcons', next); } }))),
            entries.length > 10 ? h(RN.View, null,
                h(Button, { text: 'Previous custom icons', disabled: currentPage === 0, onPress: () => setPage(currentPage - 1) }),
                h(Text, null, `${currentPage + 1} / ${maxPage + 1}`),
                h(Button, { text: 'Next custom icons', disabled: currentPage === maxPage, onPress: () => setPage(currentPage + 1) })) : null);
    }
    function Settings() {
        r.useRefresh();
        const [search, setSearch] = React.useState(''), [page, setPage] = React.useState(0);
        const [draft, setDraft] = React.useState(store.defaultColor || ''), [error, setError] = React.useState('');
        const names = [...new Set([...iconNames, ...Object.keys(store.colors || {}), ...Object.keys(store.customIcons || {})])].sort().filter(name => name.toLowerCase().includes(search.toLowerCase()));
        const currentPage = Math.min(page, Math.max(0, Math.ceil(names.length / 12) - 1));
        return h(RN.ScrollView, { contentContainerStyle: { padding: 16, gap: 12 }, keyboardShouldPersistTaps: 'handled' },
            h(RN.View, { style: styles.card },
                h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } },
                    h(Text, null, 'custom icons'),
                    h(RN.Switch, { accessibilityLabel: 'custom icons', value: !!store.customEnabled, onValueChange: value => {
                        if (!value) r.set('customEnabled', false);
                        else { try { r.open('custom-warning', Warning); } catch (e) { r.error('Custom icon warning', e); } }
                    } })),
                h(Text, { muted: true }, 'Advanced · replace individual icons with your own images')),
            store.customEnabled ? h(CustomEditor) : null,
            h(Text, { accessibilityRole: 'header', style: [styles.text, { fontSize: 24, fontWeight: '700' }] }, 'icon themer'),
            h(Text, { muted: true }, 'Your icons, your colors. Changes apply as icons render; reopen a screen if it kept an older image. Missing or failed images fall back to the existing icon.'),
            h(Text, { muted: true }, rendererCount ? `${rendererCount} image renderer hook(s) active · ${engine.failed.size} failed image(s)` : 'Image rendering is unavailable in this client. Overrides are not active.'),
            h(Text, { accessibilityRole: 'header' }, 'Preset icon packs'),
            h(Button, { text: `${!store.pack ? '✓ ' : ''}Original / theme icons`, onPress: () => { engine.retry(); r.set('pack', ''); } }),
            ...packs.map(pack => h(RN.View, { key: pack.id, style: styles.card },
                h(Button, { text: `${store.pack === pack.id ? '✓ ' : ''}${pack.name}`, onPress: () => { engine.retry(); r.set('pack', pack.id); } }),
                h(RN.View, { style: { flexDirection: 'row', gap: 18 } }, ...['SettingsIcon', 'SearchIcon', 'BellIcon'].map(name => {
                    const uri = previewUrl(pack.id, name);
                    return uri ? h(RN.Image, { key: name, source: { uri }, accessibilityLabel: `${pack.name} ${name} preview`, resizeMode: 'contain', style: { width: 28, height: 28 } }) : null;
                })),
                h(Text, { muted: true }, `${pack.count} asset replacements · merged duplicate folders`),
                h(Button, { text: `${pack.name} source / credits`, onPress: () => RN.Linking.openURL(pack.groups[0].source) }))),
            h(RN.View, { style: styles.card },
                h(Text, { accessibilityRole: 'header' }, 'Default icon color'),
                h(Text, { muted: true }, 'Blank keeps pack artwork colors. A color here overrides theme tints; individual icon colors take priority. With Original / theme icons selected, blank leaves theme colors alone.'),
                h(Input, { value: draft, onChange: setDraft, placeholder: '#RRGGBB or blank', label: 'Default icon color' }),
                error ? h(Text, null, error) : null,
                h(Button, { text: 'Save default color', onPress: () => { try { r.set('defaultColor', colorValue(draft)); setError(''); } catch (e) { setError(e.message); } } }),
                h(Button, { text: 'Retry failed images', onPress: () => { engine.retry(); r.changed(); } })),
            h(Text, { accessibilityRole: 'header' }, 'Individual icon colors'),
            h(Input, { value: search, onChange: value => { setSearch(value); setPage(0); }, placeholder: 'Search icons, e.g. Settings or Search', label: 'Search individual icons' }),
            h(Text, { muted: true }, `${names.length} icons · page ${currentPage + 1} of ${Math.max(1, Math.ceil(names.length / 12))}`),
            ...names.slice(currentPage * 12, currentPage * 12 + 12).map(name => h(ColorEditor, { key: name, name })),
            names.length === 0 && /^[\w.-]{1,160}$/.test(search.trim()) && !['__proto__', 'constructor', 'prototype'].includes(search.trim()) ? h(ColorEditor, { key: search.trim(), name: search.trim() }) : null,
            h(Button, { text: 'Previous icons', disabled: currentPage === 0, onPress: () => setPage(currentPage - 1) }),
            h(Button, { text: 'Next icons', disabled: (currentPage + 1) * 12 >= names.length, onPress: () => setPage(currentPage + 1) }),
            h(Text, { muted: true }, 'Pack artwork: mudrhiod, Rairof, Rosiecord and upstream artists. Source and license details are in IconThemer/THIRD_PARTY_NOTICES.md.'));
    }
    return {
        Settings, engine,
        start() {
            if (!registry?.getAssetByID) throw new Error('This Snow build does not expose the image asset registry.');
            const Image = RN.Image;
            if (Image?.render) patchRender(Image, 'render', args => args[0]?.source);
            else if (typeof Image === 'function' && !Image.prototype?.isReactComponent) patchRender(RN, 'Image', args => args[0]?.source);
            if (!rendererCount) throw new Error('Unsupported Image implementation. No overrides were installed.');
        },
        stop() { enabled = false; r.changed(); },
    };
}
factory.defaults = { pack: '', defaultColor: '', colors: {}, customEnabled: false, customIcons: {} };
