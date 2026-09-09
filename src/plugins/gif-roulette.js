export function gifUrls(value) {
    const source = value?.favoriteGifs?.gifs || value?.favorite_gifs?.gifs || value?.gifs || value?.favorites || value;
    const urls = [];
    function add(value) {
        if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return;
        const proxy = value.match(/\/external\/[^/]+\/(https?)\/([^?]+)/);
        if (proxy) { try { value = proxy[1] + '://' + decodeURIComponent(proxy[2]); } catch { return; } }
        if (!urls.includes(value)) urls.push(value);
    }
    if (Array.isArray(source)) source.forEach(v => add(typeof v === 'string' ? v : v?.url || v?.src));
    else if (source && typeof source === 'object') Object.entries(source).forEach(([key, v]) => add(/^https?:/.test(key) ? key : typeof v === 'string' ? v : v?.url || v?.src));
    return urls;
}

export default function GifRoulette(r) {
    return { start() {
        r.command({ name: 'gifroulette', description: 'Send a random favorite GIF', async execute() {
            const modules = [r.find('addFavoriteGIF'), r.find('getFavoriteGIFs'), r.find('getFavoriteGifs'), r.find('FrecencyUserSettingsActionCreators')?.FrecencyUserSettingsActionCreators,
                r.byStore('FavoriteGIFStore'), r.byStore('FrecencyUserSettingsStore'), r.find('loadIfNecessary', 'getCurrentValue')];
            for (const module of modules.filter(Boolean)) {
                if (module.loadIfNecessary) await module.loadIfNecessary();
                for (const getter of ['getCurrentValue', 'getState', 'getFavoriteGIFs', 'getFavoriteGifs', 'getFavorites']) {
                    if (typeof module[getter] !== 'function') continue;
                    const urls = gifUrls(module[getter]());
                    if (urls.length) return { content: urls[Math.floor(Math.random() * urls.length)] };
                }
                const urls = gifUrls(module); if (urls.length) return { content: urls[Math.floor(Math.random() * urls.length)] };
            }
            r.toast('No favorite GIFs found. Star a GIF in Discord first.');
        } });
    } };
}
