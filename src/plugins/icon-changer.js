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
};
const GROUPS = [
    { id: 'search', label: 'Search', names: ['MagnifyingGlassIcon', 'ChannelListMagnifyingGlassIcon', 'search', 'ic_search', 'ic_search_24px', 'ic_search_line_24px'] },
    { id: 'unread', label: 'Unread messages', names: ['ChatMarkUnreadIcon', 'InboxIcon', 'ChatDotsIcon', 'ChatIcon', 'Mentions', 'ic_chat_badge', 'ic_mentions'] },
    { id: 'friends', label: 'Add friends', names: ['UserPlusIcon', 'FriendsIcon', 'GroupPlusIcon', 'NewUserIcon', 'NewUserSimpleIcon', 'ic_person_add', 'ic_add_friend', 'ic_user_add'] },
    { id: 'plus', label: '+ / Add', names: ['PlusSmallIcon', 'PlusMediumIcon', 'PlusLargeIcon', 'CirclePlusIcon', 'ChatPlusIcon', 'FolderPlusIcon', 'PaperPlusIcon', 'ImagePlusIcon', 'ic_add_24px', 'ic_plus_24px'] },
    { id: 'settings', label: 'Settings icons', names: ['SettingsIcon', 'WrenchIcon', 'MobilePhoneSettingsIcon', 'UserIcon', 'UserCircleIcon', 'ShieldIcon', 'BellIcon', 'GiftIcon', 'NitroWheelIcon', 'LanguageIcon', 'LockIcon', 'CircleInformationIcon', 'PaintPaletteIcon', 'ThemeDarkIcon', 'ThemeLightIcon', 'InventoryIcon', 'IdCardIcon', 'AppsIcon'] },
];
const PRESET_COLORS = ['#BB86FC', '#CDAEF3', '#5865F2', '#212121', '#EDEDED', '#81C995', '#E2C06A', '#CF6679', '#6A6A6A'];

function isHex(value) {
    return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(String(value || '').trim());
}
function isCatalogIcon(name) {
    return typeof name === 'string' && /Icon$/.test(name) && !name.includes('__');
}
function sourceId(source) {
    if (typeof source === 'number' && Number.isFinite(source)) return source;
    if (Array.isArray(source) && typeof source[0] === 'number') return source[0];
    if (source && typeof source === 'object') {
        if (typeof source.uri === 'string') return null;
        if (typeof source.default === 'number') return source.default;
    }
    return null;
}

