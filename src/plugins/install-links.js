import { ui } from '../runtime.js';
import { addUrlHandler } from '../url-hub.js';

export function snowInstallLink(pluginUrl) {
    return 'snow://snow?id=-1&command=install-plugin&params=' + encodeURIComponent(pluginUrl);
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
            const url = sanitizePluginUrl(param || parsed.searchParams.get('params'));
            return url ? { kind: 'plugin', source: protocol, url, raw: trimmed } : null;
        }
        if (path === 'install' || host === 'install-plugin' || host === 'plugin') {
            const url = sanitizePluginUrl(param);
            return url ? { kind: 'plugin', source: protocol, url, raw: trimmed } : null;
        }
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
            h(Text, null, 'Source: ' + link.source + '://'),
            h(Text, { selectable: true }, link.url),
            h(Text, { muted: true }, status || 'Review the URL, then install. Enmity .js bundles are not Snow plugins; use a spec-3 manifest.json URL.'),
            h(Button, { text: busy ? 'Working…' : 'Install', disabled: busy, onPress: install }),
            h(Button, { text: 'Copy HTTPS URL', variant: 'secondary', onPress: () => r.copy(link.url) }),
            h(Button, { text: 'Copy snow:// link', variant: 'secondary', onPress: () => r.copy(snowInstallLink(link.url)) }));
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
        openPrompt(link).catch(error => r.error('Install link', error));
        return true;
    }
    function Settings() {
        const [draft, setDraft] = React.useState('');
        r.useRefresh();
        return h(Page, { title: 'Install Links' },
            h(Toggle, { setting: 'handleEnmity', label: 'Also handle enmity:// install-plugin links' }),
            h(Text, { muted: true }, 'Snow equivalent of Enmity’s install URL:'),
            h(Text, { selectable: true }, 'snow://snow?id=-1&command=install-plugin&params=https://example.com/plugin/manifest.json'),
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
            } }),
            h(Text, { muted: true }, 'A plugin cannot register the OS snow:// scheme. Taps inside Discord are intercepted. Opening snow:// from Safari only works if the Snow app itself registered that scheme. Documented bunny.plugin.install throws; this plugin tries any runtime installer it can find, then falls back to copy + Plugins → Install from URL.'));
    }
    return {
        start() {
            addUrlHandler(r, 200, url => {
                const link = parseInstallLink(url);
                if (!link) return false;
                if (link.source === 'enmity' && !r.store.handleEnmity) return false;
                handle(url);
                return true;
            });
            const linking = r.RN.Linking;
            if (linking?.canOpenURL) {
                r.patch('instead', linking, 'canOpenURL', (args, next) => {
                    const url = String(args[0] || '');
                    if (/^(snow|enmity):/i.test(url)) return Promise.resolve(true);
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
                description: 'Build a snow:// install-plugin link',
                options: [{ name: 'url', description: 'HTTPS plugin URL', type: 3, required: true }],
                execute(args) {
                    const url = sanitizePluginUrl(args.find(a => a.name === 'url')?.value);
                    if (!url) { r.toast('Need an https plugin URL'); return; }
                    return { content: snowInstallLink(url) };
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
InstallLinks.defaults = { handleEnmity: true };
