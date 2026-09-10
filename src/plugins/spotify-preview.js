import { ui } from '../runtime.js';
import { addUrlHandler, openExternal } from '../url-hub.js';
export function spotifyLink(value) {
    try { const u = new URL(value); if (u.protocol !== 'https:' || u.hostname !== 'open.spotify.com') return null;
        const match = u.pathname.match(/^\/(?:intl-[a-z-]+\/)?(track|album|artist|playlist|episode|show)\/([A-Za-z0-9]+)\/?$/);
        return match ? { url: `https://open.spotify.com/${match[1]}/${match[2]}`, embed: `https://open.spotify.com/embed/${match[1]}/${match[2]}`, app: `spotify:${match[1]}:${match[2]}` } : null;
    } catch { return null; }
}
export default function SpotifyPreview(r) {
    const { h, React, RN } = r, { Text, Button, Page, Toggle } = ui(r); let close;
    function Preview({ link, fallback, close: dismiss }) {
        const [state, setState] = React.useState('loading'), [key, retry] = React.useState(0);
        React.useEffect(() => { const timer = setTimeout(() => setState(s => s === 'loading' ? 'error' : s), 20000); return () => clearTimeout(timer); }, [key]);
        React.useEffect(() => () => { close = null; }, []);
        const WebView = r.find('WebView')?.WebView || r.find('RCTWebView')?.default || r.byName('WebView') || r.byName('RCTWebView');
        return h(Page, { title: 'Spotify preview', close: dismiss },
            h(Text, { muted: true }, 'Playback availability and length are controlled by Spotify.'),
            !WebView ? h(Text, null, 'WebView is unavailable on this build. Use Open Spotify below.') : null,
            state === 'loading' && WebView ? h(RN.ActivityIndicator) : null,
            state === 'error' ? h(Text, null, 'Preview could not load. Retry or open Spotify.') : null,
            WebView ? h(WebView, { key, source: { uri: link.embed }, style: { height: 352, backgroundColor: 'transparent' }, javaScriptEnabled: true,
                originWhitelist: ['https://*'], onLoadEnd: () => setState(s => s === 'error' ? s : 'ready'), onError: () => setState('error'), onHttpError: () => setState('error'),
                onShouldStartLoadWithRequest: request => { try { const u = new URL(request.url); return u.protocol === 'https:' && (u.hostname === 'open.spotify.com' || u.hostname.endsWith('.spotify.com') || u.hostname === 'spotify.com'); } catch { return false; } } }) : null,
            h(Button, { text: 'Open Spotify', onPress: async () => { try { await openExternal(r, link.app).catch(() => openExternal(r, link.url)); dismiss(); } catch (e) { r.error('Spotify', e); } } }),
            h(Button, { text: 'Open original link', variant: 'secondary', onPress: () => { dismiss(); fallback(); } }),
            state === 'error' ? h(Button, { text: 'Retry', variant: 'secondary', onPress: () => { setState('loading'); retry(n => n + 1); } }) : null);
    }
    function Settings() { r.useRefresh(); return h(Page, { title: 'SpotifyPreview' }, h(Toggle, { setting: 'enabled', label: 'Preview Spotify links' }), h(Text, { muted: true }, 'Uses the official Spotify embed. Links still open normally if Snow’s sheet or WebView is unavailable.')); }
    return { start() { addUrlHandler(r, 100, (url, fallback) => {
        const link = spotifyLink(url);
        if (!r.store.enabled || !link) return false;
        try { close?.(); close = r.open('preview', Preview, { link, fallback }); return true; }
        catch (error) { r.error('Spotify preview', error); return false; }
    }); }, stop() { close?.(); }, Settings };
}
SpotifyPreview.defaults = { enabled: true };
