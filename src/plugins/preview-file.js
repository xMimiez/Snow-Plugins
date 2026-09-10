import { ui } from '../runtime.js';

export const MAX_BYTES = 256 * 1024;
const HOSTS = ['cdn.discordapp.com', 'media.discordapp.net', 'cdn.discord.com', 'media.discord.com'];
const TEXT = /\.(txt|md|json|js|jsx|ts|tsx|py|css|html|xml|yml|yaml|csv|log|ini|sh|c|cpp|h|java|rs|go)$/i;

export function previewable(a) {
    if (!a || a.failed || a.error || a.state === 'FAILED' || a.status === 'FAILED' || a.uploadFailed) return false;
    const name = a.filename || a.name || '';
    const type = a.content_type || a.contentType || '';
    const url = a.url || a.proxy_url || a.proxyUrl;
    if (!url || typeof url !== 'string') return false;
    return (TEXT.test(name) || /^text\//i.test(type) || type === 'application/json') && Number(a.size || 0) <= MAX_BYTES;
}

export function attachmentUrl(value) {
    const u = new URL(value);
    if (u.protocol !== 'https:' || !HOSTS.includes(u.hostname) || !u.pathname.includes('/attachments/') || u.username || u.password) {
        throw new Error('Only Discord attachment URLs are supported');
    }
    return u.href;
}

function findInReactTree(node, filter) {
    if (!node) return undefined;
    if (filter(node)) return node;
    const kids = Array.isArray(node) ? node : node.props?.children;
    const arr = Array.isArray(kids) ? kids : kids != null ? [kids] : [];
    for (const child of arr) {
        const found = findInReactTree(child, filter);
        if (found) return found;
    }
}

export default function PreviewFile(r) {
    const { h, React, RN, D } = r, { Page, Text, Button } = ui(r), cache = new Map();
    async function load(a) {
        const url = attachmentUrl(a.url || a.proxy_url || a.proxyUrl);
        if (cache.has(url)) return cache.get(url);
        const result = await r.request(url, { headers: { Range: `bytes=0-${MAX_BYTES}` } }, 15000, MAX_BYTES);
        if (result.text.includes('\u0000')) throw new Error('Binary files cannot be previewed');
        cache.set(url, result.text);
        return result.text;
    }
    function Viewer({ a, text, close }) {
        const shown = String(text).split('\n').slice(0, 100).join('\n');
        const total = String(text).split('\n').length;
        return h(Page, { title: a.filename || 'View file', close },
            h(RN.ScrollView, { style: { flex: 1 } },
                h(Button, { text: 'Copy file text', variant: 'secondary', onPress: () => r.copy(shown) }),
                h(Text, { muted: true }, `Showing ${Math.min(100, total)} of ${total} lines`),
                h(RN.View, { style: { margin: 8, padding: 12, borderRadius: 8, backgroundColor: '#00000040' } },
                    h(Text, { selectable: true, style: { fontFamily: RN.Platform?.OS === 'ios' ? 'Menlo' : 'monospace' } }, shown))));
    }
    async function openViewer(file) {
        const ActionSheet = r.find('openLazy', 'hideActionSheet');
        try { ActionSheet?.hideActionSheet?.(); } catch {}
        const text = await load(file);
        const Navigation = r.find('push', 'pop');
        const Navigator = r.byName('Navigator') || r.find('Navigator')?.Navigator;
        const closeBtn = r.find('getRenderCloseButton')?.getRenderCloseButton || r.find('getHeaderCloseButton')?.getHeaderCloseButton;
        if (Navigation?.push && Navigator) {
            Navigation.push(() => h(Navigator, {
                initialRouteName: 'ViewFile',
                goBackOnBackPress: true,
                screens: {
                    ViewFile: {
                        title: file.filename || 'View file',
                        headerLeft: closeBtn?.(() => Navigation.pop()),
                        render: () => h(Viewer, { a: file, text, close: () => Navigation.pop() }),
                    },
                },
            }));
            return;
        }
        r.open('file', Viewer, { a: file, text });
    }
    function addRow(buttons, file) {
        if (!buttons || buttons.some(row => row?.props?.label === 'View file')) return;
        const ActionSheetRow = r.find('ActionSheetRow')?.ActionSheetRow || D.TableRow;
        if (!ActionSheetRow) return;
        const iconSource = r.B?.assets?.findAssetId?.('FileIcon') || r.B?.assets?.getAssetIDByName?.('FileIcon');
        const row = h(ActionSheetRow, {
            label: 'View file',
            icon: ActionSheetRow.Icon && iconSource ? h(ActionSheetRow.Icon, { source: iconSource }) : undefined,
            onPress: () => { openViewer(file).catch(e => r.error('View file', e)); },
        });
        const rawAt = buttons.findIndex(child => /view\s*raw/i.test(String(child?.props?.label || '')));
        if (rawAt >= 0) buttons.splice(rawAt + 1, 0, row);
        else buttons.push(row);
    }
    return {
        start() {
            const ActionSheet = r.find('openLazy', 'hideActionSheet');
            if (!ActionSheet?.openLazy) return;
            r.patch('before', ActionSheet, 'openLazy', args => {
                const [component, key, data] = args;
                const message = data?.message;
                const file = (message?.attachments || []).find(previewable);
                if (key !== 'MessageLongPressActionSheet' || !file || typeof component?.then !== 'function') return;
                component.then(instance => {
                    const unpatch = r.B.patcher.after('default', instance, (_args, tree) => {
                        try { React.useEffect(() => () => unpatch?.(), []); } catch {}
                        const buttons = findInReactTree(tree, node => Array.isArray(node) && node.some(child => child?.type?.name === 'ButtonRow' || child?.type?.name === 'ActionSheetRow' || child?.props?.label));
                        addRow(buttons, file);
                    });
                });
            });
        },
        stop() { cache.clear(); },
        Settings() { return h(Page, { title: 'PreviewFile' }, h(Text, null, 'Hold a message with a text attachment. View file appears under View Raw and opens a raw-style window with up to 100 lines.')); },
        load,
    };
}
