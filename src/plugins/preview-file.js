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
    const { h, React, RN } = r, { Page, Text, Button } = ui(r), cache = new Map(), Gate = React.createContext(false);
    function attachmentFrom(props) {
        if (!props) return null;
        return props.attachment || props.file || props.upload || props.item || (Array.isArray(props.attachments) ? props.attachments[0] : null);
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
    function Full({ a, text, close }) {
        return h(Page, { title: a.filename || a.name, close },
            h(Text, { muted: true }, `${text.split('\n').length} lines · ${a.size || text.length} bytes`),
            h(RN.ScrollView, { horizontal: true, style: { maxHeight: 500 } },
                h(Text, { selectable: true, style: { fontFamily: RN.Platform?.OS === 'ios' ? 'Menlo' : 'monospace' } }, text)),
            h(Button, { text: 'Copy text', onPress: () => r.copy(text) }));
    }
    function Card({ original, a }) {
        const nested = React.useContext(Gate), [text, setText] = React.useState(null), [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false), mounted = React.useRef(true);
        React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
        React.useEffect(() => {
            if (nested || text != null || busy) return;
            setBusy(true);
            load(a).then(t => mounted.current && setText(t)).catch(e => mounted.current && setError(e.message)).finally(() => mounted.current && setBusy(false));
        }, []);
        if (nested) return original;
        const preview = text == null
            ? h(Text, { muted: true }, busy ? 'Loading preview…' : (error || 'No preview'))
            : h(RN.View, { style: { padding: 12, gap: 8, borderWidth: 1, borderColor: '#80808060', borderRadius: 8, marginBottom: 8 } },
                h(Text, { selectable: true, numberOfLines: 12, style: { fontFamily: RN.Platform?.OS === 'ios' ? 'Menlo' : 'monospace' } }, text.split('\n').slice(0, 12).join('\n').slice(0, 4000)),
                h(Button, { text: 'Expand file', variant: 'secondary', onPress: () => { try { r.open('file', Full, { a, text }); } catch (e) { r.error('Preview file', e); } } }));
        return h(Gate.Provider, { value: true }, h(RN.View, { style: { gap: 8, paddingVertical: 6 } }, preview, original, error && text == null ? h(Button, { text: 'Retry preview', variant: 'secondary', onPress: () => { setError(''); setBusy(true); load(a).then(t => setText(t)).catch(e => setError(e.message)).finally(() => setBusy(false)); } }) : null));
    }
    function wrap(element) {
        try {
            const a = attachmentFrom(element?.props);
            if (previewable(a) && !element.props?.__mimePreview) return h(Card, { original: r.React.cloneElement(element, { __mimePreview: true }), a });
        } catch { return; }
    }
    return {
        start() {
            r.hook(['MessageAttachment', 'Attachment', 'FileAttachment', 'MessageFileAttachment', 'MediaAttachment', 'AttachmentCard', 'MessageAccessories', 'File', 'DefaultAttachment', 'AttachmentContent'], wrap);
            r.patch('after', r.React, 'createElement', (args, result) => {
                if (!r.active || !result?.props || result.props.__mimePreview) return;
                const a = attachmentFrom(args[1]) || attachmentFrom(result.props);
                if (previewable(a)) return wrap(result) ?? result;
            });
            r.command({
                name: 'previewfile',
                description: 'Preview a small Discord text attachment locally',
                options: [{ name: 'url', description: 'Discord attachment URL', type: 3, required: true }],
                async execute(options) {
                    const url = attachmentUrl(String(options.find(o => o.name === 'url')?.value || ''));
                    const a = { url, filename: decodeURIComponent(new URL(url).pathname.split('/').pop()), size: 0 };
                    const text = await load(a);
                    a.size = text.length;
                    r.open('file', Full, { a, text });
                },
            });
        },
        stop() { cache.clear(); },
        Settings() { return h(Page, { title: 'PreviewFile' }, h(Text, null, 'Text attachments show a preview above the download card. Limit 256 KB.')); },
        load,
    };
}
