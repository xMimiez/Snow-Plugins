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

function controlText(node) {
    const props = node?.props;
    if (!props) return '';
    return [props.accessibilityLabel, props.accessibilityHint, props['aria-label'], props.testID, props.nativeID]
        .filter(value => typeof value === 'string').join(' ');
}
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
function isIconControl(node) {
    const props = node?.props;
    if (!props || typeof props.onPress !== 'function') return false;
    if (typeof props.label === 'string' && props.label && !props.accessibilityLabel) return false;
    return controlText(node).length <= 48;
}
export function isSettingsControl(node) {
    if (!isIconControl(node)) return false;
    const text = `${controlText(node)} ${iconHint(node)}`;
    return /\bsettings?\b|SettingsIcon|GearIcon|CogIcon/i.test(text) && !/notification/i.test(text);
}
export function isQuestOrShopControl(node) {
    if (!isIconControl(node)) return false;
    const text = `${controlText(node)} ${iconHint(node)}`;
    return /quest|shop|collectible|nitro|QuestIcon|ShopIcon|NitroIcon/i.test(text);
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
// Swaps the Settings icon only when Quests or Shop is in the same short row. Other Settings buttons stay.
export function replaceSettingsSlot(React, element, makeButton) {
    const children = element?.props?.children;
    const list = Array.isArray(children) ? children.filter(Boolean) : null;
    if (!list || list.length < 2 || list.length > 6) return element;
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
            h(Toggle, { setting: 'profileButton', label: 'Profile bar button', subLabel: 'Replaces the Settings button next to Quests and Shop with Nighty. Turn this off to restore Settings, then reopen your profile.' }),
            h(Toggle, { setting: 'scriptUtils', label: 'Script Utils functions', subLabel: 'Download Script replies to an attachment with your prefix followed by dls.' }),
            h(Text, null, 'Nighty prefix (one character)'),
            h(Input, { value: store.nightyPrefix, onChange: v => r.set('nightyPrefix', v), autoCapitalize: 'none', placeholder: '.' }),
            ...['blue', 'grayscale', 'custom'].map(style => h(Button, { key: style, text: `${store.iconType === style ? '✓ ' : ''}${style} icon`, onPress: () => r.set('iconType', style) })),
            store.iconType === 'custom' ? h(Input, { value: store.customIconUrl, placeholder: 'https:// image URL', autoCapitalize: 'none', onChange: v => r.set('customIconUrl', v) }) : null,
            h(Icon), h(Text, { muted: true }, `Settings entry: ${r.status.settingsEntry ? 'registered' : 'unavailable'} · Message menu: ${r.status.messageMenu ? 'registered' : 'unavailable'} · Profile button: ${store.profileButton ? (r.status.profileButton === 'replaced' ? 'replaced Settings' : 'watching') : 'off'}`));
    }
    function ToolbarIcon() {
        const uri = iconUrl();
        return uri ? h(RN.Image, { source: { uri }, resizeMode: 'contain', style: { width: 24, height: 24 }, accessibilityIgnoresInvertColors: true }) : null;
    }
    function openNighty() {
        if (!r.active) return;
        const constants = r.find('SETTING_RENDERER_CONFIG');
        const row = constants?.SETTING_RENDERER_CONFIG?.MIME_NIGHTY;
        if (typeof row?.onPress === 'function') {
            Promise.resolve(row.onPress()).catch(error => { if (r.active) r.error('Open Nighty', error); });
            return;
        }
        try { r.open('nighty', NightyPage, {}, { scrollable: false }); }
        catch (error) { if (r.active) r.error('Open Nighty', error); }
    }
    function nightyControl(sample) {
        return r.React.cloneElement(sample, {
            key: 'mime-nighty-profile-button',
            accessibilityLabel: 'Nighty',
            accessibilityHint: 'Open Nighty',
            testID: 'mime-nighty-profile-button',
            onPress: () => { if (r.active && store.profileButton) openNighty(); },
        }, h(ToolbarIcon));
    }
    function applyToolbar(element) {
        if (!r.active || !store.profileButton || !element) return element;
        const next = replaceSettingsSlot(r.React, element, nightyControl);
        if (next !== element) r.status.profileButton = 'replaced';
        return next;
    }
    function patchRender(parent, key) {
        if (typeof parent?.[key] !== 'function') return false;
        return r.patch('after', parent, key, (_args, result) => {
            const next = applyToolbar(result);
            return next === result ? undefined : next;
        });
    }
    function considerModule(mod) {
        if (!mod || typeof mod !== 'object') return;
        for (const key of Object.keys(mod)) {
            const value = mod[key];
            if (typeof value === 'function' && (TOOLBAR_NAMES.includes(value.displayName) || TOOLBAR_NAMES.includes(value.name))) patchRender(mod, key);
            else if (value && typeof value.render === 'function' && (TOOLBAR_NAMES.includes(value.displayName) || TOOLBAR_NAMES.includes(value.render.name))) patchRender(value, 'render');
        }
    }
    return { Settings, NightyPage, download, start() {
        r.status.settingsEntry = registerSection(r, { name: 'Nighty', items: [{ key: 'MIME_NIGHTY', title: () => 'Nighty', headerShown: false, IconComponent: Icon, render: async () => ({ default: NightyPage }) }] });
        r.status.messageMenu = patchLazySheet(r, (key, props) => key === 'MessageLongPressActionSheet' && canDownload(store, props?.message)
            ? { key: 'mime-nighty-download', label: 'Download Script', icon: h(Icon), onPress: () => download(props.message) } : null);
        r.hook(TOOLBAR_NAMES, element => applyToolbar(element));
        const patched = r.patch('after', React, 'createElement', (_args, result) => {
            const next = applyToolbar(result);
            return next === result ? undefined : next;
        });
        const metro = r.B.metro;
        for (const name of TOOLBAR_NAMES) {
            considerModule(metro?.findByName?.(name, false));
            considerModule(metro?.findByDisplayName?.(name, false));
            considerModule(metro?.findByTypeName?.(name, false));
        }
        try {
            const matches = metro?.findAll?.(mod => {
                const fn = mod?.default || mod?.render || mod;
                const label = fn?.displayName || fn?.name;
                return typeof label === 'string' && TOOLBAR_NAMES.includes(label);
            }) || [];
            for (const mod of matches) considerModule(mod?.default ? mod : { default: mod });
        } catch { /* finder shape differs between Snow builds */ }
        r.status.profileButton = patched === false ? 'unavailable' : (r.status.profileButton === 'replaced' ? 'replaced' : 'patched');
    } };
}
NightyTab.defaults = { url: '', scriptUtils: false, nightyPrefix: '.', iconType: 'blue', customIconUrl: '', profileButton: false };
