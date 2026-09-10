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
    if (!status) return result;
    if (status.emojiId) result.push({ id: status.emojiId, name: status.emojiName || 'emoji', animated: status.animated });
    else if (status.emojiName) result.push({ text: status.emojiName + ' ' });
    const pattern = /<(a?):([^:>]+):(\d+)>|<(\d{16,22})>/g;
    let offset = 0;
    for (const match of String(status.text || '').matchAll(pattern)) {
        if (match.index > offset) result.push({ text: status.text.slice(offset, match.index) });
        result.push({ id: match[3] || match[4], name: match[2] || 'emoji', animated: match[1] === 'a' });
        offset = match.index + match[0].length;
    }
    if (offset < String(status.text || '').length) result.push({ text: status.text.slice(offset) });
    return result;
}

export default function ReplyToStatus(r) {
    const { h, React, RN, C, B } = r;
    const { Text, Button, Page, Input } = ui(r);
    let dismiss = null;
    let sending = false;
    function Emoji({ part }) {
        const [failed, fail] = React.useState(false);
        if (failed || !RN.Image) return h(Text, null, ':' + part.name + ':');
        return h(RN.Image, { source: { uri: `https://cdn.discordapp.com/emojis/${part.id}.${part.animated ? 'gif' : 'png'}?size=48` },
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
        async function send() {
            const text = draft.trim();
            if (!text || sending) return;
            sending = true; setBusy(true); setError('');
            try {
                const channel = (await r.discord('/users/@me/channels', { method: 'POST', body: JSON.stringify({ recipient_id: userId }) })).json();
                const quote = status?.text ? `> ${status.text}\n` : '';
                await r.discord(`/channels/${channel.id}/messages`, { method: 'POST', body: JSON.stringify({ content: quote + text }) });
                r.toast('Reply sent');
                if (mounted.current) close();
            } catch (e) { if (mounted.current) setError(e.message); }
            finally { sending = false; if (mounted.current) setBusy(false); }
        }
        return h(Page, { title: 'Reply to status', close },
            h(Quote, { status: status || { text: '' } }),
            h(Input, { value: draft, onChange: setDraft, placeholder: 'Message', multiline: true }),
            error ? h(Text, null, error) : null,
            h(Button, { text: busy ? 'Sending…' : 'Send reply', disabled: busy || !draft.trim(), onPress: send }));
    }
    function open(userId, status) {
        if (dismiss) return;
        try { dismiss = r.open('composer', Composer, { userId, status: status || { text: '' } }); }
        catch (error) { dismiss = null; r.error('Open reply', error); }
    }
    function userIdFrom(props) {
        if (!props) return null;
        return props.userId || props.user?.id || props.displayProfile?.userId || props.displayProfile?.user?.id || null;
    }
    function overlay(tree, props) {
        const userId = userIdFrom(props);
        const me = r.byStore('UserStore')?.getCurrentUser?.();
        if (!userId || userId === me?.id || props?.__mimeReplyHeader) return tree;
        const status = normalizeStatus(props.customStatus || props.activities || r.byStore('PresenceStore')?.getActivities?.(userId)) || { text: '' };
        const IconButton = C.IconButton;
        return h(RN.View, { style: { position: 'relative' } },
            tree,
            h(RN.View, { style: { position: 'absolute', top: 6, right: 44, zIndex: 80 } },
                IconButton
                    ? h(IconButton, { icon: 'ChatIcon', label: 'Reply to Status', size: 'sm', variant: 'secondary', onPress: () => open(userId, status) })
                    : h(Button, { text: 'Reply', variant: 'secondary', onPress: () => open(userId, status) })));
    }
    function patchNamed(name) {
        const metro = B.metro;
        for (const finder of ['findByName', 'findByDisplayName', 'findByTypeName']) {
            const mod = metro[finder]?.(name, false);
            if (!mod) continue;
            const key = typeof mod.default === 'function' ? 'default' : typeof mod.type === 'function' ? 'type' : null;
            if (!key) continue;
            r.patch('after', mod, key, (args, tree) => overlay(tree, args?.[0] || {}));
        }
    }
    return {
        start() {
            const names = ['UserProfileHeader', 'ProfileHeader', 'UserProfileCard', 'ProfileCard', 'UserProfileTopSection', 'DisplayProfileHeader'];
            for (const name of names) patchNamed(name);
            r.hook(names, element => {
                const tree = overlay(element, element.props);
                return tree === element ? undefined : tree;
            });
        },
        stop() { dismiss?.(); dismiss = null; },
        Settings() {
            return h(Page, { title: 'Reply to Status' },
                h(Text, null, 'Places a Chat IconButton at the top-right of the profile card (left of options) using Snow findByName/findByTypeName + jsx.onJsxCreate.'));
        },
        Composer, Quote,
    };
}
