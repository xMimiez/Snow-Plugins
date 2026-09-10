import { ui } from '../runtime.js';
import { addUrlHandler, openExternal } from '../url-hub.js';

export function steamTargets(value) {
    try {
        const u = new URL(value);
        const host = u.hostname.replace(/^www\./, '');
        if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return [];
        if (!['store.steampowered.com', 'steamcommunity.com', 'help.steampowered.com'].includes(host)) return [];
        const path = u.pathname;
        const out = [];
        const app = path.match(/\/app\/(\d+)/);
        if (app) {
            out.push('steam://store/' + app[1]);
            out.push('steam://url/StoreAppPage/' + app[1]);
        }
        const bundle = path.match(/\/bundle\/(\d+)/);
        if (bundle) out.push('steam://url/StoreBundlePage/' + bundle[1]);
        const sub = path.match(/\/sub\/(\d+)/);
        if (sub) out.push('steam://url/StoreSubPage/' + sub[1]);
        const profile = path.match(/\/profiles\/(\d+)/);
        if (profile) out.push('steam://url/SteamIDPage/' + profile[1]);
        const file = path.includes('sharedfiles') && u.searchParams.get('id');
        if (file) out.push('steam://url/CommunityFilePage/' + file);
        out.push('steam://openurl/' + u.href);
        out.push('steam://openurl_external/' + u.href);
        return out;
    } catch { return []; }
}

export function appLink(value) {
    try {
        const u = new URL(value);
        if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
        const host = u.hostname.replace(/^www\./, '');
        const path = u.pathname.replace(/\/$/, '');
        const steam = steamTargets(value);
        if (steam.length) return steam[0];
        if (host === 'tidal.com' && /^\/browse\/(track|album|artist|playlist)\/[\w-]+$/.test(path)) return 'tidal://' + path.slice(8);
        if (host === 'music.apple.com') return 'musics://' + u.host + u.pathname + u.search;
        if (host === 't.me' || host === 'telegram.me') {
            const parts = path.slice(1).split('/');
            const domain = parts[0];
            if (domain && domain.startsWith('+')) return 'tg://join?invite=' + encodeURIComponent(domain.slice(1));
            if (domain && /^[A-Za-z][\w]{3,}$/.test(domain) && !parts[1]) return 'tg://resolve?domain=' + encodeURIComponent(domain);
            if (domain && parts[1]) return 'tg://resolve?domain=' + encodeURIComponent(domain) + '&post=' + encodeURIComponent(parts[1]);
        }
        if (host === 'instagram.com' || host === 'instagr.am') {
            const ig = path.slice(1).split('/');
            if (['p', 'reel', 'reels', 'tv'].includes(ig[0]) && ig[1]) return 'instagram://media?shortcode=' + encodeURIComponent(ig[1]);
            if (ig[0] && !['stories', 'explore', 'accounts'].includes(ig[0])) return 'instagram://user?username=' + encodeURIComponent(ig[0]);
        }
        if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
            const user = path.match(/^\/@([^/]+)/);
            if (user) return 'tiktok://user?username=' + encodeURIComponent(user[1]);
            if (host === 'vm.tiktok.com' || path.startsWith('/t/')) return 'tiktok://' + path;
            return 'snssdk1233://' + path;
        }
    } catch {}
    return null;
}

async function openSteam(r, href, fallback) {
    const ios = r.RN.Platform?.OS === 'ios';
    const targets = ios ? [href, ...steamTargets(href)] : [...steamTargets(href), href];
    for (const url of targets) {
        try { await r.RN.Linking.openURL(url); return; } catch {}
    }
    if (r.active) fallback();
}

export default function OpenInApp(r) {
    const { h } = r, { Page, Text, Toggle } = ui(r);
    return {
        start() {
            addUrlHandler(r, 10, (url, fallback) => {
                if (!r.store.enabled) return false;
                const steam = steamTargets(url);
                if (steam.length) {
                    openSteam(r, url, fallback);
                    return true;
                }
                const app = appLink(url);
                if (!app) return false;
                openExternal(r, app).catch(() => r.active && fallback());
                return true;
            });
        },
        Settings() {
            r.useRefresh();
            return h(Page, { title: 'OpenInApp' },
                h(Toggle, { setting: 'enabled', label: 'Open supported links in their app' }),
                h(Text, null, 'Steam store pages use steam://store/<id> and StoreAppPage, then steam://openurl. Other apps use their native schemes. SpotifyPreview still takes priority for Spotify URLs.'));
        },
    };
}
OpenInApp.defaults = { enabled: true };
