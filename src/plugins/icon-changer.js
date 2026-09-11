import { ui } from '../runtime.js';
import CATALOG from './icon-catalog.json';

const THEME_URL = 'https://raw.githubusercontent.com/xMimiez/Snow-Themes/refs/heads/main/DarkPlus/DarkPlus-mobile.json';
const EXTRA_KEYS = [
    'ic_radio_circle_checked', 'ic_radio_circle_checked__overlay',
    'ic_radio_square_checked_24px', 'ic_radio_square_checked_24px__overlay',
    'ic_selection_checked_24px', 'ic_selection_checked_24px__overlay',
    'ic_star_filled', 'img_guild_folder', 'ic_send', 'ic_send__overlay', 'search',
    'StatusOnline', 'StatusIdle', 'StatusDND', 'StatusOffline', 'StatusMobileOnline',
];
const ALIASES = {
    search: 'MagnifyingGlassIcon',
    ic_send: 'SendMessageIcon',
    ic_star_filled: 'StarIcon',
    img_guild_folder: 'FolderIcon',
    ic_radio_circle_checked: 'CircleCheckIcon',
    ic_selection_checked_24px: 'CheckmarkLargeIcon',
};
const PRESET_COLORS = ['#BB86FC', '#CDAEF3', '#5865F2', '#212121', '#EDEDED', '#81C995', '#E2C06A', '#CF6679', '#6A6A6A'];

function isHex(value) {
    return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(String(value || '').trim());
}
function isCatalogIcon(name) {
    return typeof name === 'string' && /Icon$/.test(name) && !name.includes('__');
}

