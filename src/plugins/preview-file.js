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

export default function PreviewFile(r) {
    const { h, React, RN, D, C, B } = r, { Page, Text, Button } = ui(r), cache = new Map();
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
        const Codeblock = C.Codeblock;
        return h(Page, { title: a.filename || 'View file', close },
            h(RN.ScrollView, { style: { flex: 1 } },
                h(Button, { text: 'Copy file text', variant: 'secondary', onPress: () => r.copy(shown) }),
                h(Text, { muted: true }, `Showing ${Math.min(100, total)} of ${total} lines`),
                Codeblock
                    ? h(Codeblock, { selectable: true, style: { margin: 8 } }, shown)
                    : h(Text, { selectable: true, style: { fontFamily: RN.Platform?.OS === 'ios' ? 'Menlo' : 'monospace', margin: 8 } }, shown)));
    }
    async function openViewer(file) {
        try { r.find('hideActionSheet')?.hideActionSheet?.(); } catch {}
        const text = await load(file);
        r.open('file', Viewer, { a: file, text });
    }
    function viewRow(file) {
        const Row = D.ActionSheetRow || D.TableRow;
        if (!Row) return null;
        const icon = C.RowIcon ? h(C.RowIcon, { name: 'FileIcon' }) : undefined;
        return h(Row, { label: 'View file', icon, onPress: () => { openViewer(file).catch(e => r.error('View file', e)); } });
    }
    function inject(tree, file) {
        if (!tree || !file) return tree;
        const find = B.utils?.findInReactTree;
        const buttons = find
            ? find(tree, node => Array.isArray(node) && node.some(child => child?.props?.label))
            : null;
        if (!buttons || buttons.some(row => row?.props?.label === 'View file')) return tree;
        const row = viewRow(file);
        if (!row) return tree;
        const rawAt = buttons.findIndex(child => /view\s*raw/i.test(String(child?.props?.label || '')));
        if (rawAt >= 0) buttons.splice(rawAt + 1, 0, row);
        else buttons.push(row);
        return tree;
    }
    function patchSheetModule(mod) {
        if (!mod) return;
        const key = typeof mod.default === 'function' ? 'default' : typeof mod.type === 'function' ? 'type' : null;
        if (!key) return;
        r.patch('after', mod, key, (args, tree) => {
            const message = args?.[0]?.message;
            const file = (message?.attachments || []).find(previewable);
            return file ? inject(tree, file) : tree;
        });
    }
    return {
        start() {},
        stop() { cache.clear(); },
        Settings() { return h(Page, { title: 'PreviewFile' }, h(Text, null, 'Unavailable until Snow is open source.')); },
        load,
    };
}
