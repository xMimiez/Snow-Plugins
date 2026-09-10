import { ui } from '../runtime.js';

export function normalizeStatus(value) {
    if (!value) return null;
    const status = Array.isArray(value) ? value.find(a => a?.type === 4 || a?.name === 'Custom Status') : value;
    if (!status) return null;
    const emoji = status.emoji || {};
    const text = status.state || status.text || '';
    const id = emoji.id || status.emojiId || status.emoji_id;
    const name = emoji.name || status.emojiName || status.emoji_name || '';
    return text || id || name ? { text, emojiId: id, emojiName: name, animated: !!(emoji.animated || status.emojiAnimated) } : null;
}
export function statusParts(status) {
    const result = [];
    if (status.emojiId) result.push({ id: status.emojiId, name: status.emojiName || 'emoji', animated: status.animated });
    else if (status.emojiName) result.push({ text: status.emojiName + ' ' });
    const pattern = /<(a?):([^:>]+):(\d+)>|<(\d{16,22})>/g;
    let offset = 0;
    for (const match of String(status.text || '').matchAll(pattern)) {
        if (match.index > offset) result.push({ text: status.text.slice(offset, match.index) });
        result.push({ id: match[3] || match[4], name: match[2] || 'emoji', animated: match[1] === 'a' });
        offset = match.index + match[0].length;
    }
    if (offset < (status.text || '').length) result.push({ text: status.text.slice(offset) });
    return result;
}

export default function ReplyToStatus(r) {
    const { h, React, RN, C } = r;
    const { Text, Button, Page, Input } = ui(r);
    let dismiss = null;
    let sending = false;
    function Emoji({ part }) {
        const [failed, fail] = React.useState(false);
        if (failed || !RN.Image) return h(Text, null, ':' + part.name + ':');
        return h(RN.Image, { source: { uri: `https://cdn.discordapp.com/emojis/${part.id}.${part.animated ? 'gif' : 'png'}?size=48&quality=lossless` },
            accessibilityLabel: part.name, style: { width: 22, height: 22 }, onError: () => fail(true) });
    }
    function Quote({ status }) {
        return h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 } },
            statusParts(status).map((part, i) => part.id ? h(Emoji, { key: i, part }) : h(Text, { key: i }, part.text)));
    }
    function Composer({ userId, status, close }) {
        const [draft, setDraft] = React.useState('');
        const [busy, setBusy] = React.useState(false);
        const [error, setError] = React.useState('');
        const mounted = React.useRef(true);
        React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; dismiss = null; }; }, []);
        async function send(body) {
            const text = String(body || '').trim();
            if (!text || sending) return;
            sending = true; setBusy(true); setError('');
            try {
                const channel = (await r.discord('/users/@me/channels', { method: 'POST', body: JSON.stringify({ recipient_id: userId }) })).json();
                const quote = status.text ? `> ${status.text}\n` : '';
                await r.discord(`/channels/${channel.id}/messages`, { method: 'POST', body: JSON.stringify({ content: quote + text }) });
                r.toast('Reply sent');
                if (mounted.current) close();
            } catch (e) { if (mounted.current) setError(e.message); }
            finally { sending = false; if (mounted.current) setBusy(false); }
        }
        return h(Page, { title: 'Reply to status', close },
            h(Quote, { status }),
            h(Input, { value: draft, onChange: setDraft, placeholder: 'Message', multiline: true }),
            error ? h(Text, null, error) : null,
            h(Button, { text: busy ? 'Sending…' : 'Send reply', disabled: busy || !draft.trim(), onPress: () => void send(draft) }));
    }
    function open(userId, status) {
        if (dismiss) return;
        try { dismiss = r.open('composer', Composer, { userId, status }); }
        catch (error) { dismiss = null; r.error('Open reply', error); }
    }
    function wrapHeader(element) {
        const p = element?.props || {};
        if (p.__mimeReplyHeader) return;
        const userId = p.userId || p.user?.id || p.displayProfile?.userId || p.displayProfile?.user?.id;
        if (!userId) return;
        const me = r.byStore('UserStore')?.getCurrentUser?.();
        if (userId === me?.id) return;
        const status = normalizeStatus(p.customStatus || p.activities || r.byStore('PresenceStore')?.getActivities?.(userId)) || { text: '' };
        const IconButton = C.IconButton;
        return h(RN.View, { style: { position: 'relative' } },
            React.cloneElement(element, { __mimeReplyHeader: true }),
            h(RN.View, { style: { position: 'absolute', top: 4, right: 44, zIndex: 50 }, pointerEvents: 'box-none' },
                IconButton
                    ? h(IconButton, { icon: 'ChatIcon', label: 'Reply to Status', size: 'sm', variant: 'secondary', onPress: () => open(userId, status) })
                    : h(Button, { text: 'Reply', variant: 'secondary', onPress: () => open(userId, status) })));
    }
    return {
        start() {
            r.hook([
                'UserProfileHeader', 'ProfileHeader', 'UserProfileCard', 'UserProfileTopSection',
                'ProfileCard', 'DisplayProfileHeader', 'UserProfileModalHeader', 'Header',
            ], wrapHeader);
        },
        stop() { dismiss?.(); dismiss = null; },
        Settings() {
            return h(Page, { title: 'Reply to Status' },
                h(Text, null, 'Adds a Reply button at the top-right of the profile card, next to options. Sends a quoted DM.'));
        },
        Composer, Quote,
    };
}
