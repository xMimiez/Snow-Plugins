import { ui } from '../runtime.js';
import { addUrlHandler } from '../url-hub.js';

const SCHEME_RE = /snow:\/\/[^\s<>\]]+/gi;
const ZWSP = '\u200B';

export function stripFormatChars(value) {
    return String(value || '').replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '');
}

export function hideInnerHttps(value) {
    return String(value).replace(/https:\/\//gi, 'https:' + ZWSP + '//');
}

export function snowInstallLink(pluginUrl) {
    const url = sanitizePluginUrl(pluginUrl) || pluginUrl;
    const params = String(url).replace(/&/g, '%26').replace(/#/g, '%23');
    return hideInnerHttps('snow://snow?id=-1&command=install-plugin&params=' + params);
}

export function parseInstallLink(value) {
    if (!value || typeof value !== 'string') return null;
    const trimmed = stripFormatChars(value.trim());
    let parsed;
    try { parsed = new URL(trimmed); } catch { return null; }
    if (parsed.protocol.replace(':', '').toLowerCase() !== 'snow') return null;
    const host = (parsed.hostname || parsed.host || '').toLowerCase();
    const path = (parsed.pathname || '').replace(/^\//, '');
    const command = (parsed.searchParams.get('command') || path || '').toLowerCase();
    const rawQuery = trimmed.split('?')[1] || '';
    const paramsMatch = rawQuery.match(/(?:^|&)params=([^&]*)/);
    const param = (paramsMatch ? paramsMatch[1] : '') || parsed.searchParams.get('params') || parsed.searchParams.get('url') || parsed.searchParams.get('plugin') || '';
    if (command === 'install-plugin' || command === 'installplugin' || path === 'install-plugin' || path === 'plugin' || path === 'install' || host === 'install-plugin' || host === 'plugin') {
        const url = sanitizePluginUrl(param);
        return url ? { kind: 'plugin', source: 'snow', url, raw: trimmed } : null;
    }
    return null;
}

export function sanitizePluginUrl(value) {
    if (!value) return null;
    let text = stripFormatChars(String(value).trim());
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

export function manifestUrl(url) {
    const href = sanitizePluginUrl(url) || url;
    if (!href) return href;
    if (/\/$/.test(href)) return href + 'manifest.json';
    return href;
}

function snowLinkParts(text) {
    if (typeof text !== 'string' || !text.includes('snow://')) return null;
    const parts = [];
    let last = 0;
    for (const match of text.matchAll(SCHEME_RE)) {
        if (!parseInstallLink(match[0])) continue;
        if (match.index > last) parts.push({ type: 'text', content: text.slice(last, match.index) });
        const raw = stripFormatChars(match[0]);
        parts.push({
            type: 'link',
            target: raw,
            url: raw,
            content: [{ type: 'text', content: hideInnerHttps(raw) }],
        });
        last = match.index + match[0].length;
    }
    if (!parts.length) return null;
    if (last < text.length) parts.push({ type: 'text', content: text.slice(last) });
    return parts;
}

function rewriteNode(node) {
    if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
            if (typeof node[i] === 'string') {
                const parts = snowLinkParts(node[i]);
                if (parts) {
                    node.splice(i, 1, ...parts);
                    i += parts.length - 1;
                }
            } else rewriteNode(node[i]);
        }
        return;
    }
    if (!node || typeof node !== 'object') return;
    if (typeof node.content === 'string') {
        const parts = snowLinkParts(node.content);
        if (parts) node.content = parts;
    } else if (Array.isArray(node.content) || (node.content && typeof node.content === 'object')) rewriteNode(node.content);
    if (typeof node.text === 'string') {
        const parts = snowLinkParts(node.text);
        if (parts) node.content = parts;
    }
    for (const value of Object.values(node)) {
        if (value && typeof value === 'object' && value !== node.content) rewriteNode(value);
    }
}

export function findSnowInstallApi(r) {
    const names = ['previewExternalPlugin', 'installExternalPluginCandidate', 'enableExternalPlugin'];
    const bags = [];
    const B = r.B || {};
    const snow = (typeof globalThis !== 'undefined' && globalThis.snow) || r.host || {};
    bags.push(
        B, B.plugins, B.plugin, B.managers?.plugins, B.pluginManager, B.api, B.api?.plugins, B.api?.native,
        snow, snow.plugins, snow.api, snow.api?.plugins, snow.api?.native, snow.runtime, snow.runtime?.plugins,
        r.find('previewExternalPlugin', 'installExternalPluginCandidate', 'enableExternalPlugin'),
        r.find('previewExternalPlugin', 'installExternalPluginCandidate'),
        r.find('previewExternalPlugin'),
        r.find('installExternalPluginCandidate'),
        r.find('enableExternalPlugin'),
    );
    try { if (typeof r.metro?.find === 'function') bags.push(r.metro.find(mod => mod && names.every(name => typeof mod[name] === 'function'))); } catch {}
    const api = {};
    for (const bag of bags) {
        if (!bag) continue;
        for (const name of names) {
            if (!api[name] && typeof bag[name] === 'function') api[name] = bag[name].bind(bag);
        }
    }
    if (names.some(name => typeof api[name] !== 'function')) return null;
    return api;
}

export async function installExternalPlugin(r, manifest, candidate) {
    const api = findSnowInstallApi(r);
    if (!api) throw new Error('Snow install API not found (previewExternalPlugin / installExternalPluginCandidate / enableExternalPlugin)');
    const url = manifestUrl(manifest);
    const preview = candidate || await api.previewExternalPlugin(url);
    const installed = await api.installExternalPluginCandidate(preview);
    const runtimeId = installed?.runtimeId ?? installed?.id ?? preview?.runtimeId;
    if (runtimeId == null) throw new Error('Install succeeded but no runtimeId was returned');
    await api.enableExternalPlugin(runtimeId);
    return { preview, installed, runtimeId };
}

function candidateLabel(candidate) {
    if (!candidate || typeof candidate !== 'object') return '';
    const display = candidate.display || candidate.manifest?.display || candidate.manifest || candidate;
    const name = display.name || candidate.name || candidate.id || '';
    const version = display.version || candidate.version || candidate.manifest?.version || '';
    const description = display.description || candidate.description || '';
    return [name && version ? `${name} ${version}` : name, description].filter(Boolean).join('\n');
}

function expandUrlRegex(value) {
    if (!(value instanceof RegExp) || !/https\?:/.test(value.source) || /snow\?:/.test(value.source)) return value;
    return new RegExp(value.source.replace(/https\?:/g, '(?:https?|snow):'), value.flags);
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

export default function InstallLinks(r) {
    const { h, React } = r, { Page, Text, Button, Input } = ui(r);
    let close;
    function Prompt({ link, info, candidate, close: dismiss }) {
        const [busy, setBusy] = React.useState(false);
        const [status, setStatus] = React.useState(info || '');
        async function install() {
            if (busy) return;
            setBusy(true);
            try {
                const result = await installExternalPlugin(r, link.url, candidate);
                r.toast('Installed and enabled ' + (result.runtimeId || 'plugin'));
                setStatus('Installed and enabled as ' + result.runtimeId + '.');
            } catch (error) {
                r.copy(snowInstallLink(link.url));
                setStatus((error?.message || String(error)) + '\nCopied the snow:// install link.');
            } finally { setBusy(false); }
        }
        return h(Page, { title: 'Install Snow plugin', close: dismiss },
            h(Text, { selectable: true }, snowInstallLink(link.url)),
            h(Text, { muted: true }, status || 'Review this plugin, then install.'),
            h(Button, { text: busy ? 'Working…' : 'Install', disabled: busy, onPress: install }),
            h(Button, { text: 'Copy snow:// link', variant: 'secondary', onPress: () => r.copy(snowInstallLink(link.url)) }));
    }
    async function openPrompt(link) {
        const url = manifestUrl(link.url);
        const resolved = { ...link, url };
        let info = '';
        let candidate;
        const api = findSnowInstallApi(r);
        if (api) {
            try {
                candidate = await api.previewExternalPlugin(url);
                info = candidateLabel(candidate) || 'Snow previewed this plugin.';
            } catch (error) {
                info = 'previewExternalPlugin failed: ' + (error?.message || error);
            }
        } else {
            info = 'Could not find previewExternalPlugin / installExternalPluginCandidate / enableExternalPlugin on this Snow build.';
        }
        close?.();
        close = r.open('install', Prompt, { link: resolved, info, candidate });
    }
    function handle(url) {
        const link = parseInstallLink(url);
        if (!link) return false;
        openPrompt(link).catch(error => r.error('Install link', error));
        return true;
    }
    function Settings() {
        const [draft, setDraft] = React.useState('');
        r.useRefresh();
        const example = snowInstallLink('https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/Decor/manifest.json');
        return h(Page, { title: 'Install Links' },
            h(Text, { muted: true }, 'Send a snow:// install-plugin link. Discord does not autolink custom schemes, so this plugin marks snow:// as a URL and intercepts taps.'),
            h(Text, { selectable: true }, example),
            h(Input, { label: 'Plugin HTTPS URL', value: draft, onChange: setDraft, autoCapitalize: 'none' }),
            h(Button, { text: 'Preview install', onPress: () => {
                const url = sanitizePluginUrl(draft);
                if (!url) return r.toast('Enter an https plugin URL');
                openPrompt({ kind: 'plugin', source: 'snow', url, raw: snowInstallLink(url) });
            } }),
            h(Button, { text: 'Copy snow:// link', variant: 'secondary', onPress: () => {
                const url = sanitizePluginUrl(draft);
                if (!url) return r.toast('Enter an https plugin URL');
                r.copy(snowInstallLink(url));
            } }));
    }
    return {
        start() {
            addUrlHandler(r, 200, url => {
                if (!parseInstallLink(url)) return false;
                handle(stripFormatChars(url));
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
                    if (/^snow:/i.test(stripFormatChars(String(args[0] || '')))) return Promise.resolve(true);
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
                description: 'Send a snow:// install-plugin link',
                options: [{ name: 'url', description: 'HTTPS plugin manifest URL', type: 3, required: true }],
                execute(args) {
                    const url = sanitizePluginUrl(args.find(a => a.name === 'url')?.value);
                    if (!url) { r.toast('Need an https plugin URL'); return; }
                    return { content: snowInstallLink(url) };
                },
            });
            r.command({
                name: 'installplugin',
                description: 'Review and install a plugin from a snow:// or https URL',
                options: [{ name: 'url', description: 'snow:// or https plugin URL', type: 3, required: true }],
                execute(args) {
                    const raw = String(args.find(a => a.name === 'url')?.value || '');
                    const link = parseInstallLink(raw) || (sanitizePluginUrl(raw) && { kind: 'plugin', source: 'snow', url: sanitizePluginUrl(raw), raw });
                    if (!link) { r.toast('Need a snow:// or https plugin URL'); return; }
                    openPrompt(link);
                },
            });
        },
        stop() { close?.(); },
        Settings,
    };
}
InstallLinks.defaults = {};
