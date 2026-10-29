// Nighty Tab mobile port. Copyright 2026 Vendicated and contributors, Mime, rico.
// SPDX-License-Identifier: GPL-3.0-or-later
import { ui } from '../runtime.js';
import { registerSection } from '../settings-section.js';
import { patchLazySheet } from '../action-sheet.js';

export function pageUrl(value) {
    try {
        const url = new URL(String(value).trim());
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch { return null; }
}
export function canDownload(settings, message) {
    return !!settings.scriptUtils && typeof settings.nightyPrefix === 'string'
        && Array.from(settings.nightyPrefix).length === 1 && !!settings.nightyPrefix.trim()
        && !!message?.id && !!messageChannelId(message) && !!message.attachments?.length;
}
export function messageChannelId(message) { return message?.getChannelId?.() || message?.channel_id || message?.channelId; }

// Names seen on Discord profile headers. Snow builds differ, so the row shape is what actually decides a match.
const TOOLBAR_NAMES = ['ProfileHeaderActions', 'UserProfileHeaderActions', 'ProfileActionBar', 'ProfileToolbar', 'ProfileButtons', 'UserProfileActions', 'YouProfileHeaderActions', 'HeaderActionButtons', 'ProfileQuickAccessBar'];

function iconHint(node) {
    const props = node?.props || {};
    const bits = [props.name, typeof props.icon === 'string' ? props.icon : ''];
    const kids = Array.isArray(props.children) ? props.children : props.children ? [props.children] : [];
    for (const child of kids) {
        if (typeof child?.props?.name === 'string') bits.push(child.props.name);
        const type = child?.type;
        if (typeof type === 'function') bits.push(type.displayName || type.name || '');
    }
    return bits.filter(Boolean).join(' ');
}
const ACTION_KEYS = ['actions', 'buttons', 'items', 'headerActions', 'trailingActions', 'toolbarItems'];
// YouScreen is the profile tab. The others are the header row Discord has used, or still uses, for Quests / Shop / Settings.
const COMPONENT_NAMES = [...TOOLBAR_NAMES, 'YouScreen', 'YouHeader', 'YouHeaderActions', 'YouProfileHeader', 'ProfileHeaderActions', 'UserProfileHeader', 'UserProfileHeaderActions', 'UserProfileActions'];
const FILE_PATHS = [
    'modules/main_tabs_v2/native/tabs/you/YouScreen.tsx',
    'modules/main_tabs_v2/native/tabs/you/YouHeader.tsx',
    'modules/main_tabs_v2/native/tabs/you/YouHeaderActions.tsx',
    'modules/main_tabs_v2/native/tabs/you/ProfileHeaderActions.tsx',
    'modules/user_profile/native/ProfileHeaderActions.tsx',
    'modules/user_profile/native/UserProfileHeader.tsx',
    'modules/user_profile/native/UserProfileHeaderActions.tsx',
];
const SETTINGS_MESSAGE_KEYS = ['SETTINGS', 'USER_SETTINGS', 'SETTINGS_TITLE', 'OPEN_SETTINGS', 'USER_SETTINGS_BUTTON'];
const OTHER_MESSAGE_KEYS = ['QUESTS', 'SHOP', 'NITRO', 'COLLECTIBLES', 'COLLECTIBLES_SHOP', 'QUEST_HOME'];

function textOf(value, depth = 0) {
    if (value == null || depth > 2) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'function') return value.displayName || value.name || '';
    if (typeof value === 'object') return ['message', 'defaultMessage', 'id', 'displayName', 'name'].map(key => textOf(value[key], depth + 1)).filter(Boolean).join(' ');
    return '';
}
function toolbarSource(fn) {
    let src = '';
    try { src = Function.prototype.toString.call(fn); } catch { return false; }
    return src.length > 80 && src.length < 20000 && /USER_SETTINGS|SettingsIcon/.test(src) && /QUEST|COLLECTIBLES|ShopIcon|NitroIcon/.test(src);
}
function recordText(record) {
    if (!record || typeof record !== 'object') return '';
    return ['label', 'accessibilityLabel', 'accessibilityHint', 'aria-label', 'testID', 'nativeID', 'id', 'key', 'name', 'route', 'screen', 'icon', 'Icon', 'IconComponent']
        .map(key => textOf(record[key])).filter(Boolean).join(' ');
}
let settingsNeedles = [];
let otherNeedles = [];
function rememberMessages(messages) {
    if (!messages || typeof messages !== 'object') return;
    const take = (keys, bucket) => {
        for (const key of keys) {
            const value = messages[key];
            if (typeof value === 'string' && value.length >= 2 && value.length <= 32 && !bucket.includes(value)) bucket.push(value);
        }
    };
    take(SETTINGS_MESSAGE_KEYS, settingsNeedles);
    take(OTHER_MESSAGE_KEYS, otherNeedles);
}
function isSettingsText(text) {
    if (!text || /notification/i.test(text)) return false;
    if (/settings?|SettingsIcon|GearIcon|CogIcon|USER_SETTINGS|\b(gear|cog)\b/i.test(text)) return true;
    return settingsNeedles.some(word => text.includes(word));
}
function isOtherText(text) {
    if (!text) return false;
    if (/quest|shop|collectible|nitro|QuestIcon|ShopIcon|NitroIcon|CollectiblesIcon/i.test(text)) return true;
    return otherNeedles.some(word => text.includes(word));
}
function pressProps(record) {
    if (!record || typeof record !== 'object' || record.subLabel || record.trailing) return false;
    if (typeof record.label === 'string' && record.label.length > 40) return false;
    return typeof record.onPress === 'function' || typeof record.onPressOut === 'function';
}
function nodeText(node) {
    const props = node?.props;
    if (!props) return '';
    return ['accessibilityLabel', 'accessibilityHint', 'aria-label', 'testID', 'nativeID', 'label', 'name', 'route', 'screen', 'id']
        .map(key => textOf(props[key])).concat(iconHint(node)).filter(Boolean).join(' ');
}
function isIconControl(node) { return pressProps(node?.props); }
export function isSettingsControl(node) { return isIconControl(node) && isSettingsText(nodeText(node)); }
export function isQuestOrShopControl(node) { return isIconControl(node) && isOtherText(nodeText(node)); }
function plainKind(item) {
    if (!pressProps(item) || item.props) return '';
    const text = recordText(item);
    if (isSettingsText(text)) return 'settings';
    if (isOtherText(text)) return 'other';
    return '';
}
function controlKind(node) {
    if (isSettingsControl(node)) return 'settings';
    if (isQuestOrShopControl(node)) return 'other';
    const inner = node?.props?.children;
    const list = Array.isArray(inner) ? inner.filter(Boolean) : inner ? [inner] : [];
    if (list.length !== 1) return '';
    if (isSettingsControl(list[0])) return 'settings-wrap';
    if (isQuestOrShopControl(list[0])) return 'other-wrap';
    return '';
}
export function replacePlainActions(list, makeButton) {
    if (!Array.isArray(list) || list.length < 2 || list.length > 8) return list;
    const kinds = list.map(plainKind);
    if (!kinds.includes('settings') || !kinds.includes('other')) return list;
    let replaced = false;
    return list.map((item, index) => {
        if (replaced || kinds[index] !== 'settings') return item;
        replaced = true;
        return makeButton(item);
    });
}
// Swaps the Settings icon only when Quests or Shop is in the same short row. Other Settings buttons stay.
export function replaceSettingsSlot(React, element, makeButton) {
    const children = element?.props?.children;
    const list = Array.isArray(children) ? children.filter(Boolean) : null;
    if (!list || list.length < 2 || list.length > 8) return element;
    const kinds = list.map(controlKind);
    if (!kinds.includes('settings') && !kinds.includes('settings-wrap')) return element;
    if (!kinds.some(kind => kind === 'other' || kind === 'other-wrap')) return element;
    let replaced = false;
    const next = list.map((node, index) => {
        if (replaced) return node;
        if (kinds[index] === 'settings') { replaced = true; return makeButton(node); }
        if (kinds[index] === 'settings-wrap') {
            replaced = true;
            const inner = Array.isArray(node.props.children) ? node.props.children.filter(Boolean) : [node.props.children];
            return React.cloneElement(node, {}, makeButton(inner[0]));
        }
        return node;
    });
    return replaced ? React.cloneElement(element, {}, ...next) : element;
}
export default function NightyTab(r) {
    const { h, React, RN, store } = r;
    const { Page, Text, Button, Input, Toggle } = ui(r);
    const iconUrl = () => store.iconType === 'custom' ? pageUrl(store.customIconUrl)
        : `https://raw.githubusercontent.com/aboveproof/Equicord-Nighty-Tab/main/asset/icon${store.iconType === 'grayscale' ? '-grayscale' : ''}.png`;
    function Icon() {
        r.useRefresh();
        const uri = iconUrl();
        return uri ? h(RN.View, { style: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' } },
            h(RN.Image, { source: { uri }, resizeMode: 'contain', style: { width: 18, height: 18 }, accessibilityIgnoresInvertColors: true })) : null;
    }
    const sending = new Set();
    async function download(message) {
        if (!r.active || !canDownload(store, message) || sending.has(message.id)) return;
        sending.add(message.id);
        try {
            const module = r.find('HTTP', 'get', 'post', 'put', 'patch', 'del') || r.find('get', 'post', 'put', 'del');
            const rest = module?.HTTP || module;
            if (typeof rest?.post !== 'function') throw new Error('Discord message API unavailable');
            const channelId = messageChannelId(message);
            await rest.post({ url: `/channels/${channelId}/messages`, body: {
                content: `${store.nightyPrefix}dls`,
                message_reference: { message_id: message.id, channel_id: channelId, ...(message.guild_id ? { guild_id: message.guild_id } : {}) },
                allowed_mentions: { parse: [], replied_user: false },
            } });
        } finally { sending.delete(message.id); }
    }
    function NightyPage() {
        r.useRefresh();
        const src = pageUrl(store.url);
        const WebView = r.find('WebView')?.WebView || r.byName('WebView');
        const [error, setError] = React.useState('');
        return h(RN.View, { style: { flex: 1 } },
            !src ? h(Text, null, 'Set a valid HTTP or HTTPS URL in Nighty Tab settings.')
                : !WebView ? h(Text, null, 'WebView is unavailable in this Snow build.')
                    : h(WebView, {
                        key: src, source: { uri: src }, style: { flex: 1 },
                        originWhitelist: ['http://*', 'https://*'], javaScriptEnabled: true, domStorageEnabled: true,
                        sharedCookiesEnabled: false, thirdPartyCookiesEnabled: false, startInLoadingState: true,
                        onShouldStartLoadWithRequest: req => !!pageUrl(req.url),
                        onError: event => setError(event.nativeEvent?.description || 'Could not load Nighty.'),
                        onHttpError: event => setError(`Nighty returned HTTP ${event.nativeEvent?.statusCode}.`),
                        onLoad: () => setError(''),
                    }),
            error ? h(Text, null, error) : null);
    }
    function Settings({ close }) {
        r.useRefresh();
        return h(Page, { title: 'Nighty Tab', close },
            h(Text, null, 'URL'), h(Input, { value: store.url, placeholder: 'https://', autoCapitalize: 'none', onChange: v => r.set('url', v) }),
            store.url && !pageUrl(store.url) ? h(Text, null, 'Enter an HTTP or HTTPS URL without embedded credentials.') : null,
            h(Button, { text: 'Open Nighty', onPress: () => r.open('nighty', NightyPage, {}, { scrollable: false }) }),
            h(Toggle, { setting: 'showNightyButton', label: 'Nighty instead of Settings', subLabel: 'Shows Nighty in place of the Settings button next to Quests and Shop. Turn this off and reopen your profile to get Settings back.' }),
            h(Toggle, { setting: 'scriptUtils', label: 'Script Utils functions', subLabel: 'Download Script replies to an attachment with your prefix followed by dls.' }),
            h(Text, null, 'Nighty prefix (one character)'),
            h(Input, { value: store.nightyPrefix, onChange: v => r.set('nightyPrefix', v), autoCapitalize: 'none', placeholder: '.' }),
            ...['blue', 'grayscale', 'custom'].map(style => h(Button, { key: style, text: `${store.iconType === style ? '✓ ' : ''}${style} icon`, onPress: () => r.set('iconType', style) })),
            store.iconType === 'custom' ? h(Input, { value: store.customIconUrl, placeholder: 'https:// image URL', autoCapitalize: 'none', onChange: v => r.set('customIconUrl', v) }) : null,
            h(Icon), h(Text, { muted: true }, `Settings entry: ${r.status.settingsEntry ? 'registered' : 'unavailable'} · Message menu: ${r.status.messageMenu ? 'registered' : 'unavailable'} · Profile button: ${store.showNightyButton ? (r.status.profileButton === 'replaced' ? 'replaced Settings' : 'watching') : 'off'}`));
    }
    function toolbarGraphic() {
        const uri = iconUrl();
        // A real element, not a component type. Discord draws `icon` with {icon} or <Image source={icon} />.
        // A function in that slot renders as nothing, which left only the word Nighty.
        return h(RN.View, { style: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' } },
            uri ? h(RN.Image, { source: { uri }, resizeMode: 'contain', style: { width: 24, height: 24 }, accessibilityIgnoresInvertColors: true }) : null);
    }
    function openNighty() {
        if (!r.active) return;
        // The settings-row onPress navigates a route that exists only inside Settings.
        // From the profile that call returns without opening anything. The sheet is the same path as Open Nighty.
        try { r.open('nighty', NightyPage, {}, { scrollable: false }); }
        catch (error) { if (r.active) r.error('Open Nighty', error); }
    }
    function press() {
        return () => { if (r.active && store.showNightyButton) openNighty(); };
    }
    const PRESS_KEYS = ['onPress', 'onPressOut', 'onPressIn', 'action', 'onClick'];
    function applyPress(sample, next) {
        let bound = false;
        for (const key of PRESS_KEYS) {
            if (typeof sample[key] === 'function') { next[key] = press(); bound = true; }
        }
        if (!bound) next.onPress = press();
        return next;
    }
    function applyIcon(sample, next, graphic) {
        let bound = false;
        for (const key of ['icon', 'Icon', 'IconComponent', 'iconComponent', 'leading']) {
            if (!(key in sample)) continue;
            next[key] = graphic;
            bound = true;
        }
        if (!bound) next.icon = graphic;
        if (sample.source && typeof sample.source === 'object') next.source = graphic.props?.children?.props?.source || sample.source;
        return next;
    }
    function nightyControl(sample) {
        const graphic = toolbarGraphic();
        const props = applyPress(sample.props, {
            accessibilityLabel: 'Nighty',
            accessibilityHint: 'Open Nighty',
            testID: 'mime-nighty-profile-button',
        });
        if (typeof sample.props.label === 'string' || (sample.props.label && typeof sample.props.label === 'object')) props.label = 'Nighty';
        if (typeof sample.props.text === 'string') props.text = 'Nighty';
        applyIcon(sample.props, props, graphic);
        return r.React.cloneElement(sample, props, toolbarGraphic());
    }
    function nightyRecord(sample) {
        const graphic = toolbarGraphic();
        const next = applyPress(sample, applyIcon(sample, {
            ...sample,
            accessibilityLabel: 'Nighty',
            accessibilityHint: 'Open Nighty',
        }, graphic));
        if ('label' in sample) next.label = 'Nighty';
        if ('text' in sample) next.text = 'Nighty';
        if ('title' in sample && typeof sample.title === 'string') next.title = 'Nighty';
        return next;
    }
    function applyToolbar(element) {
        if (!r.active || !store.showNightyButton || !element?.props) return element;
        const slotted = replaceSettingsSlot(r.React, element, nightyControl);
        if (slotted !== element) { r.status.profileButton = 'replaced'; return slotted; }
        let changed = false;
        const props = {};
        for (const key of ACTION_KEYS) {
            const next = replacePlainActions(element.props[key], nightyRecord);
            if (next !== element.props[key]) { props[key] = next; changed = true; }
        }
        if (!changed) return element;
        r.status.profileButton = 'replaced';
        return r.React.cloneElement(element, props);
    }
    function applyDeep(node, depth = 0) {
        if (node == null || depth > 10) return node;
        if (Array.isArray(node)) {
            if (node.length > 40) return node;
            let changed = false;
            const mapped = node.map(child => {
                const next = applyDeep(child, depth + 1);
                if (next !== child) changed = true;
                return next;
            });
            return changed ? mapped : node;
        }
        const next = applyToolbar(node);
        if (next !== node || !r.React.isValidElement(node)) return next;
        const children = next.props?.children;
        const nextChildren = applyDeep(children, depth + 1);
        if (nextChildren === children) return node;
        return r.React.cloneElement(node, {}, nextChildren);
    }
    const watched = new Set();
    const proxies = new Map();
    const proxiedNames = new Set();
    function watch(parent, key, deep) {
        const fn = parent?.[key];
        if (typeof fn !== 'function' || watched.has(fn)) return false;
        watched.add(fn);
        return r.patch('after', parent, key, (_args, result) => {
            const next = deep ? applyDeep(result) : applyToolbar(result);
            return next === result ? undefined : next;
        });
    }
    // Snow's JSX hook sees the element, not the rendered tree. Swap in a wrapper so the profile screen's own output is what we edit.
    function wrapRender(type) {
        if (proxies.has(type)) return proxies.get(type);
        function Proxy(props) {
            const rendered = type(props);
            const next = applyDeep(rendered);
            return next === undefined ? rendered : next;
        }
        const label = type.displayName || type.name || 'row';
        Proxy.displayName = `NightyProxy(${label})`;
        proxies.set(type, Proxy);
        return Proxy;
    }
    function installRenderProxy(name) {
        const jsx = r.B.api?.react?.jsx;
        if (!name || proxiedNames.has(name) || typeof jsx?.onJsxCreate !== 'function') return false;
        proxiedNames.add(name);
        const callback = (Component, element) => {
            if (!r.active || !store.showNightyButton || typeof Component !== 'function' || !element) return;
            const type = wrapRender(Component);
            const next = r.React.createElement(type, element.props);
            next.key = element.key;
            next.ref = element.ref;
            return next;
        };
        jsx.onJsxCreate(name, callback);
        r.own(() => { try { jsx.deleteJsxCreate(name, callback); } catch { /* already removed */ } });
        return true;
    }
    function considerModule(mod) {
        if (!mod || typeof mod !== 'object') return;
        for (const key of Object.keys(mod)) {
            const value = mod[key];
            const fn = typeof value === 'function' ? value : value?.render || value?.type;
            if (typeof fn !== 'function') continue;
            const name = fn.displayName || fn.name || '';
            if (!COMPONENT_NAMES.includes(name) && !toolbarSource(fn)) continue;
            if (typeof value === 'function') watch(mod, key, true);
            else if (typeof value.render === 'function') watch(value, 'render', true);
            else if (typeof value.type === 'function') watch(value, 'type', true);
            if (name) installRenderProxy(name);
        }
    }
    return { Settings, NightyPage, download, start() {
        r.status.settingsEntry = registerSection(r, { name: 'Nighty', items: [{ key: 'MIME_NIGHTY', title: () => 'Nighty', headerShown: false, IconComponent: Icon, render: async () => ({ default: NightyPage }) }] });
        r.status.messageMenu = patchLazySheet(r, (key, props) => key === 'MessageLongPressActionSheet' && canDownload(store, props?.message)
            ? { key: 'mime-nighty-download', label: 'Download Script', icon: h(Icon), onPress: () => download(props.message) } : null);
        rememberMessages(r.common?.i18n?.Messages || r.find('Messages')?.Messages);
        let proxied = false;
        for (const name of COMPONENT_NAMES) if (installRenderProxy(name)) proxied = true;
        const patched = watch(React, 'createElement', false);
        for (const key of ['jsx', 'jsxs']) watch(React, key, false);
        const metro = r.B.metro;
        const factories = [r.B._jsx, r.host?._jsx];
        try {
            const found = metro?.findByPropsAll?.('jsx', 'jsxs') || [];
            factories.push(...found, metro?.findByProps?.('jsx', 'jsxs'));
        } catch { /* finder shape differs between Snow builds */ }
        for (const factory of factories) {
            watch(factory, 'jsx', false);
            watch(factory, 'jsxs', false);
        }
        for (const name of COMPONENT_NAMES) {
            try {
                considerModule(metro?.findByName?.(name, false));
                considerModule(metro?.findByDisplayName?.(name, false));
                considerModule(metro?.findByTypeName?.(name, false));
            } catch { /* finder shape differs between Snow builds */ }
        }
        for (const filePath of FILE_PATHS) {
            try { considerModule(metro?.findByFilePath?.(filePath, false)); }
            catch { /* this Snow build has no file-path finder */ }
        }
        try {
            const matches = metro?.findAll?.(mod => {
                const fn = mod?.default || mod?.render || mod;
                const label = fn?.displayName || fn?.name;
                return typeof label === 'string' && COMPONENT_NAMES.includes(label);
            }) || [];
            for (const mod of matches) considerModule(mod?.default ? mod : { default: mod });
        } catch { /* finder shape differs between Snow builds */ }
        const armed = patched !== false || proxied;
        r.status.profileButton = armed ? (r.status.profileButton === 'replaced' ? 'replaced' : 'patched') : 'unavailable';
    } };
}
NightyTab.defaults = { url: '', scriptUtils: false, nightyPrefix: '.', iconType: 'blue', customIconUrl: '', showNightyButton: true };
