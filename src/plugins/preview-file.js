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
        return h(Page, { title: a.filename || 'View file', close },
            h(RN.ScrollView, { style: { flex: 1 } },
                h(Button, { text: 'Copy file text', variant: 'secondary', onPress: () => r.copy(shown) }),
                h(Text, { muted: true }, `Showing ${Math.min(100, total)} of ${total} lines`),
                h(RN.View, { style: { margin: 8, padding: 12, borderRadius: 8, backgroundColor: '#00000040' } },
                    h(Text, { selectable: true, style: { fontFamily: RN.Platform?.OS === 'ios' ? 'Menlo' : 'monospace' } }, shown))));
    }
    async function openViewer(file) {
        try { B.ui.sheets.hideSheet?.(); } catch {}
        const text = await load(file);
        r.open('file', Viewer, { a: file, text });
    }
    function viewRow(file) {
        const Row = D.ActionSheetRow || D.TableRow || C.TableRow;
        const icon = D.TableRow?.Icon && C.RowIcon ? h(C.RowIcon, { name: 'FileIcon' }) : undefined;
        if (!Row) return null;
        return h(Row, { label: 'View file', icon, onPress: () => { openViewer(file).catch(e => r.error('View file', e)); } });
    }
    function insertRow(tree, file) {
        if (!tree || typeof tree !== 'object' || !file) return tree;
        const kids = React.Children.toArray(tree.props?.children);
        if (!kids.length) return tree;
        if (kids.some(child => child?.props?.label === 'View file')) return tree;
        const rawAt = kids.findIndex(child => /view\s*raw/i.test(String(child?.props?.label || '')));
        const hasRows = rawAt >= 0 || kids.some(child => child?.props?.label);
        if (hasRows) {
            const row = viewRow(file);
            const next = rawAt >= 0 ? [...kids.slice(0, rawAt + 1), row, ...kids.slice(rawAt + 1)] : [...kids, row];
            return React.cloneElement(tree, { children: next });
        }
        let changed = false;
        const mapped = kids.map(child => {
            const out = insertRow(child, file);
            if (out !== child) changed = true;
            return out;
        });
        return changed ? React.cloneElement(tree, { children: mapped }) : tree;
    }
    return {
        start() {
            r.hook(['MessageLongPressActionSheet'], (element) => {
                const Component = element.type;
                function Sheet(props) {
                    let tree;
                    try { tree = typeof Component === 'function' && !Component.prototype?.render ? Component(props) : h(Component, props); }
                    catch { tree = h(Component, props); }
                    const file = (props.message?.attachments || []).find(previewable);
                    return file ? insertRow(tree, file) || tree : tree;
                }
                return h(Sheet, element.props);
            });
        },
        stop() { cache.clear(); },
        Settings() { return h(Page, { title: 'PreviewFile' }, h(Text, null, 'Hold a message with a text file. View file is added under View Raw on Snow’s MessageLongPressActionSheet via jsx.onJsxCreate. Opens a window with up to 100 lines.')); },
        load,
    };
}
