import { ui } from '../runtime.js';

const THEME_URL = 'https://raw.githubusercontent.com/xMimiez/Snow-Themes/refs/heads/main/DarkPlus/DarkPlus-mobile.json';

const FALLBACK_ICONS = [
    'ic_radio_circle_checked', 'ic_radio_circle_checked__overlay',
    'ic_radio_square_checked_24px', 'ic_radio_square_checked_24px__overlay',
    'ic_selection_checked_24px', 'ic_selection_checked_24px__overlay',
    'ic_star_filled', 'img_guild_folder',
    'StatusOnline', 'StatusIdle', 'StatusDND', 'StatusOffline', 'StatusMobileOnline',
    'ic_send', 'ic_send__overlay',
    'ShopIcon', 'PencilIcon', 'SettingsIcon', 'MagnifyingGlassIcon', 'search',
    'MoreHorizontalIcon', 'NitroWheelIcon',
];

const PRESET_COLORS = ['#BB86FC', '#CDAEF3', '#5865F2', '#212121', '#EDEDED', '#81C995', '#E2C06A', '#CF6679', '#6A6A6A'];

function isHex(value) {
    return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(String(value || '').trim());
}

function isCatalogIcon(name) {
    return typeof name === 'string' && /Icon$/.test(name) && !name.includes('__');
}

export default function IconChanger(r) {
    const { h, React, RN, C, D } = r, { Page, Text, Button, Input, Toggle } = ui(r);
    let names = FALLBACK_ICONS.slice();
    function customFor(name) {
        const map = r.store.icons && typeof r.store.icons === 'object' ? r.store.icons : {};
        return map[name] || null;
    }
    function setCustom(name, next) {
        const map = { ...(r.store.icons || {}) };
        if (!next || (!next.color && !next.image && !next.svg)) delete map[name];
        else map[name] = next;
        r.set('icons', map);
    }
    function applyToElement(element, name) {
        const custom = customFor(name);
        if (!custom || !element?.props) return;
        if (custom.image) {
            return h(RN.Image, {
                source: { uri: custom.image },
                style: [{ width: 24, height: 24, resizeMode: 'contain' }, element.props.style],
                accessibilityLabel: name,
            });
        }
        if (custom.svg && D.SvgXml) {
            return h(D.SvgXml, {
                xml: custom.svg,
                width: 24,
                height: 24,
                color: custom.color || '#FFFFFF',
            });
        }
        if (custom.color && isCatalogIcon(name)) {
            return React.cloneElement(element, { color: custom.color });
        }
        if (custom.color) {
            return React.cloneElement(element, { style: [element.props.style, { tintColor: custom.color }] });
        }
    }
    function Preview({ name, size = 24 }) {
        const custom = customFor(name);
        const box = { width: size, height: size, borderRadius: 4, backgroundColor: (custom?.color || '#5865F2') + '33' };
        if (custom?.image) return h(RN.Image, { source: { uri: custom.image }, style: { width: size, height: size, resizeMode: 'contain' } });
        if (custom?.svg && D.SvgXml) return h(D.SvgXml, { xml: custom.svg, width: size, height: size, color: custom.color || '#FFFFFF' });
        if (isCatalogIcon(name) && C.Icon) return h(C.Icon, { name, size, color: custom?.color, accessible: false });
        return h(RN.View, { style: box });
    }
    function Editor({ name, close }) {
        r.useRefresh();
        const current = customFor(name) || {};
        const [color, setColor] = React.useState(current.color || '');
        const [image, setImage] = React.useState(current.image || '');
        const [svg, setSvg] = React.useState(current.svg || '');
        return h(Page, { title: name, close },
            h(Text, { muted: true }, 'Plugin overrides overwrite a theme plus.icons color for this name. Snow themes recolor Discord vectors; ic_* names are Android assets and cannot use C.Icon.'),
            h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 } },
                h(RN.View, { style: { alignItems: 'center', marginRight: 16 } }, h(Preview, { name, size: 32 }), h(Text, { muted: true }, 'Current'))),
            h(Text, null, 'Color'),
            h(Input, { value: color, onChange: setColor, placeholder: '#BB86FC', autoCapitalize: 'none' }),
            h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap' } },
                PRESET_COLORS.map(hex => h(RN.Pressable, {
                    key: hex,
                    onPress: () => setColor(hex),
                    style: { width: 28, height: 28, borderRadius: 14, backgroundColor: hex, margin: 4, borderWidth: 1, borderColor: '#ffffff55' },
                }))),
            h(Text, null, 'Image URL (optional)'),
            h(Input, { value: image, onChange: setImage, placeholder: 'https://example.com/icon.png', autoCapitalize: 'none' }),
            h(Text, null, 'SVG xml (optional)'),
            h(Input, { value: svg, onChange: setSvg, placeholder: '<svg viewBox="0 0 24 24">…</svg>', autoCapitalize: 'none' }),
            h(Button, { text: 'Save override', onPress: () => {
                const next = {};
                if (isHex(color)) next.color = color.trim();
                if (/^https:\/\//i.test(image.trim())) next.image = image.trim();
                if (svg.trim().includes('<svg')) next.svg = svg.trim();
                setCustom(name, next);
                r.toast('Saved ' + name);
                close();
            } }),
            h(Button, { text: 'Reset to Discord / theme', variant: 'secondary', onPress: () => { setCustom(name, null); r.toast('Reset ' + name); close(); } }));
    }
    function Settings() {
        r.useRefresh();
        const [query, setQuery] = React.useState('');
        const q = query.trim().toLowerCase();
        const filtered = names.filter(name => !q || name.toLowerCase().includes(q));
        const rows = filtered.map(name => h(D.TableRow, {
            key: name,
            label: name,
            subLabel: customFor(name) ? 'Overridden (wins over theme)' : (isCatalogIcon(name) ? 'Discord default' : 'Theme asset key'),
            icon: C.RowIcon && isCatalogIcon(name) ? h(C.RowIcon, { name }) : undefined,
            onPress: () => { try { r.open('edit-' + name, Editor, { name }); } catch (e) { r.error('Icon editor', e); } },
        }));
        return h(Page, { title: 'Icon Changer' },
            h(Toggle, { setting: 'enabled', label: 'Enable icon overrides', subLabel: 'Plugin icons overwrite matching theme plus.icons colors' }),
            h(Input, { value: query, onChange: setQuery, placeholder: 'Search icons', autoCapitalize: 'none' }),
            h(Text, { muted: true }, `${filtered.length} icons from Dark+ plus.icons. Catalog names (*Icon) preview as Discord vectors.`),
            D.TableRowGroup ? h(D.TableRowGroup, { title: 'Icons' }, rows) : h(RN.View, null, rows));
    }
    return {
        async start() {
            try {
                const theme = (await r.request(THEME_URL, {}, 15000, 200000)).json();
                const fromTheme = theme?.plus?.icons && typeof theme.plus.icons === 'object' ? Object.keys(theme.plus.icons) : [];
                if (fromTheme.length) names = [...new Set(fromTheme.concat(FALLBACK_ICONS))];
            } catch {}
            r.hook(['Icon', 'RowIcon'], element => {
                if (!r.store.enabled) return;
                const name = element.props?.name;
                if (!name || !customFor(name)) return;
                return applyToElement(element, name);
            });
            const catalog = names.filter(isCatalogIcon);
            if (catalog.length) {
                r.hook(catalog, (element, name) => {
                    if (!r.store.enabled) return;
                    return applyToElement(element, name);
                });
            }
        },
        Settings,
    };
}
IconChanger.defaults = { enabled: true, icons: {} };
