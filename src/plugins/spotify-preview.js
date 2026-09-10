import { ui } from '../runtime.js';
import { addUrlHandler, openExternal } from '../url-hub.js';

export function spotifyLink(value) {
    if (!value) return null;
    const raw = String(value);
    const app = raw.match(/^spotify:(track|album|artist|playlist|episode|show):([A-Za-z0-9]+)/i);
    if (app) {
        const kind = app[1].toLowerCase(), id = app[2];
        return { url: `https://open.spotify.com/${kind}/${id}`, embed: `https://open.spotify.com/embed/${kind}/${id}`, app: `spotify:${kind}:${id}` };
    }
    try {
        const u = new URL(raw);
        if (u.protocol !== 'https:' || (u.hostname !== 'open.spotify.com' && u.hostname !== 'spotify.link')) return null;
        const match = u.pathname.match(/^\/(?:intl-[a-z-]+\/)?(track|album|artist|playlist|episode|show)\/([A-Za-z0-9]+)\/?$/);
        return match ? { url: `https://open.spotify.com/${match[1]}/${match[2]}`, embed: `https://open.spotify.com/embed/${match[1]}/${match[2]}`, app: `spotify:${match[1]}:${match[2]}` } : null;
    } catch { return null; }
}

export default function SpotifyPreview(r) {
    const { h, React, RN } = r, { Text, Button, Page, Toggle } = ui(r);
    let close;
    function Preview({ link, fallback, close: dismiss }) {
        const [state, setState] = React.useState('loading'), [key, retry] = React.useState(0), [meta, setMeta] = React.useState(null);
        React.useEffect(() => {
            let alive = true;
            r.request(`https://open.spotify.com/oembed?url=${encodeURIComponent(link.url)}`, {}, 8000, 200000)
                .then(res => { if (alive) setMeta(res.json()); })
                .catch(() => {});
            return () => { alive = false; };
        }, [link.url, key]);
        React.useEffect(() => { const timer = setTimeout(() => setState(s => s === 'loading' ? 'ready' : s), 12000); return () => clearTimeout(timer); }, [key]);
        React.useEffect(() => () => { close = null; }, []);
        const WebView = r.find('WebView')?.WebView || r.find('RCTWebView')?.default || r.byName('WebView') || r.byName('RCTWebView');
        return h(Page, { title: meta?.title || 'Spotify preview', close: dismiss },
            meta?.thumbnail_url ? h(RN.Image, { source: { uri: meta.thumbnail_url }, style: { width: '100%', height: 180, borderRadius: 12 }, resizeMode: 'cover' }) : null,
            meta?.author_name ? h(Text, { muted: true }, meta.author_name) : null,
            WebView ? h(WebView, {
                key, source: { uri: link.embed }, style: { height: 352, backgroundColor: 'transparent' }, javaScriptEnabled: true,
                originWhitelist: ['https://*'],
                onLoadEnd: () => setState('ready'),
                onError: () => setState('ready'),
                onShouldStartLoadWithRequest: request => {
                    try {
                        const u = new URL(request.url);
                        return u.protocol === 'https:' && (u.hostname === 'open.spotify.com' || u.hostname.endsWith('.spotify.com'));
                    } catch { return false; }
                },
            }) : h(Text, { muted: true }, 'Embed player unavailable; thumbnail preview is shown instead.'),
            h(Button, { text: 'Open in Spotify', onPress: async () => { try { await openExternal(r, link.app).catch(() => openExternal(r, link.url)); dismiss(); } catch (e) { r.error('Spotify', e); } } }),
            fallback ? h(Button, { text: 'Open original link', variant: 'secondary', onPress: () => { dismiss(); fallback(); } }) : null,
            h(Button, { text: 'Retry', variant: 'secondary', onPress: () => { setState('loading'); retry(n => n + 1); } }));
    }
    function show(link, fallback) {
        try { close?.(); close = r.open('preview', Preview, { link, fallback }); return true; }
        catch (error) {
            r.error('Spotify preview', error);
            return false;
        }
    }
    function Settings() {
        r.useRefresh();
        return h(Page, { title: 'SpotifyPreview' },
            h(Toggle, { setting: 'enabled', label: 'Preview Spotify links in a sheet' }),
            h(Text, { muted: true }, 'Intercepts Spotify links and spotify: app URLs so they open a preview instead of jumping to the app.'));
    }
    return {
        start() {
            addUrlHandler(r, 1000, (url, fallback) => {
                const link = spotifyLink(url);
                if (!r.store.enabled || !link) return false;
                return show(link, fallback);
            });
            if (r.RN.Linking?.openURL) {
                r.patch('instead', r.RN.Linking, 'openURL', (args, next) => {
                    const link = spotifyLink(args[0]);
                    if (r.store.enabled && link) {
                        show(link, () => next(...args));
                        return Promise.resolve();
                    }
                    return next(...args);
                });
            }
        },
        stop() { close?.(); },
        Settings,
    };
}
SpotifyPreview.defaults = { enabled: true };
