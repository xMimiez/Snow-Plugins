import { ui } from '../runtime.js';

const SNOWFLAKE = /^\d{15,22}$/;
const MEDIA_EXT = /\.(png|jpe?g|gif|webp|mp4|mov|webm)(\?|#|$)/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|mov|webm)(\?|#|$)/i;
const MEDIA_TYPE = /^(image|video)\//i;
const MEDIA_KIND = /^(image|gif|gifv|video)$/i;
const MEDIA_NAME = /MessageImage|MessageVideo|ImageAttachment|VideoAttachment|MediaAttachment|EmbedMedia|MessageMedia|GifVideo|Gifv|FastImage|MediaPlayer|Mosaic|EmbedImage|EmbedVideo|EmbedThumbnail|AttachmentImage|GalleryItem|CachedImage|MediaView|InlineMedia|GifImage|LazyImage|ZoomableImage|(?:^|[^a-z])(?:Gif|Video|Image)(?:[^a-z]|$)/i;
const GIF_HOST = /(?:^|\.)(?:tenor\.com|tenor\.co|giphy\.com|gph\.is|imgur\.com|gfycat\.com|redgifs\.com)$/i;
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

// A GIF picked from Tenor or Giphy is a gifv embed played as video. Embed media has no spoiler flag.
export function isGifLink(url) {
    if (typeof url !== 'string' || !/^https?:/i.test(url)) return false;
    const path = url.split('#')[0];
    const host = path.replace(/^https?:\/\//i, '').split(/[/?]/)[0].replace(/^www\./i, '');
    if (/\.gif(\?|$)/i.test(path)) return true;
    if (GIF_HOST.test(host)) return true;
    return /tenor\.com|giphy\.com|gph\.is|gfycat\.com|redgifs\.com/i.test(path) && /\.(gif|mp4|webm)(\?|$)/i.test(path);
}

function isGifEmbed(embed) {
    if (!embed || typeof embed !== 'object') return false;
    const type = String(embed.type || '').toLowerCase();
    if (type === 'gifv' || type === 'gif') return true;
    if (/tenor|giphy|imgur|gfycat|redgifs/i.test(embed.provider?.name || '')) return true;
    return [embed.url, embed.video?.url, embed.video?.proxy_url, embed.image?.url, embed.thumbnail?.url].some(isGifLink);
}

function holdsGif(node) {
    if (!node || typeof node !== 'object') return false;
    if (isGifEmbed(node) || isGifLink(node.url) || isGifLink(node.proxy_url)) return true;
    const nested = [node.media, node.image, node.video, node.thumbnail, node.file];
    if (Array.isArray(node.items)) nested.push(...node.items);
    if (Array.isArray(node.components)) nested.push(...node.components);
    return nested.some(item => item && typeof item === 'object' && (
        isGifLink(item.url) || isGifLink(item.proxy_url) || isGifLink(item.media?.url) || isGifLink(item.video?.url) || isGifEmbed(item)
    ));
}

function spoilerId(seed) {
    let hash = 2166136261;
    const text = String(seed || 'gif');
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    const body = (hash >>> 0).toString().padStart(10, '0');
    return `8${body}${body}`.slice(0, 18);
}

// The native video cell already spoilers attachments. A linked GIF becomes one of those locally.
function promoteGifEmbeds(node) {
    if (!Array.isArray(node.embeds) || !node.embeds.length) return;
    const kept = [];
    const additions = [];
    const attachments = Array.isArray(node.attachments) ? node.attachments : [];
    for (const embed of node.embeds) {
        if (!isGifEmbed(embed)) {
            kept.push(embed);
            continue;
        }
        const media = embed.video || embed.image || embed.thumbnail || null;
        const proxy = media?.proxy_url || media?.proxyURL || media?.url || embed.url;
        const source = media?.url || embed.url || proxy;
        if (typeof proxy !== 'string' || !/^https?:/i.test(proxy)) {
            kept.push(embed);
            continue;
        }
        const existing = attachments.find(item => item && (item.url === source || item.url === proxy || item.proxy_url === proxy || item.proxy_url === source));
        if (existing) {
            markLocalSpoiler(existing);
            continue;
        }
        const video = !!embed.video;
        additions.push({
            id: spoilerId(`${node.id || ''}:${source}`),
            filename: video ? 'SPOILER_gif.mp4' : 'SPOILER_gif.gif',
            size: Number(media?.size) || 0,
            url: source,
            proxy_url: proxy,
            width: Number(media?.width) || 0,
            height: Number(media?.height) || 0,
            content_type: media?.content_type || media?.contentType || (video ? 'video/mp4' : 'image/gif'),
            spoiler: 'true',
            flags: SPOILER_FLAG,
            is_spoiler: true,
            isSpoiler: true,
        });
    }
    node.embeds = kept;
    if (!additions.length) return;
    if (!Array.isArray(node.attachments)) node.attachments = [];
    node.attachments.push(...additions);
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
        const imageLink = IMAGE_EXT.test(path) || isGifLink(url);
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
    // The native reply row requires this camelCase Bool. spoiler itself stays a String.
    if (attachmentRecord(item)) item.isSpoiler = true;
}

// Reply rows decode every attachment with a required isSpoiler Bool. Partial
// referenced attachments often have no filename, so the key has to be written anyway.
export function stampAttachment(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const flags = typeof item.flags === 'number' ? item.flags : typeof item.flags === 'string' && /^\d+$/.test(item.flags) ? Number(item.flags) : 0;
    item.isSpoiler = item.isSpoiler === true || item.is_spoiler === true || item.spoiler === true || item.spoiler === 'true' || (flags & SPOILER_FLAG) === SPOILER_FLAG;
}

function stampTree(node, depth = 0) {
    if (depth > 16 || node == null) return;
    if (Array.isArray(node)) {
        node.forEach(item => stampTree(item, depth + 1));
        return;
    }
    if (typeof node !== 'object') return;
    let keys;
    try { keys = Object.keys(node); } catch { return; }
    for (const key of keys) {
        let value;
        try { value = node[key]; } catch { continue; }
        if (typeof value === 'string' && value.includes('attachments')) {
            try {
                const parsed = JSON.parse(value);
                if (parsed && typeof parsed === 'object') {
                    stampTree(parsed, depth + 1);
                    node[key] = JSON.stringify(parsed);
                    continue;
                }
            } catch { /* This string is not a nested message. */ }
        }
        if (/attachments/i.test(key) && Array.isArray(value)) value.forEach(stampAttachment);
        if (value && typeof value === 'object') stampTree(value, depth + 1);
    }
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
            if (isGifEmbed(embed)) return;
            mark(embed);
            mark(embed?.image);
            mark(embed?.video);
            mark(embed?.thumbnail);
        });
        promoteGifEmbeds(node);
        if (typeof node.spoiler === 'boolean' && !node.spoiler && !attachmentRecord(node) && holdsGif(node)) node.spoiler = true;
        const items = node.items || node.components;
        if (Array.isArray(items)) items.forEach(markGallery);
    }
    stampTree(node);
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