export default function IconChanger(r) {
    const { h, React, RN, C, D, B } = r, { Page, Text, Button, Input, Toggle } = ui(r);
    const nameSet = new Set(CATALOG.concat(EXTRA_KEYS));
    let names = [...nameSet];
    const idToName = new Map();
    function stored() { return r.store.icons && typeof r.store.icons === 'object' ? r.store.icons : {}; }
    function customFor(name) {
        if (!name) return null;
        const map = stored();
        if (map[name]) return map[name];
        if (ALIASES[name] && map[ALIASES[name]]) return map[ALIASES[name]];
        if ((isCatalogIcon(name) || nameSet.has(name) || /^ic_/.test(name)) && isHex(r.store.globalColor)) return { color: r.store.globalColor };
        return null;
    }
    function setCustom(name, next) {
        const map = { ...stored() };
        if (!next || (!next.color && !next.image && !next.svg)) delete map[name];
        else map[name] = next;
        r.set('icons', map);
    }
    function assetNameFromSource(source) {
        const id = sourceId(source);
        if (id == null) return null;
        if (idToName.has(id)) return idToName.get(id);
        const asset = B.assets?.findAsset?.(id) || B.assets?.getAssetByID?.(id);
        const name = asset?.name || null;
        if (name) idToName.set(id, name);
        return name;
    }
    function applyImage(element) {
        if (!r.store.enabled || !element?.props) return;
        const name = assetNameFromSource(element.props.source);
        const custom = customFor(name);
        if (!custom) return;
        if (custom.image) {
            return React.cloneElement(element, { source: { uri: custom.image } });
        }
        if (custom.color) {
            return React.cloneElement(element, {
                style: [{ tintColor: custom.color }, element.props.style],
                tintColor: custom.color,
            });
        }
    }
    function applyNamed(element, name) {
        const custom = customFor(name);
        if (!custom || !element?.props) return;
        if (custom.image) {
            return h(RN.Image, {
                source: { uri: custom.image },
                style: [{ width: 24, height: 24, resizeMode: 'contain', tintColor: custom.color }, element.props.style],
                accessibilityLabel: name,
            });
        }
        if (custom.svg && D.SvgXml) return h(D.SvgXml, { xml: custom.svg, width: 24, height: 24, color: custom.color || '#FFFFFF' });
        if (custom.color) return React.cloneElement(element, { color: custom.color, style: [element.props.style, { tintColor: custom.color, color: custom.color }] });
    }
    function Preview({ name, size = 24 }) {
        const custom = customFor(name);
        if (custom?.image) return h(RN.Image, { source: { uri: custom.image }, style: { width: size, height: size, resizeMode: 'contain', tintColor: custom.color } });
        if (isCatalogIcon(name) && C.Icon) return h(C.Icon, { name, size, color: custom?.color, accessible: false });
        return h(RN.View, { style: { width: size, height: size, borderRadius: 4, backgroundColor: (custom?.color || '#5865F2') + '33' } });
    }
    function Editor({ name, close }) {
        r.useRefresh();
        const current = customFor(name) || {};
        const [color, setColor] = React.useState(current.color || '');
        const [image, setImage] = React.useState(current.image || '');
        return h(Page, { title: name, close },
            h(Text, { muted: true }, 'Applied on Discord Images (asset IDs), Icon, RowIcon, and IconButton. Overwrites theme plus.icons.'),
            h(Preview, { name, size: 32 }),
            h(Text, null, 'Color'),
            h(Input, { value: color, onChange: setColor, placeholder: '#BB86FC', autoCapitalize: 'none' }),
            h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap' } },
                PRESET_COLORS.map(hex => h(RN.Pressable, {
                    key: hex, onPress: () => setColor(hex),
                    style: { width: 28, height: 28, borderRadius: 14, backgroundColor: hex, margin: 4, borderWidth: 1, borderColor: '#ffffff55' },
                }))),
            h(Text, null, 'Replacement image URL (optional)'),
            h(Input, { value: image, onChange: setImage, placeholder: 'https://example.com/icon.png', autoCapitalize: 'none' }),
            h(Button, { text: 'Save override', onPress: () => {
                const next = {};
                if (isHex(color)) next.color = color.trim();
                if (/^https:\/\//i.test(image.trim())) next.image = image.trim();
                setCustom(name, next);
                r.toast('Saved ' + name);
                close();
            } }),
            h(Button, { text: 'Reset this icon', variant: 'secondary', onPress: () => { setCustom(name, null); r.toast('Reset ' + name); close(); } }));
    }
    function GroupEditor({ group, close }) {
        const [color, setColor] = React.useState('');
        return h(Page, { title: group.label, close },
            h(Text, { muted: true }, 'Applies to: ' + group.names.join(', ')),
            h(Input, { value: color, onChange: setColor, placeholder: '#BB86FC', autoCapitalize: 'none' }),
            h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap' } },
                PRESET_COLORS.map(hex => h(RN.Pressable, {
                    key: hex, onPress: () => setColor(hex),
                    style: { width: 28, height: 28, borderRadius: 14, backgroundColor: hex, margin: 4, borderWidth: 1, borderColor: '#ffffff55' },
                }))),
            h(Button, { text: 'Apply to group', onPress: () => {
                if (!isHex(color)) return r.toast('Enter a hex color');
                for (const name of group.names) setCustom(name, { color: color.trim() });
                r.toast('Updated ' + group.label);
                close();
            } }),
            h(Button, { text: 'Reset group', variant: 'secondary', onPress: () => {
                for (const name of group.names) setCustom(name, null);
                r.toast('Reset ' + group.label);
                close();
            } }));
    }
    function Settings() {
        r.useRefresh();
        const [query, setQuery] = React.useState('');
        const q = query.trim().toLowerCase();
        const filtered = names.filter(name => !q || name.toLowerCase().includes(q));
        const rows = filtered.slice(0, 80).map(name => h(D.TableRow, {
            key: name,
            label: name,
            subLabel: customFor(name) ? 'Overridden' : (isCatalogIcon(name) ? 'Discord default' : 'Asset key'),
            icon: C.RowIcon && isCatalogIcon(name) ? h(C.RowIcon, { name }) : undefined,
            onPress: () => { try { r.open('edit-' + name, Editor, { name }); } catch (e) { r.error('Icon editor', e); } },
        }));
        return h(Page, { title: 'Icon Changer' },
            h(Toggle, { setting: 'enabled', label: 'Enable icon overrides' }),
            h(Text, null, 'Quick groups (same color on every related asset)'),
            ...(D.TableRowGroup ? [h(D.TableRowGroup, { title: 'Common icons' }, GROUPS.map(group => h(D.TableRow, {
                key: group.id,
                label: group.label,
                subLabel: group.names.filter(isCatalogIcon).slice(0, 3).join(', '),
                icon: C.RowIcon && isCatalogIcon(group.names[0]) ? h(C.RowIcon, { name: group.names[0] }) : undefined,
                onPress: () => { try { r.open('group-' + group.id, GroupEditor, { group }); } catch (e) { r.error('Icon group', e); } },
            })))] : []),
            h(Text, null, 'Tint all Discord icons (unless a per-icon override exists)'),
            h(Input, { value: r.store.globalColor || '', onChange: text => r.set('globalColor', text), placeholder: '#BB86FC', autoCapitalize: 'none' }),
            h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap' } },
                PRESET_COLORS.map(hex => h(RN.Pressable, {
                    key: hex, onPress: () => r.set('globalColor', hex),
                    style: { width: 28, height: 28, borderRadius: 14, backgroundColor: hex, margin: 4, borderWidth: 1, borderColor: '#ffffff55' },
                }))),
            h(Button, { text: 'Clear global tint', variant: 'secondary', onPress: () => r.set('globalColor', '') }),
            h(Input, { value: query, onChange: setQuery, placeholder: 'Search icons', autoCapitalize: 'none' }),
            h(Text, { muted: true }, `${filtered.length} icons. Showing ${Math.min(80, filtered.length)}. Set a global tint to recolor the whole app.`),
            D.TableRowGroup ? h(D.TableRowGroup, { title: 'Icons' }, rows) : h(RN.View, null, rows));
    }
    return {
        async start() {
            try {
                const theme = (await r.request(THEME_URL, {}, 15000, 200000)).json();
                const fromTheme = theme?.plus?.icons && typeof theme.plus.icons === 'object' ? Object.keys(theme.plus.icons) : [];
                fromTheme.forEach(n => nameSet.add(n));
            } catch {}
            try {
                if (typeof B.assets?.iterateAssets === 'function') {
                    for (const asset of B.assets.iterateAssets()) {
                        if (asset?.name && asset.id != null) {
                            idToName.set(Number(asset.id), asset.name);
                            if (isCatalogIcon(asset.name) || /^ic_/.test(asset.name) || asset.name.startsWith('img_')) nameSet.add(asset.name);
                        }
                    }
                }
            } catch {}
            names = [...nameSet];
            function mark(next) {
                if (!next || next === true) return next;
                if (next.props?.__mimeIcon) return next;
                return React.cloneElement(next, { __mimeIcon: true });
            }
            r.patch('after', React, 'createElement', (args, result) => {
                if (!r.store.enabled || !result?.props || result.props.__mimeIcon) return;
                const type = args[0];
                const Img = RN.Image;
                const isImage = type === Img || type === Img?.render || type === 'RCTImageView'
                    || type?.displayName === 'Image' || type?.name === 'Image' || type?.name === 'RCTImageView';
                if (isImage) return mark(applyImage(result) || result);
                const named = typeof result.props.name === 'string' ? result.props.name
                    : typeof result.props.icon === 'string' ? result.props.icon : null;
                if (named) return mark(applyNamed(result, named) || result);
                if (result.props.source != null) return mark(applyImage(result) || result);
            });
            if (typeof RN.Image?.prototype?.render === 'function') {
                r.patch('after', RN.Image.prototype, 'render', function (_args, res) {
                    if (!r.store.enabled || !this?.props || !res?.props) return res;
                    const next = applyImage(res);
                    return next || res;
                });
            }
            r.hook(['Image', 'RCTImageView', 'FastImage', 'Icon', 'RowIcon', 'IconButton'], element => {
                if (!r.store.enabled || element.props?.__mimeIcon) return;
                if (element.props.source != null) return applyImage(element);
                const name = element.props.name || (typeof element.props.icon === 'string' ? element.props.icon : null);
                if (name) return applyNamed(element, name);
            });
        },
        Settings,
    };
}
IconChanger.defaults = { enabled: true, icons: {}, globalColor: '' };
