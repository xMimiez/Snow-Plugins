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

function isStubFn(fn) {
    if (typeof fn !== 'function') return true;
    try {
        const src = Function.prototype.toString.call(fn);
        if (/Compatibility API|unavailable in Snow|native\.previewExternalPlugin/i.test(src)) return true;
    } catch {}
    return false;
}

function isUnavailableError(error) {
    return /Compatibility API|unavailable in Snow/i.test(error?.message || String(error));
}

function liveFn(bag, name) {
    return bag && typeof bag[name] === 'function' && !isStubFn(bag[name]) ? bag[name].bind(bag) : null;
}

function candidateModules(r) {
    const B = r.B || {};
    const snow = (typeof globalThis !== 'undefined' && globalThis.snow) || r.host || {};
    const skip = new Set([B.native, B.api?.native, snow.native, snow.api?.native].filter(Boolean));
    const out = [];
    const add = value => {
        if (!value || typeof value !== 'object' || skip.has(value) || out.includes(value)) return;
        out.push(value);
    };
    add(B.plugins); add(B.managers?.plugins); add(B.pluginManager); add(B.api?.plugins);
    add(snow.plugins); add(snow.api?.plugins); add(snow.runtime); add(snow.runtime?.plugins);
    if (liveFn(snow.api, 'previewExternalPlugin')) add(snow.api);
    if (liveFn(B.api, 'previewExternalPlugin')) add(B.api);
    const metro = r.metro || {};
    for (const finder of ['findByPropsAll', 'findAll']) {
        if (typeof metro[finder] !== 'function') continue;
        try {
            const matches = finder === 'findAll'
                ? metro.findAll(mod => liveFn(mod, 'previewExternalPlugin') && liveFn(mod, 'installExternalPluginCandidate'))
                : metro.findByPropsAll('previewExternalPlugin', 'installExternalPluginCandidate', 'enableExternalPlugin')
                    || metro.findByPropsAll('previewExternalPlugin', 'installExternalPluginCandidate')
                    || metro.findByPropsAll('previewExternalPlugin');
            if (Array.isArray(matches)) matches.forEach(add);
        } catch {}
    }
    add(r.find('previewExternalPlugin', 'installExternalPluginCandidate', 'enableExternalPlugin'));
    add(r.find('previewExternalPlugin', 'installExternalPluginCandidate'));
    add(r.find('promptExternalPluginInstall'));
    add(r.find('openExternalPluginInstall'));
    add(r.find('showExternalPluginInstall'));
    add(r.find('openInstallFromURL'));
    add(r.find('installFromURL', 'previewExternalPlugin'));
    return out.filter(mod => !isStubFn(mod.previewExternalPlugin || (() => {})) || liveFn(mod, 'promptExternalPluginInstall') || liveFn(mod, 'openExternalPluginInstall') || liveFn(mod, 'showExternalPluginInstall'));
}

export function findSnowInstallApi(r) {
    const names = ['previewExternalPlugin', 'installExternalPluginCandidate', 'enableExternalPlugin'];
    for (const bag of candidateModules(r)) {
        if (names.every(name => liveFn(bag, name))) {
            const api = { module: bag };
            for (const name of names) api[name] = liveFn(bag, name);
            return api;
        }
    }
    const api = { module: null };
    for (const bag of candidateModules(r)) {
        for (const name of names) {
            if (!api[name] && liveFn(bag, name)) {
                api[name] = liveFn(bag, name);
                api.module = api.module || bag;
            }
        }
    }
    if (names.some(name => typeof api[name] !== 'function')) return null;
    return api;
}

function installerUiFns(module) {
    if (!module) return [];
    const preferred = [
        'promptExternalPluginInstall', 'promptInstallExternalPlugin',
        'openExternalPluginInstall', 'openExternalPluginInstaller',
        'showExternalPluginInstall', 'showInstallExternalPlugin',
        'presentExternalPluginInstall', 'beginExternalPluginInstall',
        'startExternalPluginInstall', 'reviewExternalPlugin',
        'confirmExternalPluginInstall', 'installExternalPluginFromUrl',
        'installExternalPluginFromURL', 'openInstallFromUrl', 'openInstallFromURL',
        'installFromUrl', 'installFromURL',
    ];
    const found = [];
    const seen = new Set();
    for (const key of preferred) {
        const fn = liveFn(module, key);
        if (fn) { found.push({ key, fn }); seen.add(key); }
    }
    for (const key of Object.keys(module)) {
        if (seen.has(key) || !liveFn(module, key)) continue;
        if (/^(prompt|open|show|present|confirm|begin|start|review)/i.test(key) && /install|externalPlugin|pluginInstall/i.test(key)) {
            found.push({ key, fn: liveFn(module, key) });
        }
    }
    return found;
}

export async function openOfficialInstall(r, manifest) {
    const url = manifestUrl(manifest);
    const api = findSnowInstallApi(r);
    const modules = [api?.module, ...candidateModules(r)].filter(Boolean);
    const callers = [];
    for (const module of modules) {
        for (const item of installerUiFns(module)) {
            if (!callers.some(existing => existing.fn === item.fn)) callers.push(item);
        }
    }
    for (const { key, fn } of callers) {
        try {
            await fn(url);
            return { via: key };
        } catch (error) {
            if (isUnavailableError(error)) continue;
            throw error;
        }
    }
    const Comp = r.byName('ExternalPluginInstallModal') || r.byName('InstallExternalPluginModal')
        || r.byName('PluginInstallConfirmation') || r.byName('InstallPluginAlert')
        || r.byName('ExternalPluginPreview');
    if (Comp && r.api.ui?.openAlert) {
        r.api.ui.openAlert('install-external-plugin', r.h(Comp, { url, manifestUrl: url, sourceUrl: url }));
        return { via: 'openAlert' };
    }
    if (!api) throw new Error('Snow installer was not found. Compatibility native.previewExternalPlugin is a stub and cannot install plugins.');
    const candidate = await api.previewExternalPlugin(url);
    for (const { key, fn } of installerUiFns(api.module)) {
        try {
            await fn(candidate);
            return { via: key, candidate };
        } catch (error) {
            if (isUnavailableError(error)) continue;
            throw error;
        }
    }
    return { via: 'previewExternalPlugin', candidate, needsConfirm: true };
}

export async function installExternalPlugin(r, manifest, candidate) {
    const api = findSnowInstallApi(r);
    if (!api) throw new Error('Snow installer was not found. Compatibility native.previewExternalPlugin is a stub and cannot install plugins.');
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
        try {
            const result = await openOfficialInstall(r, url);
            if (!result.needsConfirm) return;
            close?.();
            close = r.open('install', Prompt, { link: resolved, info: candidateLabel(result.candidate), candidate: result.candidate });
        } catch (error) {
            r.copy(url);
            r.toast(error?.message || String(error));
        }
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