export default function IconChanger(r) {
    const { h, React, RN, C, D } = r, { Page, Text, Button, Input, Toggle } = ui(r);
    let names = [...new Set(CATALOG.concat(EXTRA_KEYS))];
    function map() { return r.store.icons && typeof r.store.icons === 'object' ? r.store.icons : {}; }
    function customFor(name) {
        const stored = map();
        if (stored[name]) return stored[name];
        const alias = ALIASES[name];
        if (alias && stored[alias]) return stored[alias];
        if (isCatalogIcon(name) && isHex(r.store.globalColor)) return { color: r.store.globalColor };
        return null;
    }
    function setCustom(name, next) {
        const stored = { ...map() };
        if (!next || (!next.color && !next.image && !next.svg)) delete stored[name];
        else stored[name] = next;
        r.set('icons', stored);
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
            return h(D.SvgXml, { xml: custom.svg, width: 24, height: 24, color: custom.color || '#FFFFFF' });
        }
        if (custom.color) {
            return React.cloneElement(element, {
                color: custom.color,
                style: [element.props.style, { tintColor: custom.color, color: custom.color }],
            });
        }
    }
    function Preview({ name, size = 24 }) {
        const custom = customFor(name);
        if (custom?.image) return h(RN.Image, { source: { uri: custom.image }, style: { width: size, height: size, resizeMode: 'contain' } });
        if (custom?.svg && D.SvgXml) return h(D.SvgXml, { xml: custom.svg, width: size, height: size, color: custom.color || '#FFFFFF' });
        if (isCatalogIcon(name) && C.Icon) return h(C.Icon, { name, size, color: custom?.color, accessible: false });
        return h(RN.View, { style: { width: size, height: size, borderRadius: 4, backgroundColor: (custom?.color || '#5865F2') + '33' } });
    }
    function Editor({ name, close }) {
        r.useRefresh();
        const current = customFor(name) || {};
        const [color, setColor] = React.useState(current.color || '');
        const [image, setImage] = React.useState(current.image || '');
        const [svg, setSvg] = React.useState(current.svg || '');
        return h(Page, { title: name, close },
            h(Text, { muted: true }, 'This override is applied on Icon, RowIcon, IconButton, and the named vector. It overwrites theme plus.icons.'),
            h(Preview, { name, size: 32 }),
            h(Text, null, 'Color'),
            h(Input, { value: color, onChange: setColor, placeholder: '#BB86FC', autoCapitalize: 'none' }),
            h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap' } },
                PRESET_COLORS.map(hex => h(RN.Pressable, {
                    key: hex, onPress: () => setColor(hex),
                    style: { width: 28, height: 28, borderRadius: 14, backgroundColor: hex, margin: 4, borderWidth: 1, borderColor: '#ffffff55' },
                }))),
            h(Text, null, 'Image URL (optional)'),
            h(Input, { value: image, onChange: setImage, placeholder: 'https://example.com/icon.png', autoCapitalize: 'none' }),
            h(Text, null, 'SVG xml (optional)'),
            h(Input, { value: svg, onChange: setSvg, placeholder: '<svg viewBox="0 0 24 24"></svg>', autoCapitalize: 'none' }),
            h(Button, { text: 'Save override', onPress: () => {
                const next = {};
                if (isHex(color)) next.color = color.trim();
                if (/^https:\/\//i.test(image.trim())) next.image = image.trim();
                if (svg.trim().includes('<svg')) next.svg = svg.trim();
                setCustom(name, next);
                r.toast('Saved ' + name);
                close();
            } }),
            h(Button, { text: 'Reset this icon', variant: 'secondary', onPress: () => { setCustom(name, null); r.toast('Reset ' + name); close(); } }));
    }
    function Settings() {
        r.useRefresh();
        const [query, setQuery] = React.useState('');
        const q = query.trim().toLowerCase();
        const filtered = names.filter(name => !q || name.toLowerCase().includes(q));
        const rows = filtered.slice(0, 80).map(name => h(D.TableRow, {
            key: name,
            label: name,
            subLabel: customFor(name) ? 'Overridden' : (isCatalogIcon(name) ? 'Discord default' : 'Theme asset key'),
            icon: C.RowIcon && isCatalogIcon(name) ? h(C.RowIcon, { name }) : undefined,
            onPress: () => { try { r.open('edit-' + name, Editor, { name }); } catch (e) { r.error('Icon editor', e); } },
        }));
        return h(Page, { title: 'Icon Changer' },
            h(Toggle, { setting: 'enabled', label: 'Enable icon overrides', subLabel: 'Plugin overrides overwrite theme plus.icons on Icon, RowIcon, IconButton, and named vectors' }),
            h(Text, null, 'Tint every catalog icon (unless a per-icon override exists)'),
            h(Input, { value: r.store.globalColor || '', onChange: text => r.set('globalColor', text), placeholder: '#BB86FC', autoCapitalize: 'none' }),
            h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap' } },
                PRESET_COLORS.map(hex => h(RN.Pressable, {
                    key: hex, onPress: () => r.set('globalColor', hex),
                    style: { width: 28, height: 28, borderRadius: 14, backgroundColor: hex, margin: 4, borderWidth: 1, borderColor: '#ffffff55' },
                }))),
            h(Button, { text: 'Clear global tint', variant: 'secondary', onPress: () => r.set('globalColor', '') }),
            h(Input, { value: query, onChange: setQuery, placeholder: 'Search icons', autoCapitalize: 'none' }),
            h(Text, { muted: true }, `${filtered.length} icons (Snow catalog + Dark+ keys). Showing ${Math.min(80, filtered.length)}. Search to find others.`),
            D.TableRowGroup ? h(D.TableRowGroup, { title: 'Icons' }, rows) : h(RN.View, null, rows));
    }
    return {
        async start() {
            try {
                const theme = (await r.request(THEME_URL, {}, 15000, 200000)).json();
                const fromTheme = theme?.plus?.icons && typeof theme.plus.icons === 'object' ? Object.keys(theme.plus.icons) : [];
                names = [...new Set(CATALOG.concat(EXTRA_KEYS, fromTheme))];
            } catch {
                names = [...new Set(CATALOG.concat(EXTRA_KEYS))];
            }
            r.hook(['Icon', 'RowIcon'], element => {
                if (!r.store.enabled) return;
                const name = element.props?.name;
                if (!name) return;
                return applyToElement(element, name);
            });
            r.hook(['IconButton'], element => {
                if (!r.store.enabled) return;
                const name = typeof element.props?.icon === 'string' ? element.props.icon : null;
                if (!name) return;
                const custom = customFor(name);
                if (!custom) return;
                if (custom.image) return React.cloneElement(element, { icon: { uri: custom.image } });
                if (custom.color) return React.cloneElement(element, { style: [element.props.style, { tintColor: custom.color }] });
            });
            r.hook(names.filter(isCatalogIcon), (element, name) => {
                if (!r.store.enabled) return;
                return applyToElement(element, name);
            });
        },
        Settings,
    };
}
IconChanger.defaults = { enabled: true, icons: {}, globalColor: '' };
