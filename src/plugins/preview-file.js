import { ui } from '../runtime.js';
export const MAX_BYTES = 256 * 1024;
const HOSTS = ['cdn.discordapp.com', 'media.discordapp.net', 'cdn.discord.com', 'media.discord.com'];
const TEXT = /\.(txt|md|json|js|jsx|ts|tsx|py|css|html|xml|yml|yaml|csv|log|ini|sh|c|cpp|h|java|rs|go)$/i;

export function previewable(a) {
    if (!a || a.failed || a.error || a.state === 'FAILED' || a.status === 'FAILED' || a.uploadFailed) return false;
    const name = a.filename || a.name || a.filename_ || '';
    const type = a.content_type || a.contentType || '';
    const url = a.url || a.proxy_url || a.proxyUrl;
    if (!url || typeof url !== 'string') return false;
    const textType = /^text\//i.test(type) || type === 'application/json';
    return (TEXT.test(name) || textType) && Number(a.size || 0) <= MAX_BYTES;
}
export function attachmentUrl(value) {
    const u = new URL(value);
    if (u.protocol !== 'https:' || !HOSTS.includes(u.hostname) || !u.pathname.includes('/attachments/') || u.username || u.password) {
        throw new Error('Only Discord attachment URLs are supported');
    }
    return u.href;
}

export default function PreviewFile(r) {
    const { h, React, RN, D, C } = r, { Page, Text, Button } = ui(r), cache = new Map();
    function filesOn(message) {
        return (message?.attachments || []).filter(previewable);
    }
    async function load(a) {
        if (!previewable(a)) throw new Error('Unsupported file or file exceeds 256 KB');
        const url = attachmentUrl(a.url || a.proxy_url || a.proxyUrl);
        if (cache.has(url)) return cache.get(url);
        const result = await r.request(url, { headers: { Range: `bytes=0-${MAX_BYTES}` } }, 15000, MAX_BYTES);
        if (result.text.includes('\u0000')) throw new Error('Binary files cannot be previewed');
        cache.set(url, result.text);
        if (cache.size > 16) cache.delete(cache.keys().next().value);
        return result.text;
    }
    function Viewer({ a, text, close }) {
        const shown = String(text).split('\n').slice(0, 100).join('\n');
        const lines = String(text).split('\n').length;
        return h(Page, { title: a.filename || a.name || 'File', close },
            h(Text, { muted: true }, `Showing ${Math.min(100, lines)} of ${lines} lines`),
            h(RN.ScrollView, { style: { maxHeight: 520 } },
                h(Text, { selectable: true, style: { fontFamily: RN.Platform?.OS === 'ios' ? 'Menlo' : 'monospace' } }, shown)),
            h(Button, { text: 'Copy text', onPress: () => r.copy(shown) }));
    }
    async function openFile(a) {
        try {
            r.find('hideActionSheet')?.hideActionSheet?.();
            const text = await load(a);
            r.open('file', Viewer, { a, text });
        } catch (error) { r.error('View file', error); }
    }
    function isCopyText(node) {
        if (!node || typeof node !== 'object') return false;
        const p = node.props || {};
        const bits = [p.label, p.text, p.title, p.accessibilityLabel];
        if (typeof p.children === 'string') bits.push(p.children);
        return bits.some(value => /copy\s*text/i.test(String(value || '')));
    }
    function viewRow(file) {
        const Row = D.TableRow || C.TableRow;
        const icon = C.RowIcon ? h(C.RowIcon, { name: 'FileIcon' }) : undefined;
        if (Row) return h(Row, { label: 'View file', icon, onPress: () => openFile(file) });
        return h(RN.Pressable || RN.TouchableOpacity, { onPress: () => openFile(file), style: { padding: 16 } }, h(Text, null, 'View file'));
    }
    function inject(node, file) {
        if (!node || typeof node !== 'object' || !file) return node;
        const kids = node.props?.children;
        const arr = React.Children.toArray(kids);
        if (!arr.length) return node;
        const copyAt = arr.findIndex(isCopyText);
        if (copyAt >= 0) {
            if (arr.some(child => child?.props?.label === 'View file')) return node;
            const next = [...arr.slice(0, copyAt), viewRow(file), ...arr.slice(copyAt)];
            return React.cloneElement(node, { ...node.props, children: next });
        }
        let changed = false;
        const mapped = arr.map(child => {
            const out = inject(child, file);
            if (out !== child) changed = true;
            return out;
        });
        return changed ? React.cloneElement(node, { ...node.props, children: mapped }) : node;
    }
    function wrapSheet(element) {
        const Inner = element.type;
        const message = element.props?.message;
        const file = filesOn(message)[0];
        if (!file || element.props?.__mimePreviewSheet) return;
        function Sheet(props) {
            const tree = typeof Inner === 'function' && !(Inner.prototype && Inner.prototype.render)
                ? Inner(props)
                : h(Inner, props);
            return inject(tree, filesOn(props.message)[0] || file) || tree;
        }
        Sheet.displayName = 'MessageLongPressActionSheet';
        return h(Sheet, { ...element.props, __mimePreviewSheet: true });
    }
    return {
        start() {
            r.hook(['MessageLongPressActionSheet', 'MessageActionSheet'], wrapSheet);
            r.command({
                name: 'previewfile',
                description: 'Preview a small Discord text attachment locally',
                options: [{ name: 'url', description: 'Discord attachment URL', type: 3, required: true }],
                async execute(options) {
                    const url = attachmentUrl(String(options.find(o => o.name === 'url')?.value || ''));
                    const a = { url, filename: decodeURIComponent(new URL(url).pathname.split('/').pop()), size: 0 };
                    await openFile(a);
                },
            });
        },
        stop() { cache.clear(); },
        Settings() { return h(Page, { title: 'PreviewFile' }, h(Text, null, 'Hold a message with a text file and choose View file (above Copy text). Shows up to 100 lines.')); },
        load,
    };
}
