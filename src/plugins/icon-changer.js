import { ui } from '../runtime.js';
import CATALOG from './icon-catalog.json';

const THEME_URL = 'https://raw.githubusercontent.com/xMimiez/Snow-Themes/refs/heads/main/DarkPlus/DarkPlus-mobile.json';

const THEME_ICON_KEYS = [
    'ic_radio_circle_checked', 'ic_radio_circle_checked__overlay',
    'ic_radio_square_checked_24px', 'ic_radio_square_checked_24px__overlay',
    'ic_selection_checked_24px', 'ic_selection_checked_24px__overlay',
    'ic_star_filled', 'img_guild_folder',
    'StatusOnline', 'StatusIdle', 'StatusDND', 'StatusOffline', 'StatusMobileOnline',
    'ic_send', 'ic_send__overlay',
    'ShopIcon', 'PencilIcon', 'SettingsIcon', 'MagnifyingGlassIcon', 'search',
    'MoreHorizontalIcon', 'NitroWheelIcon',
];

const GROUPS = [
    { id: 'search', label: 'Search', names: ['search', 'MagnifyingGlassIcon', 'ChannelListMagnifyingGlassIcon'] },
    { id: 'unread', label: 'Unread messages', names: ['ChatMarkUnreadIcon', 'InboxIcon', 'ChatDotsIcon', 'ChatIcon'] },
    { id: 'friends', label: 'Add friends', names: ['UserPlusIcon', 'FriendsIcon', 'GroupPlusIcon', 'NewUserIcon'] },
    { id: 'plus', label: '+ / Add', names: ['PlusSmallIcon', 'PlusMediumIcon', 'PlusLargeIcon', 'CirclePlusIcon', 'ChatPlusIcon'] },
    { id: 'settings', label: 'Settings icons', names: ['SettingsIcon', 'WrenchIcon', 'UserIcon', 'ShieldIcon', 'BellIcon', 'GiftIcon', 'NitroWheelIcon', 'LanguageIcon', 'LockIcon', 'CircleInformationIcon'] },
    { id: 'send', label: 'Send', names: ['ic_send', 'ic_send__overlay', 'SendMessageIcon'] },
    { id: 'status', label: 'Status dots', names: ['StatusOnline', 'StatusIdle', 'StatusDND', 'StatusOffline', 'StatusMobileOnline'] },
];

const PRESET_COLORS = ['#BB86FC', '#CDAEF3', '#5865F2', '#212121', '#EDEDED', '#81C995', '#E2C06A', '#CF6679', '#6A6A6A'];

function isHex(value) {
    return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(String(value || '').trim());
}
function isCatalogIcon(name) {
    return typeof name === 'string' && /Icon$/.test(name) && !name.includes('__');
}

function findPlusIcons(r) {
    const seen = new Set();
    const bags = [];
    const add = value => { if (value && typeof value === 'object' && !seen.has(value)) { seen.add(value); bags.push(value); } };
    add(r.B?.themes);
    add(r.B?.managers?.themes);
    add(r.host?.themes);
    add(r.B?.api?.themes);
    add(typeof globalThis !== 'undefined' && globalThis.snow?.themes);
    add(r.find('getCurrentTheme'));
    add(r.find('iconpack'));
    add(r.find('plus', 'semanticColors'));
    add(r.find('icons', 'iconpack'));
    for (const bag of bags) {
        const theme = typeof bag.getCurrentTheme === 'function' ? bag.getCurrentTheme() : (bag.currentTheme || bag.theme || bag.data || bag);
        const plus = theme?.plus || theme?.data?.plus || (theme?.icons && theme);
        if (plus?.icons && typeof plus.icons === 'object') return plus.icons;
        if (bag.icons && typeof bag.icons === 'object' && (bag.iconpack != null || bag.version != null)) return bag.icons;
    }
    return null;
}

