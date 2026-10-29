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
const SETTINGS_MESSAGE_KEYS = ['SETTINGS', 'USER_SETTINGS', 'SETTINGS_TITLE', 'OPEN_SETTINGS', 'USER_SETTINGS_BUTTON'];
const OTHER_MESSAGE_KEYS = ['QUESTS', 'SHOP', 'NITRO', 'COLLECTIBLES', 'COLLECTIBLES_SHOP', 'QUEST_HOME'];

function textOf(value, depth = 0) {
    if (value == null || depth > 2) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'function') return value.displayName || value.name || '';
    if (typeof value === 'object') return ['message', 'defaultMessage', 'id', 'displayName', 'name'].map(key => textOf(value[key], depth + 1)).filter(Boolean).join(' ');
    return '';
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
export function insertPlainAction(list, makeButton) {
    if (!Array.isArray(list) || list.length < 2 || list.length > 8) return list;
    if (list.some(item => item?.key === 'mime-nighty-profile-button' || item?.id === 'mime-nighty-profile-button')) return list;
    const kinds = list.map(plainKind);
    const index = kinds.indexOf('settings');
    if (index < 0 || !kinds.includes('other')) return list;
    const next = list.slice();
    next.splice(index + 1, 0, makeButton(list[index]));
    return next;
}
// Adds a Nighty control beside Settings. Settings itself is not changed. Only a short row that also has Quests or Shop.
export function insertNightySlot(React, element, makeButton) {
    const children = element?.props?.children;
    const list = Array.isArray(children) ? children.filter(Boolean) : null;
    if (!list || list.length < 2 || list.length > 8) return element;
    if (list.some(node => node?.props?.testID === 'mime-nighty-profile-button')) return element;
    const kinds = list.map(controlKind);
    const index = kinds.findIndex(kind => kind === 'settings' || kind === 'settings-wrap');
    if (index < 0 || !kinds.some(kind => kind === 'other' || kind === 'other-wrap')) return element;
    const node = list[index];
    const sample = kinds[index] === 'settings' ? node
        : (Array.isArray(node.props.children) ? node.props.children.filter(Boolean)[0] : node.props.children);
    const added = makeButton(sample);
    if (!added) return element;
    const next = list.slice();
    next.splice(index + 1, 0, added);
    return React.cloneElement(element, {}, ...next);
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
    function settingsHeight() {
        // The settings screen fills the app window. Match that, not a shorter sheet.
        const windowHeight = RN.Dimensions?.get?.('window')?.height;
        return typeof windowHeight === 'number' && windowHeight > 0 ? Math.round(windowHeight) : 700;
    }
    function NightyPage() {
        r.useRefresh();
        const src = pageUrl(store.url);
        const WebView = r.find('WebView')?.WebView || r.byName('WebView');
        const [error, setError] = React.useState('');
        const height = settingsHeight();
        // Fill the pushed screen. That screen is the same full-window size as Settings.
        const frame = { flex: 1, width: '100%', height, minHeight: height };
        // about:blank is the WebView's first load; blocking it leaves the page empty on iOS.
        const allow = req => {
            const url = req?.url || '';
            return !url || url === 'about:blank' || url === src || !!pageUrl(url);
        };
        return h(RN.View, { style: frame },
            !src ? h(Text, null, 'Set a valid HTTP or HTTPS URL in Nighty Tab settings.')
                : !WebView ? h(Text, null, 'WebView is unavailable in this Snow build.')
                    : h(WebView, {
                        key: src, source: { uri: src }, style: { flex: 1, height, width: '100%' },
                        originWhitelist: ['http://*', 'https://*'], javaScriptEnabled: true, domStorageEnabled: true,
                        sharedCookiesEnabled: false, thirdPartyCookiesEnabled: false, startInLoadingState: true,
                        onShouldStartLoadWithRequest: allow,
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
            h(Button, { text: 'Open Nighty', onPress: openNighty }),
            h(Toggle, { setting: 'showNightyButton', label: 'Profile Nighty button', subLabel: 'Adds a Nighty button beside Settings on your profile. It uses the same icon as the Nighty settings row.' }),
            h(Toggle, { setting: 'scriptUtils', label: 'Script Utils functions', subLabel: 'Download Script replies to an attachment with your prefix followed by dls.' }),
            h(Text, null, 'Nighty prefix (one character)'),
            h(Input, { value: store.nightyPrefix, onChange: v => r.set('nightyPrefix', v), autoCapitalize: 'none', placeholder: '.' }),
            ...['blue', 'grayscale', 'custom'].map(style => h(Button, { key: style, text: `${store.iconType === style ? '✓ ' : ''}${style} icon`, onPress: () => r.set('iconType', style) })),
            store.iconType === 'custom' ? h(Input, { value: store.customIconUrl, placeholder: 'https:// image URL', autoCapitalize: 'none', onChange: v => r.set('customIconUrl', v) }) : null,
            h(Icon), h(Text, { muted: true }, `Settings entry: ${r.status.settingsEntry ? 'registered' : 'unavailable'} · Message menu: ${r.status.messageMenu ? 'registered' : 'unavailable'} · Profile button: ${store.showNightyButton ? (r.status.profileButton === 'added' ? 'added beside Settings' : 'watching') : 'off'}`));
    }
    function routeNames(state, found = []) {
        if (!state || typeof state !== 'object') return found;
        if (Array.isArray(state.routeNames)) found.push(...state.routeNames);
        for (const route of state.routes || []) routeNames(route.state, found);
        return found;
    }
    function rootNav() {
        const raw = r.find('getRootNavigationRef')?.getRootNavigationRef?.();
        return raw?.navigate ? raw : raw?.current;
    }
    function settingsParams() {
        return {
            title: 'Nighty',
            headerShown: false,
            owner: r.meta.id,
            render: () => r.active ? h(NightyPage, { close: () => rootNav()?.goBack?.() }) : null,
        };
    }
    // The settings row opens MIME_PLUGIN_SETTINGS_PAGE on the settings stack. That screen is full height.
    // A bottom sheet cannot grow to that size, and the route is absent until Settings is mounted.
    function openSettingsScreen() {
        const nav = rootNav();
        if (typeof nav?.navigate !== 'function') return false;
        const names = routeNames(nav.getRootState?.() || nav.getState?.());
        if (!names.includes('MIME_PLUGIN_SETTINGS_PAGE')) return false;
        nav.navigate('MIME_PLUGIN_SETTINGS_PAGE', settingsParams());
        return true;
    }
    let settingsOpener = null;
    let openTimer = null;
    function clearOpenTimer() {
        if (!openTimer) return;
        clearInterval(openTimer);
        openTimer = null;
    }
    function openSheet() {
        try { r.open('nighty', NightyPage, {}, { scrollable: false }); }
        catch (error) { if (r.active) r.error('Open Nighty', error); }
    }
    function openNighty() {
        if (!r.active) return;
        try { if (openSettingsScreen()) return; }
        catch (error) { if (r.active) r.error('Open Nighty', error); }
        const navigationRef = r.find('getRootNavigationRef');
        if (navigationRef && typeof settingsOpener === 'function') {
            try { settingsOpener(); }
            catch (error) { if (r.active) r.error('Open Nighty', error); }
            if (openSettingsScreen()) return;
            clearOpenTimer();
            let left = 40;
            openTimer = setInterval(() => {
                if (!r.active || left-- <= 0) {
                    clearOpenTimer();
                    if (r.active && left < 0) openSheet();
                    return;
                }
                try { if (openSettingsScreen()) clearOpenTimer(); }
                catch (error) { clearOpenTimer(); if (r.active) r.error('Open Nighty', error); }
            }, 50);
            r.own(clearOpenTimer);
            return;
        }
        openSheet();
    }
    function press() {
        return () => { if (r.active && store.showNightyButton) openNighty(); };
    }
    function flatStyle(style) {
        const list = Array.isArray(style) ? style : [style];
        const next = {};
        for (const item of list) if (item && typeof item === 'object') Object.assign(next, item);
        return next;
    }
    function iconSize(node, depth = 0) {
        if (!node || depth > 5) return null;
        const props = node.props || {};
        const style = flatStyle(props.style);
        if (typeof style.width === 'number' && typeof style.height === 'number') return { width: style.width, height: style.height };
        if (typeof props.size === 'number') return { width: props.size, height: props.size };
        const kids = Array.isArray(props.children) ? props.children : props.children ? [props.children] : [];
        for (const kid of kids) {
            const found = iconSize(kid, depth + 1);
            if (found) return found;
        }
        return null;
    }
    // Same artwork as the settings-row Icon, as a host Image so the toolbar can draw it directly.
    function toolbarIcon(sample) {
        const uri = iconUrl();
        const size = iconSize(sample)?.width || 32;
        if (!uri) return null;
        return h(RN.Image, {
            source: { uri },
            resizeMode: 'contain',
            accessibilityIgnoresInvertColors: true,
            style: { width: size, height: size },
        });
    }
    // The toolbar button ignores children and would forward an icon element onto RCTView.
    // Draw the same settings-row Icon inside RN.Pressable, and keep Settings' own onPress so this page can use that stack.
    function nightyControl(sample) {
        const props = sample?.props || {};
        if (typeof props.onPress === 'function') settingsOpener = props.onPress;
        const Pressable = RN.Pressable || sample.type;
        return h(Pressable, {
            key: 'mime-nighty-profile-button',
            accessibilityLabel: 'Nighty',
            accessibilityHint: 'Open Nighty',
            accessibilityRole: 'button',
            testID: 'mime-nighty-profile-button',
            hitSlop: props.hitSlop || { top: 8, bottom: 8, left: 8, right: 8 },
            onPress: press(),
            style: [props.style, { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' }],
        }, h(Icon));
    }
    function nightyRecord(sample) {
        const image = toolbarIcon(sample);
        return {
            key: 'mime-nighty-profile-button',
            id: 'mime-nighty-profile-button',
            label: 'Nighty',
            accessibilityLabel: 'Nighty',
            accessibilityHint: 'Open Nighty',
            IconComponent: Icon,
            icon: typeof sample?.icon === 'function' ? Icon : image,
            onPress: press(),
        };
    }
    function applyToolbar(element) {
        if (!r.active || !store.showNightyButton || !element?.props) return element;
        const slotted = insertNightySlot(r.React, element, nightyControl);
        if (slotted !== element) { r.status.profileButton = 'added'; return slotted; }
        let changed = false;
        const props = {};
        for (const key of ACTION_KEYS) {
            const next = insertPlainAction(element.props[key], nightyRecord);
            if (next !== element.props[key]) { props[key] = next; changed = true; }
        }
        if (!changed) return element;
        r.status.profileButton = 'added';
        return r.React.cloneElement(element, props);
    }
    const watched = new Set();
    function watch(parent, key) {
        const fn = parent?.[key];
        if (typeof fn !== 'function' || watched.has(fn)) return false;
        watched.add(fn);
        return r.patch('after', parent, key, (_args, result) => {
            const next = applyToolbar(result);
            return next === result ? undefined : next;
        });
    }
    return { Settings, NightyPage, download, start() {
        r.status.settingsEntry = registerSection(r, { name: 'Nighty', items: [{ key: 'MIME_NIGHTY', title: () => 'Nighty', headerShown: false, IconComponent: Icon, render: async () => ({ default: NightyPage }) }] });
        r.status.messageMenu = patchLazySheet(r, (key, props) => key === 'MessageLongPressActionSheet' && canDownload(store, props?.message)
            ? { key: 'mime-nighty-download', label: 'Download Script', icon: h(Icon), onPress: () => download(props.message) } : null);
        rememberMessages(r.common?.i18n?.Messages || r.find('Messages')?.Messages);
        // Patch element creation only. Wrapping YouScreen and cloning its tree crashes RCTView.
        const patched = watch(React, 'createElement');
        for (const key of ['jsx', 'jsxs']) watch(React, key);
        const metro = r.B.metro;
        const factories = [r.B._jsx, r.host?._jsx];
        try {
            const found = metro?.findByPropsAll?.('jsx', 'jsxs') || [];
            factories.push(...found, metro?.findByProps?.('jsx', 'jsxs'));
        } catch { /* finder shape differs between Snow builds */ }
        for (const factory of factories) {
            watch(factory, 'jsx');
            watch(factory, 'jsxs');
        }
        r.status.profileButton = patched === false ? 'unavailable' : (r.status.profileButton === 'replaced' ? 'replaced' : 'patched');
    } };
}
NightyTab.defaults = { url: '', scriptUtils: false, nightyPrefix: '.', iconType: 'blue', customIconUrl: '', showNightyButton: true };
