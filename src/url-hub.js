const KEY = Symbol.for('mime.snow.urlHandlers.v1');

function install(target, method, hub) {
    if (!target || typeof target[method] !== 'function' || target[method] === hub.wrapper) return;
    const original = target[method];
    const wrapper = function (...args) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || args[0]?.uri;
        if (url) for (const entry of [...hub.handlers]) {
            try { if (entry.handler(url, () => original.apply(this, args))) return; }
            catch (error) { entry.r.error('Open link', error); }
        }
        return original.apply(this, args);
    };
    hub.restores.push(() => { if (target[method] === wrapper) target[method] = original; });
    target[method] = wrapper;
}

export function addUrlHandler(r, priority, handler) {
    let hub = globalThis[KEY];
    if (!hub) {
        hub = { handlers: [], restores: [] };
        const urlMod = r.common.url?.openURL ? r.common.url : r.find('openURL', 'openDeeplink') || r.find('openURL', 'handleURL');
        install(urlMod, 'openURL', hub);
        install(urlMod, 'openDeeplink', hub);
        install(urlMod, 'handleURL', hub);
        install(r.RN.Linking, 'openURL', hub);
        const linkingMod = r.find('openURL', 'canOpenURL');
        if (linkingMod !== urlMod && linkingMod !== r.RN.Linking) install(linkingMod, 'openURL', hub);
        if (!hub.restores.length) throw new Error('This Discord build has no supported openURL module');
        globalThis[KEY] = hub;
    }
    const entry = { r, priority, handler };
    hub.handlers.push(entry);
    hub.handlers.sort((a, b) => b.priority - a.priority);
    r.own(() => {
        hub.handlers = hub.handlers.filter(item => item !== entry);
        if (!hub.handlers.length) {
            for (const restore of hub.restores) try { restore(); } catch {}
            delete globalThis[KEY];
        }
    });
}

export function openExternal(r, url) {
    return r.RN.Linking.openURL(url);
}
