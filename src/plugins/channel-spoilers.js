import { ui } from '../runtime.js';

const SNOWFLAKE = /^\d{15,22}$/;
const MEDIA_EXT = /\.(png|jpe?g|gif|webp|mp4|mov|webm)(\?|#|$)/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|mov|webm)(\?|#|$)/i;
const MEDIA_TYPE = /^(image|video)\//i;
const MEDIA_KIND = /^(image|gif|gifv|video)$/i;
const MEDIA_NAME = /MessageImage|MessageVideo|ImageAttachment|VideoAttachment|MediaAttachment|EmbedMedia|MessageMedia|GifVideo|FastImage|MediaPlayer|Mosaic|EmbedImage|EmbedVideo|EmbedThumbnail|AttachmentImage|GalleryItem|CachedImage|MediaView|InlineMedia|GifImage|LazyImage|ZoomableImage|(?:^|[^a-z])(?:Gif|Video|Image)(?:[^a-z]|$)/i;
const SPOILER_FLAG = 8;


export function channelSnowflake(value) {
    const id = String(value ?? '').trim();
    return SNOWFLAKE.test(id) ? id : '';
}

export function channelIdOf(props) {
    if (!props || typeof props !== 'object') return '';
    const message = props.message && typeof props.message === 'object' ? props.message : null;
    const value = props.channelId || props.channel_id || props.channel?.id
        || message?.channel_id || message?.channelId || message?.getChannelId?.() || '';
    return value == null ? '' : String(value);
}

export function isListedChannel(channels, id) {
    const text = String(id || '');
    return !!text && Array.isArray(channels) && channels.map(String).includes(text);
}

function mediaType(obj) {
    return obj.content_type || obj.contentType || (typeof obj.type === 'string' ? obj.type : '');
}

function mediaName(obj) {
    return [obj.filename, obj.name, obj.fileName, obj.url, obj.proxy_url, obj.proxyURL, obj.src, obj.uri, obj.source?.uri]
        .filter(value => typeof value === 'string').join(' ');
}

export function isVideo(obj) {
    const type = mediaType(obj);
    const name = mediaName(obj);
    return /^video\//i.test(type) || /^video$/i.test(type) || VIDEO_EXT.test(name);
}

export function isVisualMedia(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj.props || obj.$$typeof) return false;
    const type = mediaType(obj);
    const name = mediaName(obj);
    if (typeof type === 'string' && (MEDIA_TYPE.test(type) || MEDIA_KIND.test(type))) return true;
    if (MEDIA_EXT.test(name)) return true;
    // Embed images and inline players often have a URL plus a size and no file extension.
    const url = obj.url || obj.proxy_url || obj.proxyURL || obj.src || obj.source?.uri;
    return typeof url === 'string' && /^https?:/i.test(url) && (obj.width || obj.height || obj.proxy_url || obj.proxyURL);
}

function attachmentRecord(item) {
    return typeof item.filename === 'string' || typeof item.fileName === 'string'
        || typeof item.content_type === 'string' || typeof item.contentType === 'string';
}

// Link embeds are spoiled when the URL sits inside spoiler bars. Signed CDN URLs stay untouched.
export function spoilImageLinks(content) {
    if (typeof content !== 'string' || !content) return content;
    return content.replace(/https?:\/\/[^\s<]+/gi, (raw, offset) => {
        let end = raw.length;
        while (end > 0 && /[),.;!?]/.test(raw[end - 1])) end -= 1;
        const url = raw.slice(0, end);
        const tail = raw.slice(end);
        const path = url.split('#')[0];
        const host = path.replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./, '');
        const imageLink = IMAGE_EXT.test(path) || (!VIDEO_EXT.test(path) && /(?:^|\.)(?:tenor\.com|giphy\.com|imgur\.com)$/i.test(host));
        if (!imageLink) return raw;
        const before = content.slice(Math.max(0, offset - 2), offset);
        const after = content.slice(offset + end, offset + end + 2);
        if (before === '||' && after === '||') return raw;
        return `||${url}||${tail}`;
    });
}

function componentName(type) {
    if (!type || typeof type === 'string') return typeof type === 'string' ? type : '';
    return type.displayName || type.name || type.type?.displayName || type.type?.name || '';
}

function messageLike(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.props) return false;
    if (value.author || value.author_id || value.authorId) return true;
    if (typeof value.content === 'string') return true;
    if (Array.isArray(value.attachments) || Array.isArray(value.embeds)) return true;
    return false;
}

