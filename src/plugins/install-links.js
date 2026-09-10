import { ui } from '../runtime.js';
import { addUrlHandler } from '../url-hub.js';

const SCHEME_RE = /(?:snow|enmity):\/\/[^\s<>\]]+/gi;

export function snowInstallLink(pluginUrl) {
    return 'snow://snow?id=-1&command=install-plugin&params=' + encodeURIComponent(pluginUrl);
}

export function clickableInstallMessage(pluginUrl) {
    const url = sanitizePluginUrl(pluginUrl);
    if (!url) return null;
    return `[Install Snow plugin](${url})`;
}

export function isManifestUrl(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
        return /\/(manifest|snow\.plugin)\.json$/i.test(parsed.pathname);
    } catch { return false; }
}

export function parseInstallLink(value) {
    if (!value || typeof value !== 'string') return null;
    const trimmed = value.trim();
    let parsed;
    try { parsed = new URL(trimmed); } catch { return null; }
    const protocol = parsed.protocol.replace(':', '').toLowerCase();
    const host = (parsed.hostname || parsed.host || '').toLowerCase();
    const path = (parsed.pathname || '').replace(/^\//, '');
    const command = (parsed.searchParams.get('command') || path || '').toLowerCase();
    const param = parsed.searchParams.get('params') || parsed.searchParams.get('url') || parsed.searchParams.get('plugin') || '';
    if (protocol === 'snow' || protocol === 'enmity') {
        if (command === 'install-plugin' || command === 'installplugin' || path === 'install-plugin' || path === 'plugin') {
            const url = sanitizePluginUrl(param);
            return url ? { kind: 'plugin', source: protocol, url, raw: trimmed } : null;
        }
        if (path === 'install' || host === 'install-plugin' || host === 'plugin') {
            const url = sanitizePluginUrl(param);
            return url ? { kind: 'plugin', source: protocol, url, raw: trimmed } : null;
        }
    }
    if (protocol === 'https') {
        const wrapped = sanitizePluginUrl(param);
        if (command === 'install-plugin' && wrapped) return { kind: 'plugin', source: 'https', url: wrapped, raw: trimmed };
        const https = sanitizePluginUrl(trimmed);
        if (https && isManifestUrl(https)) return { kind: 'plugin', source: 'https', url: https, raw: trimmed };
    }
    return null;
}

export function sanitizePluginUrl(value) {
    if (!value) return null;
    let text = String(value).trim();
    try { text = decodeURIComponent(text); } catch {}
    let url;
    try { url = new URL(text); } catch { return null; }
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (url.hostname === 'github.com' && /\/blob\//.test(url.pathname)) {
        url.hostname = 'raw.githubusercontent.com';
        url.pathname = url.pathname.replace(/\/blob\//, '/');
    }
    if (url.pathname.endsWith('/')) return url.href;
    return url.href;
}

export function rewriteSnowLinks(text) {
    if (typeof text !== 'string' || text.indexOf('://') < 0) return text;
    return text.replace(SCHEME_RE, match => parseInstallLink(match)?.url || match);
}

export function classifyArtifact(text, url) {
    const sample = String(text || '').slice(0, 4000);
    if (/["']spec["']\s*:\s*3/.test(sample) && /["']type["']\s*:\s*["']plugin["']/.test(sample)) return 'snow-manifest';
    if (/schemaVersion["']?\s*:\s*2/.test(sample) && /apiVersion["']?\s*:\s*1/.test(sample)) return 'snow-native-manifest';
    if (/__snowRegisterPlugin/.test(sample) || /\bdefinePlugin\s*\(/.test(sample)) return 'snow-bundle';
    if (/registerPlugin\s*\(/.test(sample) && /enmity/i.test(sample + url)) return 'enmity-plugin';
    if (/\.js(\?|$)/i.test(url) && /module\.exports|export default/.test(sample)) return 'unknown-js';
    if (url.endsWith('manifest.json') || url.endsWith('/')) return 'possible-manifest';
    return 'unknown';
}

function collectInstallers(r, url) {
    const found = [];
    const seen = new Set();
    const add = (label, fn) => {
        if (typeof fn !== 'function' || seen.has(fn)) return;
        seen.add(fn);
        found.push({ label, run: () => fn(url) });
    };
    const B = r.B || {};
    const snow = (typeof globalThis !== 'undefined' && globalThis.snow) || r.host || {};
    const objects = [
        ['plugins', B.plugins],
        ['managers.plugins', B.managers?.plugins],
        ['pluginManager', B.pluginManager],
        ['plugin', B.plugin],
        ['snow.plugins', snow.plugins],
        ['snow.api.plugins', snow.api?.plugins],
        ['snow.runtime.plugins', snow.runtime?.plugins],
        ['metro.installPlugin', r.find('installPlugin', 'uninstallPlugin')],
        ['metro.installFromURL', r.find('installFromURL')],
        ['metro.installPluginFromURL', r.find('installPluginFromURL')],
        ['metro.installExternalPlugin', r.find('installExternalPlugin')],
        ['metro.installBunnyPlugin', r.find('installBunnyPlugin')],
        ['metro.enablePlugin', r.find('installPlugin', 'enablePlugin')],
    ];
    for (const [label, object] of objects) {
        if (!object) continue;
        for (const key of ['installPluginFromURL', 'installFromURL', 'installExternalPlugin', 'installBunnyPlugin', 'installPlugin', 'install', 'fetchPlugin']) {
            if (typeof object[key] === 'function') add(label + '.' + key, object[key].bind(object));
        }
    }
    return found;
}

function expandUrlRegex(value) {
    if (!(value instanceof RegExp) || !/https\?:/.test(value.source) || /snow\|enmity|snow\?:/.test(value.source)) return value;
    return new RegExp(value.source.replace(/https\?:/g, '(?:https?|snow|enmity):'), value.flags);
}

function patchAutolink(r) {
    const modules = [
        r.find('isUrl'), r.find('isLink'), r.find('isWebUrl'),
        r.find('URL_REGEX'), r.find('WEB_URL'), r.find('defaultRules'),
        r.find('parse', 'reactParser'), r.find('parseInline'),
        ...(r.metro.findByPropsAll?.('parse') || []),
    ].filter(Boolean);
    for (const module of modules) {
        if (!module || typeof module !== 'object') continue;
        for (const key of Object.keys(module)) {
            const current = module[key];
            const expanded = expandUrlRegex(current);
            if (expanded !== current) {
                try { module[key] = expanded; } catch {}
            }
        }
    }
}

function rewriteNode(node) {
    if (!node || typeof node !== 'object') return;
    if (typeof node.content === 'string') node.content = rewriteSnowLinks(node.content);
    if (typeof node.text === 'string') node.text = rewriteSnowLinks(node.text);
    if (Array.isArray(node)) for (const item of node) rewriteNode(item);
    else for (const value of Object.values(node)) {
        if (value && typeof value === 'object') rewriteNode(value);
    }
}

export default function InstallLinks(r) {
    const { h, React } = r, { Page, Text, Button, Input, Toggle } = ui(r);
    let close;
    function Prompt({ link, info, close: dismiss }) {
        const [busy, setBusy] = React.useState(false);
        const [status, setStatus] = React.useState(info || '');
        async function install() {
            if (busy) return;
            setBusy(true);
            try {
                const installers = collectInstallers(r, link.url);
                if (!installers.length) {
                    r.copy(link.url);
                    setStatus('Snow’s plugin API does not expose install-from-URL to plugins. The HTTPS URL was copied — open Snow → Plugins → Install from URL and paste it.');
                    return;
                }
                const errors = [];
                for (const installer of installers) {
                    try {
                        await installer.run();
                        r.toast('Install started via ' + installer.label);
                        setStatus('Install started with ' + installer.label + '. Enable the plugin on the Plugins page if it stays disabled.');
                        return;
                    } catch (error) {
                        errors.push(installer.label + ': ' + (error?.message || error));
                    }
                }
                r.copy(link.url);
                setStatus('No working installer method. Copied URL.\n' + errors.slice(0, 6).join('\n'));
            } finally { setBusy(false); }
        }
        return h(Page, { title: 'Install Snow plugin', close: dismiss },
            h(Text, null, 'Source: ' + (link.source || 'https')),
            h(Text, { selectable: true }, link.url),
            h(Text, { muted: true }, status || 'Review the URL, then install. Enmity .js bundles are not Snow plugins; use a spec-3 manifest.json URL.'),
            h(Button, { text: busy ? 'Working…' : 'Install', disabled: busy, onPress: install }),
            h(Button, { text: 'Open original link', variant: 'secondary', onPress: () => {
                dismiss();
                r._openingOriginal = true;
                Promise.resolve(r.RN.Linking.openURL(link.url)).catch(e => r.error('Open link', e)).finally(() => { r._openingOriginal = false; });
            } }),
            h(Button, { text: 'Copy HTTPS URL', variant: 'secondary', onPress: () => r.copy(link.url) }));
    }
    async function openPrompt(link) {
        let info = '';
        try {
            const target = /manifest\.json$/i.test(link.url) || /\/$/.test(link.url)
                ? (/\/$/.test(link.url) ? link.url + 'manifest.json' : link.url)
                : link.url;
            const data = await r.request(target, {}, 8000, 200000);
            const kind = classifyArtifact(data.text, target);
            if (kind === 'enmity-plugin' || kind === 'unknown-js') info = 'This file looks like a standalone JS plugin (often Enmity), not a Snow manifest. Snow installs from a manifest.json URL.';
            else if (kind === 'snow-manifest' || kind === 'snow-native-manifest') info = 'This looks like a Snow plugin manifest.';
            else if (kind === 'snow-bundle') info = 'This looks like a Snow plugin bundle. Prefer the folder or manifest.json URL.';
        } catch (error) {
            info = 'Could not prefetch the file: ' + (error.message || error);
        }
        close?.();
        close = r.open('install', Prompt, { link, info });
    }
    function handle(url) {
        const link = parseInstallLink(url);
        if (!link) return false;
        if (link.source === 'enmity' && !r.store.handleEnmity) return false;
        openPrompt(link).catch(error => r.error('Install link', error));
        return true;
    }
    function Settings() {
        const [draft, setDraft] = React.useState('');
        r.useRefresh();
        return h(Page, { title: 'Install Links' },
            h(Toggle, { setting: 'handleEnmity', label: 'Also handle enmity:// install-plugin links' }),
            h(Toggle, { setting: 'interceptManifests', label: 'Intercept https://…/manifest.json taps' }),
            h(Text, { muted: true }, 'Discord’s native chat only autolinks https. /snowlink now sends a clickable markdown https link. snow:// in already-sent messages is rewritten to the https plugin URL so it can be tapped.'),
            h(Input, { label: 'Plugin HTTPS URL', value: draft, onChange: setDraft, autoCapitalize: 'none' }),
            h(Button, { text: 'Preview install', onPress: () => {
                const url = sanitizePluginUrl(draft);
                if (!url) return r.toast('Enter an https plugin URL');
                openPrompt({ kind: 'plugin', source: 'https', url, raw: url });
            } }),
            h(Button, { text: 'Copy clickable message', variant: 'secondary', onPress: () => {
                const url = sanitizePluginUrl(draft);
                if (!url) return r.toast('Enter an https plugin URL');
                r.copy(clickableInstallMessage(url));
            } }),
            h(Text, { muted: true }, 'Example sent message:\n[Install Snow plugin](https://github.com/xMimiez/Snow-Plugins/raw/refs/heads/main/Decor/manifest.json)'));
    }
    return {
        start() {
            addUrlHandler(r, 200, url => {
                if (r._openingOriginal) return false;
                const link = parseInstallLink(url);
                if (!link) return false;
                if (link.source === 'enmity' && !r.store.handleEnmity) return false;
                if (link.source === 'https' && !r.store.interceptManifests) return false;
                handle(url);
                return true;
            });
            patchAutolink(r);
            r.patchRows(rows => {
                const next = typeof rows === 'string' ? JSON.parse(rows) : JSON.parse(JSON.stringify(rows));
                rewriteNode(next);
                return typeof rows === 'string' ? JSON.stringify(next) : next;
            });
            const linking = r.RN.Linking;
            if (linking?.canOpenURL) {
                r.patch('instead', linking, 'canOpenURL', (args, next) => {
                    const url = String(args[0] || '');
                    if (/^(snow|enmity):/i.test(url) || (r.store.interceptManifests && isManifestUrl(url))) return Promise.resolve(true);
                    return next(...args);
                });
            }
            if (typeof linking?.addEventListener === 'function') {
                const sub = linking.addEventListener('url', event => { if (event?.url) handle(event.url); });
                r.own(() => sub?.remove?.());
            }
            linking?.getInitialURL?.().then(url => { if (url && r.active) handle(url); }).catch(() => {});
            r.command({
                name: 'snowlink',
                description: 'Send a clickable Snow plugin install link',
                options: [{ name: 'url', description: 'HTTPS plugin URL', type: 3, required: true }],
                execute(args) {
                    const url = sanitizePluginUrl(args.find(a => a.name === 'url')?.value);
                    if (!url) { r.toast('Need an https plugin URL'); return; }
                    return { content: clickableInstallMessage(url) };
                },
            });
            r.command({
                name: 'installplugin',
                description: 'Review and install a plugin from an HTTPS or snow:// URL',
                options: [{ name: 'url', description: 'snow:// or https URL', type: 3, required: true }],
                execute(args) {
                    const raw = String(args.find(a => a.name === 'url')?.value || '');
                    const link = parseInstallLink(raw) || (sanitizePluginUrl(raw) && { kind: 'plugin', source: 'https', url: sanitizePluginUrl(raw), raw });
                    if (!link) { r.toast('Need a snow:// or https plugin URL'); return; }
                    openPrompt(link);
                },
            });
        },
        stop() { close?.(); },
        Settings,
    };
}
InstallLinks.defaults = { handleEnmity: true, interceptManifests: true };
