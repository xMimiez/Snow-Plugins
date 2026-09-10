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
    for (const match of status.text.matchAll(pattern)) {
        if (match.index > offset) result.push({ text: status.text.slice(offset, match.index) });
        result.push({ id: match[3] || match[4], name: match[2] || 'emoji', animated: match[1] === 'a' });
        offset = match.index + match[0].length;
    }
    if (offset < status.text.length) result.push({ text: status.text.slice(offset) });
    return result;
}

export default function ReplyToStatus(r) {
    const { h, React, RN } = r;
    const { Text, Button, Page, Input } = ui(r);
    const GateContext = React.createContext(false);
    const owners = new Map();
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
        const onClose = () => { dismiss = null; close(); };
        async function send(value) {
            if (sending || !value.trim()) return;
            sending = true; setBusy(true); setError('');
            try {
                const dm = (await r.discord('/users/@me/channels', { method: 'POST', body: JSON.stringify({ recipient_id: userId }) })).json();
                if (!dm?.id) throw new Error('Discord did not return a DM channel');
                const emoji = status.emojiId ? `<${status.animated ? 'a' : ''}:${status.emojiName || 'emoji'}:${status.emojiId}>` : status.emojiName;
                const quote = [emoji, status.text].filter(Boolean).join(' ').replace(/\r?\n/g, '\n> ');
                const content = `> ${quote}\n${value.trim()}`;
                if (content.length > 2000) throw new Error('Reply and status together must be under 2,000 characters');
                await r.discord(`/channels/${dm.id}/messages`, { method: 'POST', body: JSON.stringify({ content, allowed_mentions: { parse: [] } }) });
                r.toast('Reply sent'); if (mounted.current && r.active) onClose();
            } catch (e) { if (mounted.current && r.active) setError(e.message); }
            finally { sending = false; if (mounted.current && r.active) setBusy(false); }
        }
        return h(Page, { title: 'Reply to Status', close: onClose }, h(Quote, { status }),
            h(Input, { label: 'Your reply', placeholder: 'Write a reply…', value: draft, onChange: setDraft, editable: !busy, multiline: true }),
            h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } }, ['👍','❤️','😂','🔥','🎉','😮'].map(emoji =>
                h(Button, { key: emoji, text: emoji, variant: 'secondary', disabled: busy, accessibilityLabel: `Reply ${emoji}`, onPress: () => void send(emoji) }))),
            error ? h(Text, null, error) : null,
            h(Button, { text: busy ? 'Sending…' : 'Send reply', disabled: busy || !draft.trim(), onPress: () => void send(draft) }));
    }
    function open(userId, status) {
        if (dismiss) return;
        try { dismiss = r.open('composer', Composer, { userId, status }); }
        catch (error) { dismiss = null; r.error('Open reply', error); }
    }
    function ProfileGate({ children, userId, status }) {
        const parentOwns = React.useContext(GateContext);
        const me = r.byStore('UserStore')?.getCurrentUser?.();
        r.useRefresh();
        const token = React.useRef({}).current;
        const eligible = !parentOwns && !!userId && !!status && userId !== me?.id;
        React.useEffect(() => {
            if (!eligible) return;
            const set = owners.get(userId) || new Set(); owners.set(userId, set); set.add(token); r.changed();
            return () => { set.delete(token); if (!set.size) owners.delete(userId); r.changed(); };
        }, [eligible, userId]);
        const owns = eligible && owners.get(userId)?.values().next().value === token;
        if (!owns) return children;
        return h(GateContext.Provider, { value: true }, h(RN.View, { style: { flexShrink: 1 } }, children,
            h(RN.View, { style: { paddingHorizontal: 16, paddingVertical: 8 } }, h(Button, {
                text: 'Reply to Status', variant: 'secondary', accessibilityLabel: 'Reply to Status', onPress: () => open(userId, status)
            }))));
    }
    return {
        start() {
            function wrap(element) {
                const p = element?.props || {};
                if (p.__mimeReplyWrapped) return;
                const userId = p.userId || p.user?.id || p.displayProfile?.userId || p.displayProfile?.user?.id;
                if (!userId) return;
                const presence = r.byStore('PresenceStore');
                const status = normalizeStatus(p.customStatus || p.activity || p.activities || p.status || presence?.getActivities?.(userId) || presence?.getStatus?.(userId));
                if (!status) return;
                return h(ProfileGate, { userId, status, key: element.key }, r.React.cloneElement(element, { __mimeReplyWrapped: true }));
            }
            r.hook([
                'UserProfileActionSheet', 'UserProfile', 'UserProfileModal', 'UserProfileHeader', 'UserProfileCustomStatus',
                'ProfileCustomStatus', 'UserProfileSheet', 'ProfileActionSheet', 'UserProfileContainer', 'PrimaryUserProfile',
                'DisplayProfile', 'OverlayProfile', 'UserProfileCard',
            ], wrap);
            r.patch('after', r.React, 'createElement', (args, result) => {
                if (!r.active || !result?.props) return;
                const type = args[0];
                const name = typeof type === 'string' ? type : (type?.displayName || type?.name || '');
                if (!/profile/i.test(name)) return;
                return wrap(result) ?? result;
            });
        },
        stop() { dismiss?.(); dismiss = null; owners.clear(); },
        Settings() { r.useRefresh(); return h(Page, { title: 'Reply to Status' },
            h(Text, null, 'One reply button per profile. Replies are sent as a DM quoting the status; mobile does not expose a verified desktop status-reply transport.'),
            h(Text, { muted: true }, 'Custom emojis use Discord images, with readable names if an image fails.')); },
        ProfileGate, Composer, Quote
    };
}