function isDecorative(element) {
    const props = element?.props || {};
    if (props.attachment || props.attachments || props.media) return false;
    const name = componentName(element?.type);
    if (/Emoji|Reaction|Avatar|GuildIcon|UserIcon/i.test(name) && !MEDIA_NAME.test(name)) return true;
    if (props.emoji || props.user || props.avatar || props.guild || props.avatarUrl) return true;
    const size = typeof props.size === 'number' ? props.size
        : typeof props.width === 'number' ? props.width
            : typeof props.style?.width === 'number' ? props.style.width : 0;
    return size > 0 && size <= 40;
}

function mediaPayload(props) {
    if (!props) return null;
    for (const item of [props.attachment, props.media, props.item, props.embed]) {
        if (isVisualMedia(item)) return item;
    }
    return isVisualMedia(props) ? props : null;
}

// Native chat decodes attachment.spoiler as a String. A boolean there crashes the GIF row.
// Video cells honor flags bit 8. Image, GIF, and gallery cells honor a boolean spoiler or is_spoiler.
export function markLocalSpoiler(item) {
    if (!item || typeof item !== 'object' || item.props || item.$$typeof) return;
    for (const key of ['filename', 'name', 'fileName']) {
        if (typeof item[key] === 'string' && item[key] && !/^SPOILER_/i.test(item[key])) item[key] = 'SPOILER_' + item[key];
    }
    if (typeof item.flags === 'number' && Number.isFinite(item.flags)) item.flags |= SPOILER_FLAG;
    else if (typeof item.flags === 'string' && /^\d+$/.test(item.flags)) item.flags = String(Number(item.flags) | SPOILER_FLAG);
    else if (item.flags == null) item.flags = SPOILER_FLAG;
    // A boolean spoiler is the media-gallery bit. Attachment and video records stay strings.
    if (typeof item.spoiler === 'boolean') item.spoiler = true;
    else if (typeof item.spoiler !== 'string' || item.spoiler.length === 0) item.spoiler = 'true';
    item.is_spoiler = true;
}

export function spoilTree(node, channels, inherited = '', depth = 0) {
    if (depth > 12 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        node.forEach(item => spoilTree(item, channels, inherited, depth + 1));
        return;
    }
    const own = channelIdOf(node);
    const channelId = channels.has(own) ? own : inherited;
    const inChannel = channels.has(channelId);
    const decorative = !!(node.avatar || node.avatarUrl || node.guildIcon || node.guild_icon)
        || (/avatar|guildicon|usericon/i.test(String(node.type || node.component || '')) && !node.attachment && !node.attachments);
    if (inChannel && !decorative) {
        if (typeof node.content === 'string') node.content = spoilImageLinks(node.content);
        const mark = item => {
            if (!isVisualMedia(item)) return;
            markLocalSpoiler(item);
        };
        const markGallery = entry => {
            if (!entry || typeof entry !== 'object') return;
            mark(entry.media);
            mark(entry.file);
            mark(entry.image);
            mark(entry.thumbnail);
            if (typeof entry.spoiler === 'boolean') entry.spoiler = true;
            else if ((entry.media || entry.file) && entry.spoiler == null && !attachmentRecord(entry)) entry.spoiler = true;
        };
        if (!node.attachments) mark(node);
        mark(node.attachment);
        mark(node.media);
        mark(node.image);
        mark(node.video);
        mark(node.thumbnail);
        if (Array.isArray(node.attachments)) node.attachments.forEach(mark);
        if (Array.isArray(node.embeds)) node.embeds.forEach(embed => {
            mark(embed);
            mark(embed?.image);
            mark(embed?.video);
            mark(embed?.thumbnail);
        });
        const items = node.items || node.components;
        if (Array.isArray(items)) items.forEach(markGallery);
    }
    const nextChannel = inChannel ? channelId : inherited;
    for (const value of Object.values(node)) {
        if (value && typeof value === 'object') spoilTree(value, channels, nextChannel, depth + 1);
    }
}

