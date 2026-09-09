import { ui } from '../runtime.js';
export const MAX_BYTES = 256 * 1024;
export function previewable(a) { return !!a && /\.(txt|md|json|js|jsx|ts|tsx|py|css|html|xml|yml|yaml|csv|log|ini|sh|c|cpp|h|java|rs|go)$/i.test(a.filename || a.name || '') && Number(a.size) <= MAX_BYTES && Number(a.size) >= 0; }
export function attachmentUrl(value) { const u = new URL(value); if (u.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(u.hostname) || !u.pathname.startsWith('/attachments/') || u.username || u.password) throw new Error('Only Discord attachment URLs are supported'); return u.href; }
export default function PreviewFile(r) {
    const { h, React, RN } = r, { Page, Text, Button } = ui(r), cache = new Map(), Gate = React.createContext(false);
    async function load(a) {
        if (!previewable(a)) throw new Error('Unsupported file or file exceeds 256 KB');
        const url = attachmentUrl(a.url || a.proxy_url || a.proxyUrl); if (cache.has(url)) return cache.get(url);
        const result = await r.request(url, { headers: { Range: `bytes=0-${MAX_BYTES}` } }, 15000, MAX_BYTES);
        if (Number(result.response.headers?.get('content-length')) > MAX_BYTES || result.text.length > MAX_BYTES) throw new Error('File exceeds the 256 KB preview limit');
        if (result.text.includes('\u0000')) throw new Error('Binary files cannot be previewed');
        cache.set(url, result.text); if (cache.size > 16) cache.delete(cache.keys().next().value); return result.text;
    }
    function Full({ a, text, close }) { return h(Page, { title: a.filename || a.name, close }, h(Text, { muted: true }, `${text.split('\n').length} lines · ${a.size} bytes`), h(RN.ScrollView, { horizontal: true, style: { maxHeight: 500 } }, h(Text, { selectable: true, style: { fontFamily: RN.Platform?.OS === 'ios' ? 'Menlo' : 'monospace' } }, text)), h(Button, { text: 'Copy text', onPress: () => r.copy(text) }), h(Button, { text: 'Open original', variant: 'secondary', onPress: () => RN.Linking.openURL(attachmentUrl(a.url)).catch(e => r.error('Open file', e)) })); }
    function Card({ original, a }) {
        const nested = React.useContext(Gate), [text, setText] = React.useState(null), [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false), mounted = React.useRef(true);
        React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
        function fetchPreview() { if (busy) return; setBusy(true); setError(''); load(a).then(t => mounted.current && setText(t)).catch(e => mounted.current && setError(e.message)).finally(() => mounted.current && setBusy(false)); }
        if (nested) return original;
        return h(Gate.Provider, { value: true }, h(RN.View, { style: { gap: 8, paddingVertical: 6 } }, original,
            text === null ? h(Button, { text: busy ? 'Loading preview…' : error ? 'Retry preview' : 'Preview file', variant: 'secondary', disabled: busy, onPress: fetchPreview }) : h(RN.View, { style: { padding: 12, gap: 8, borderWidth: 1, borderColor: '#80808060', borderRadius: 8 } }, h(Text, { selectable: true, numberOfLines: 8, style: { fontFamily: RN.Platform?.OS === 'ios' ? 'Menlo' : 'monospace' } }, text.split('\n').slice(0, 8).join('\n').slice(0, 2000)), h(Button, { text: 'Expand file', variant: 'secondary', onPress: () => { try { r.open('file', Full, { a, text }); } catch (e) { r.error('Preview file', e); } } })), error ? h(Text, null, error) : null));
    }
    return { start() {
        r.hook(['MessageAttachment', 'Attachment', 'FileAttachment', 'MessageFileAttachment'], element => { const a = element?.props?.attachment; if (previewable(a)) return h(Card, { original: element, a }); });
        r.command({ name:'previewfile', description:'Preview a small Discord text attachment locally', options:[{name:'url',description:'Discord attachment URL',type:3,required:true}], async execute(options) {
            const url = attachmentUrl(String(options.find(o=>o.name==='url')?.value || ''));
            const a = {url,filename:decodeURIComponent(new URL(url).pathname.split('/').pop()),size:0};
            const text = await load(a); a.size = typeof TextEncoder === 'function' ? new TextEncoder().encode(text).length : text.length;
            r.open('file',Full,{a,text});
        } });
    }, stop() { cache.clear(); }, Settings() { return h(Page, { title: 'PreviewFile' }, h(Text, null, 'Text attachments keep their download card and gain an expandable text preview. Tap to load; limit 256 KB. If this build uses native-only attachment rows, use /previewfile with the attachment URL.')); }, load };
}
