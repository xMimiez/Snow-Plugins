// One host URL patch shared by these plugins; handlers are removed independently.
const KEY = Symbol.for('mime.snow.urlHandlers.v1');
export function addUrlHandler(r, priority, handler) {
    let hub = globalThis[KEY];
    if (!hub) {
        const target = r.common.url?.openURL ? r.common.url : r.find('openURL', 'openDeeplink');
        if (!target?.openURL) throw new Error('This Discord build has no supported openURL module');
        hub = { handlers: [], original: target.openURL, target };
        hub.wrapper = function (...args) {
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
            if (url) for (const entry of [...hub.handlers]) {
                try { if (entry.handler(url, () => hub.original.apply(this, args))) return; }
                catch (error) { entry.r.error('Open link', error); }
            }
            return hub.original.apply(this, args);
        };
        target.openURL = hub.wrapper; globalThis[KEY] = hub;
    }
    const entry = { r, priority, handler }; hub.handlers.push(entry); hub.handlers.sort((a,b) => b.priority-a.priority);
    r.own(() => { hub.handlers = hub.handlers.filter(x => x !== entry); if (!hub.handlers.length) { if (hub.target.openURL === hub.wrapper) hub.target.openURL = hub.original; delete globalThis[KEY]; } });
}
export function openExternal(r, url) { return r.RN.Linking.openURL(url); }