export default function ChannelSpoilers(r) {
    const { h, React, RN } = r;
    const { Page, Text, Button, Input } = ui(r);
    const revealed = new Set();
    const wrappedTypes = new WeakMap();
    let currentChannel = '';
    let covering = false;

    function listed(id) {
        return isListedChannel(r.store.channels, id);
    }

    function SpoilerCover({ mediaId, original }) {
        const [shown, setShown] = React.useState(revealed.has(mediaId));
        if (shown) return original;
        return h(RN.Pressable, {
            testID: 'mime-channel-spoiler',
            accessibilityLabel: 'Spoiler',
            accessibilityRole: 'button',
            onPress: () => { revealed.add(mediaId); setShown(true); },
            style: { minHeight: 120, borderRadius: 8, backgroundColor: '#000000cc', alignItems: 'center', justifyContent: 'center', padding: 12 },
        }, h(RN.Text, { style: { color: '#F2F3F5', fontSize: 16, fontWeight: '700' } }, 'Spoiler'));
    }

    function trackingType(type) {
        const existing = wrappedTypes.get(type);
        if (existing) return existing;
        function TrackedMessage(props) {
            const channelId = channelIdOf(props);
            const previous = currentChannel;
            if (listed(channelId)) currentChannel = channelId;
            try { return type(props); }
            finally { currentChannel = previous; }
        }
        TrackedMessage.displayName = type.displayName || type.name || 'Message';
        TrackedMessage.__mimeTrack = true;
        wrappedTypes.set(type, TrackedMessage);
        return TrackedMessage;
    }

    function coverElement(element) {
        if (!element?.props || element.type === SpoilerCover || element.props.original) return element;
        if (element.props.testID === 'mime-channel-spoiler' || isDecorative(element)) return element;
        const fromProps = channelIdOf(element.props);
        const channelId = listed(fromProps) ? fromProps : (listed(currentChannel) ? currentChannel : '');
        if (!channelId) return element;
        const payload = mediaPayload(element.props);
        const named = MEDIA_NAME.test(componentName(element.type));
        if (!payload && !named) return element;
        const mediaId = String(payload?.id || payload?.url || payload?.filename || element.props.src || element.key || channelId);
        return h(SpoilerCover, { key: element.key, mediaId, original: element });
    }

    function Settings() {
        r.useRefresh();
        const [draft, setDraft] = React.useState('');
        const channels = Array.isArray(r.store.channels) ? r.store.channels : [];
        const add = () => {
            const id = channelSnowflake(draft);
            if (!id || channels.includes(id)) return;
            r.set('channels', channels.concat(id));
            setDraft('');
        };
        const remove = id => r.set('channels', channels.filter(item => item !== id));
        return h(Page, { title: 'Channel Spoilers' },
            h(Input, { label: 'Channel ID', value: draft, onChange: setDraft, placeholder: 'Channel ID' }),
            h(Button, { text: 'Add', onPress: add }),
            h(RN.View, { testID: 'mime-channel-table' },
                channels.length
                    ? channels.map(id => h(RN.View, {
                        key: id,
                        testID: 'mime-spoiler-channel-' + id,
                        style: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
                    }, h(Text, null, id), h(Button, { text: 'Remove ' + id, variant: 'secondary', onPress: () => remove(id) })))
                    : h(Text, { muted: true }, 'No channels yet.')),
            h(Text, { muted: true }, 'Images, GIFs, and videos in these channels are covered on this device until you tap them. Other people still see the files.'));
    }

    return {
        Settings,
        start() {
            r.patch('after', React, 'createElement', (args, result) => {
                if (covering || !r.active || !result?.props) return;
                const type = args?.[0];
                const props = args?.[1];
                const render = typeof type === 'function' && !type.prototype?.isReactComponent && !type.__mimeTrack ? type : null;
                if (render && messageLike(props?.message) && listed(channelIdOf(props))) {
                    covering = true;
                    try { return React.createElement(trackingType(render), props, ...args.slice(2)); }
                    finally { covering = false; }
                }
                covering = true;
                try {
                    const covered = coverElement(result);
                    return covered === result ? undefined : covered;
                } finally { covering = false; }
            });
            const spoilRows = rows => {
                const channels = Array.isArray(r.store.channels) ? r.store.channels : [];
                if (!channels.length || rows == null) return rows;
                const next = JSON.parse(JSON.stringify(rows));
                spoilTree(next, new Set(channels.map(String)));
                return next;
            };
            r.patchRows(spoilRows);
            const messages = r.byStore('MessageStore') || r.find('getMessages', 'getMessage') || r.find('getMessages');
            const listedSet = () => new Set((Array.isArray(r.store.channels) ? r.store.channels : []).map(String));
            const spoilStored = value => {
                const channels = listedSet();
                if (!channels.size || value == null) return;
                try { spoilTree(value, channels); } catch { /* Keep the original message if a row is sealed. */ }
            };
            if (typeof messages?.getMessages === 'function') {
                r.patch('after', messages, 'getMessages', (_args, result) => { if (r.active) spoilStored(result); });
            }
            if (typeof messages?.getMessage === 'function') {
                r.patch('after', messages, 'getMessage', (_args, result) => { if (r.active) spoilStored(result); });
            }
            r.status.channels = Array.isArray(r.store.channels) ? r.store.channels.length : 0;
        },
    };
}

ChannelSpoilers.defaults = { channels: [] };