export default function IconChanger(r) {
    const { h, React, RN, C, D } = r, { Page, Text, Button, Input, Toggle } = ui(r);
    const nameSet = new Set(THEME_ICON_KEYS.concat(CATALOG));
    let names = [...nameSet];
    let plusIcons = null;
    const idToName = new Map();
    function stored() { return r.store.icons && typeof r.store.icons === 'object' ? r.store.icons : {}; }
    function customFor(name) {
        if (!name) return null;
        const map = stored();
        if (map[name]?.color || map[name]?.image) return map[name];
        if (isHex(r.store.globalColor) && (THEME_ICON_KEYS.includes(name) || isCatalogIcon(name))) return { color: r.store.globalColor };
        return null;
    }
    function writeTheme(name, color) {
        if (!plusIcons) plusIcons = findPlusIcons(r);
        if (!plusIcons || typeof plusIcons !== 'object') return false;
        try {
            if (color) plusIcons[name] = color;
            else delete plusIcons[name];
            return true;
        } catch { return false; }
    }
    function applyAllToTheme() {
        plusIcons = findPlusIcons(r) || plusIcons;
        if (!plusIcons) return 0;
        let n = 0;
        if (isHex(r.store.globalColor)) {
            for (const name of nameSet) {
                if (stored()[name]?.color) continue;
                if (writeTheme(name, r.store.globalColor)) n++;
            }
        }
        for (const [name, custom] of Object.entries(stored())) {
            if (custom?.color && writeTheme(name, custom.color)) n++;
        }
        return n;
    }
    function setCustom(name, next) {
        const map = { ...stored() };
        if (!next || (!next.color && !next.image)) delete map[name];
        else map[name] = next;
        r.set('icons', map);
        writeTheme(name, next?.color || null);
        applyAllToTheme();
    }
    function sourceId(source) {
        if (typeof source === 'number' && Number.isFinite(source)) return source;
        if (Array.isArray(source) && typeof source[0] === 'number') return source[0];
        return null;
    }
    function applyImage(element) {
        if (!r.store.enabled || !element?.props || element.props.__mimeIcon) return;
        const id = sourceId(element.props.source);
        if (id == null) return;
        let name = idToName.get(id);
        if (!name) {
            const asset = r.B.assets?.findAsset?.(id) || r.B.assets?.getAssetByID?.(id);
            name = asset?.name;
            if (name) idToName.set(id, name);
        }
        const custom = customFor(name);
        if (!custom?.color && !custom?.image) return;
        if (custom.image) return React.cloneElement(element, { source: { uri: custom.image }, __mimeIcon: true });
        return React.cloneElement(element, { style: [{ tintColor: custom.color }, element.props.style], tintColor: custom.color, __mimeIcon: true });
    }
    function Preview({ name, size = 24 }) {
        const custom = customFor(name);
        if (isCatalogIcon(name) && C.Icon) return h(C.Icon, { name, size, color: custom?.color, accessible: false });
        return h(RN.View, { style: { width: size, height: size, borderRadius: 4, backgroundColor: (custom?.color || '#5865F2') + '33' } });
    }
    function ColorEditor({ title, names: keys, close }) {
        const [color, setColor] = React.useState('');
        return h(Page, { title, close },
            h(Text, { muted: true }, 'Writes into the active theme plus.icons map (same keys Dark+ uses).'),
            h(Text, { muted: true }, keys.join(', ')),
            h(Input, { value: color, onChange: setColor, placeholder: '#BB86FC', autoCapitalize: 'none' }),
            h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap' } },
                PRESET_COLORS.map(hex => h(RN.Pressable, {
                    key: hex, onPress: () => setColor(hex),
                    style: { width: 28, height: 28, borderRadius: 14, backgroundColor: hex, margin: 4, borderWidth: 1, borderColor: '#ffffff55' },
                }))),
            h(Button, { text: 'Apply', onPress: () => {
                if (!isHex(color)) return r.toast('Enter a hex color');
                for (const name of keys) setCustom(name, { color: color.trim() });
                r.toast('Applied ' + title);
                close();
            } }),
            h(Button, { text: 'Reset', variant: 'secondary', onPress: () => {
                for (const name of keys) setCustom(name, null);
                close();
            } }));
    }
    function Settings() {
        r.useRefresh();
        const [query, setQuery] = React.useState('');
        const q = query.trim().toLowerCase();
        const filtered = names.filter(name => !q || name.toLowerCase().includes(q));
        const themeKeys = THEME_ICON_KEYS.filter(name => !q || name.toLowerCase().includes(q));
        return h(Page, { title: 'Icon Changer' },
            h(Toggle, { setting: 'enabled', label: 'Enable icon overrides', subLabel: 'Writes colors into theme plus.icons so Snow’s recolorer applies them' }),
            h(Button, { text: 'Re-apply onto current theme', variant: 'secondary', onPress: () => {
                plusIcons = findPlusIcons(r);
                const n = applyAllToTheme();
                r.toast(plusIcons ? `Wrote ${n} keys into plus.icons` : 'Could not find the live plus.icons map');
            } }),
            h(Text, null, 'Tint all listed icons'),
            h(Input, { value: r.store.globalColor || '', onChange: text => { r.set('globalColor', text); applyAllToTheme(); }, placeholder: '#BB86FC', autoCapitalize: 'none' }),
            h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap' } },
                PRESET_COLORS.map(hex => h(RN.Pressable, {
                    key: hex, onPress: () => { r.set('globalColor', hex); applyAllToTheme(); },
                    style: { width: 28, height: 28, borderRadius: 14, backgroundColor: hex, margin: 4, borderWidth: 1, borderColor: '#ffffff55' },
                }))),
            D.TableRowGroup ? h(D.TableRowGroup, { title: 'Dark+ plus.icons keys' },
                GROUPS.map(group => h(D.TableRow, {
                    key: group.id,
                    label: group.label,
                    subLabel: group.names.join(', '),
                    icon: C.RowIcon && isCatalogIcon(group.names.find(isCatalogIcon) || '') ? h(C.RowIcon, { name: group.names.find(isCatalogIcon) }) : undefined,
                    onPress: () => r.open('group-' + group.id, ColorEditor, { title: group.label, names: group.names }),
                }))) : null,
            h(Input, { value: query, onChange: setQuery, placeholder: 'Search icon keys', autoCapitalize: 'none' }),
            D.TableRowGroup ? h(D.TableRowGroup, { title: `Theme keys (${themeKeys.length})` },
                themeKeys.map(name => h(D.TableRow, {
                    key: name,
                    label: name,
                    subLabel: customFor(name)?.color || 'theme / default',
                    icon: C.RowIcon && isCatalogIcon(name) ? h(C.RowIcon, { name }) : undefined,
                    onPress: () => r.open('edit-' + name, ColorEditor, { title: name, names: [name] }),
                }))) : null,
            h(Text, { muted: true }, `${filtered.length} total keys. Dark+ recolors: ${THEME_ICON_KEYS.join(', ')}.`));
    }
    return {
        async start() {
            try {
                const theme = (await r.request(THEME_URL, {}, 15000, 200000)).json();
                const fromTheme = theme?.plus?.icons && typeof theme.plus.icons === 'object' ? Object.keys(theme.plus.icons) : [];
                fromTheme.forEach(n => nameSet.add(n));
            } catch {}
            try {
                if (typeof r.B.assets?.iterateAssets === 'function') {
                    for (const asset of r.B.assets.iterateAssets()) {
                        if (asset?.name && asset.id != null) {
                            idToName.set(Number(asset.id), asset.name);
                            if (isCatalogIcon(asset.name) || /^ic_/.test(asset.name)) nameSet.add(asset.name);
                        }
                    }
                }
            } catch {}
            names = [...nameSet];
            plusIcons = findPlusIcons(r);
            applyAllToTheme();
            r.patch('after', React, 'createElement', (args, result) => {
                if (!r.store.enabled || !result?.props || result.props.__mimeIcon) return;
                const type = args[0];
                const Img = RN.Image;
                const isImage = type === Img || type === 'RCTImageView' || type?.displayName === 'Image' || type?.name === 'Image';
                if (!isImage) return;
                return applyImage(result);
            });
        },
        Settings,
    };
}
IconChanger.defaults = { enabled: true, icons: {}, globalColor: '' };
