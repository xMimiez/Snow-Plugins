/*
  Decor — Snow spec-3 port of Equicord/Vencord Decor (FieryFlames).
  Desktop Equicord uses webpack string patches + a large profile UI.
  This is the Vendetta/mobile path: fetch Decor API, stamp users, resolve CDN URLs.
  Create-from-file and Equicord settings injection are not ported.
  Original: Fiery. Snow port: Mime | N0_.q3.
  https://github.com/Equicord/Equicord/tree/main/src/plugins/decor
  https://github.com/decor-discord/vendetta-plugin
*/
var unpatches = [];
var _storage;
var usersDecorations = {};
var fetchQueue = {};
var bulkTimer = null;
var presets = [];
var myDecorations = [];
var selectedHash = null;

var BASE_URL = "https://decor.fieryflames.dev";
var API_URL = BASE_URL + "/api";
var AUTHORIZE_URL = API_URL + "/authorize";
var CDN_URL = "https://ugc.decor.fieryflames.dev";
var CLIENT_ID = "1096966363416899624";
var SKU_ID = "100101099111114";
var RAW_SKU_ID = "11497119";

function log() {
    try { console.log.apply(console, ["[Decor]"].concat([].slice.call(arguments))); } catch (_e) {}
}
function logError() {
    try { console.error.apply(console, ["[Decor]"].concat([].slice.call(arguments))); } catch (_e) {}
}

function eachClient(fn) {
    var list = [];
    try { if (typeof snow !== "undefined" && snow) list.push(snow); } catch (_e) {}
    try { if (typeof bunny !== "undefined" && bunny) list.push(bunny); } catch (_e2) {}
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    if (g.snow) list.push(g.snow);
    if (g.bunny) list.push(g.bunny);
    if (g.vendetta) list.push(g.vendetta);
    for (var i = 0; i < list.length; i++) if (list[i]) fn(list[i]);
}

function getMod() {
    var found = null;
    eachClient(function (m) {
        if (found) return;
        if (m.api && (m.api.patcher || m.api.flux)) found = m;
    });
    if (found) return found;
    eachClient(function (m) {
        if (found) return;
        if (m.patcher || m.metro || m.plugin) found = m;
    });
    return found || {};
}

function metroRoots() {
    var roots = [];
    function add(r) { if (r && roots.indexOf(r) < 0) roots.push(r); }
    eachClient(function (m) {
        add(m.metro);
        add(m.api && m.api.metro);
        add(m.metro && m.metro.common);
    });
    return roots;
}

function findByProps() {
    var args = arguments;
    var roots = metroRoots();
    for (var i = 0; i < roots.length; i++) {
        var fn = roots[i].findByProps;
        if (!fn) continue;
        try {
            var found = fn.apply(roots[i], args);
            if (found) return found;
        } catch (_e) {}
    }
    return null;
}

function findByName(name) {
    var roots = metroRoots();
    for (var i = 0; i < roots.length; i++) {
        var fn = roots[i].findByName;
        if (!fn) continue;
        try {
            var found = fn.call(roots[i], name);
            if (found) return found;
        } catch (_e) {}
    }
    return null;
}

function findByStoreName(name) {
    var roots = metroRoots();
    for (var i = 0; i < roots.length; i++) {
        var fn = roots[i].findByStoreName;
        if (!fn) continue;
        try {
            var found = fn.call(roots[i], name);
            if (found) return found;
        } catch (_e) {}
    }
    return findByName(name);
}

function getPatcher() {
    var mod = getMod();
    if (mod.api && mod.api.patcher) return mod.api.patcher;
    if (mod.patcher) return mod.patcher;
    var found = null;
    eachClient(function (m) {
        if (found) return;
        if (m.api && m.api.patcher) found = m.api.patcher;
        else if (m.patcher) found = m.patcher;
    });
    return found;
}

function patchMethod(kind, obj, method, cb) {
    var patcher = getPatcher();
    if (!patcher || typeof patcher[kind] !== "function") return null;
    if (!obj || typeof obj[method] !== "function") return null;
    var orig = obj[method];
    try {
        var un = patcher[kind](method, obj, cb);
        if (obj[method] !== orig || typeof un === "function") return typeof un === "function" ? un : function () {};
    } catch (_e) {}
    try {
        var un2 = patcher[kind](obj, method, cb);
        if (obj[method] !== orig || typeof un2 === "function") return typeof un2 === "function" ? un2 : function () {};
    } catch (_e2) {}
    return null;
}

function getReact() {
    var found = null;
    eachClient(function (m) {
        if (found) return;
        var c = m.metro && m.metro.common;
        if (c && c.React) found = c.React;
    });
    return found
        || findByProps("createElement", "useState")
        || (typeof globalThis !== "undefined" && globalThis.React);
}

function getStorage() {
    if (_storage) return _storage;
    try { _storage = getMod().plugin.createStorage(); } catch (_e) { _storage = {}; }
    if (!_storage.tokens) _storage.tokens = {};
    return _storage;
}

function getCurrentUser() {
    var store = findByStoreName("UserStore") || findByProps("getCurrentUser", "getUser");
    return store && store.getCurrentUser ? store.getCurrentUser() : null;
}

function getToken() {
    var me = getCurrentUser();
    var store = getStorage();
    if (me && store.tokens && store.tokens[me.id]) return store.tokens[me.id];
    return store.token || null;
}

function setToken(token) {
    var store = getStorage();
    var me = getCurrentUser();
    store.token = token;
    if (!store.tokens) store.tokens = {};
    if (me) store.tokens[me.id] = token;
}

function decorationToAsset(decoration) {
    if (!decoration) return null;
    if (typeof decoration === "string") return decoration;
    return (decoration.animated ? "a_" : "") + decoration.hash;
}

function decorationToAvatar(decoration) {
    var asset = decorationToAsset(decoration);
    if (!asset) return null;
    return { asset: asset, skuId: SKU_ID };
}

function getDecorAvatarDecorationURL(avatarDecoration, canAnimate) {
    if (!avatarDecoration) return null;
    if (avatarDecoration.skuId === SKU_ID) {
        var parts = String(avatarDecoration.asset || "").split("_");
        if (!canAnimate && parts[0] === "a") parts.shift();
        return CDN_URL + "/" + parts.join("_") + ".png";
    }
    if (avatarDecoration.skuId === RAW_SKU_ID) return avatarDecoration.asset;
    return null;
}

function applyDecorationToUser(user, decorationAsset) {
    if (!user) return user;
    if (decorationAsset) {
        if (!user.avatarDecoration || user.avatarDecoration.skuId !== SKU_ID) {
            user.avatarDecoration = { asset: decorationAsset, skuId: SKU_ID };
        }
    } else if (user.avatarDecoration && user.avatarDecoration.skuId === SKU_ID) {
        user.avatarDecoration = null;
    }
    user.avatarDecorationData = user.avatarDecoration;
    return user;
}

function doFetch(url, opts) {
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    var fn = g.fetch || (typeof fetch === "function" ? fetch : null);
    if (!fn) return Promise.reject(new Error("no fetch"));
    return fn(url, opts);
}

function getUsersDecorations(ids) {
    if (ids && !ids.length) return Promise.resolve({});
    var url = API_URL + "/users";
    if (ids && ids.length) url += "?ids=" + encodeURIComponent(JSON.stringify(ids));
    return doFetch(url).then(function (r) {
        if (!r || (r.status && r.status >= 400)) throw new Error("http " + (r && r.status));
        return r.json();
    });
}

function authFetch(path, opts) {
    opts = opts || {};
    var headers = Object.assign({}, opts.headers || {}, { Authorization: "Bearer " + getToken() });
    return doFetch(API_URL + path, Object.assign({}, opts, { headers: headers })).then(function (r) {
        if (!r || !r.ok) throw new Error("http " + (r && r.status));
        return r;
    });
}

function getFluxDispatcher() {
    return findByProps("_currentDispatchActionType", "_subscriptions", "_actionHandlers", "_waitQueue")
        || findByProps("dispatch", "subscribe", "unsubscribe");
}

function stampUserFromStore(userId, decoration) {
    var store = findByStoreName("UserStore") || findByProps("getUser", "getCurrentUser");
    var user = store && store.getUser ? store.getUser(userId) : null;
    if (!user) return;
    applyDecorationToUser(user, decoration);
    var Flux = getFluxDispatcher();
    if (Flux && typeof Flux.dispatch === "function") {
        try { Flux.dispatch({ type: "USER_UPDATE", user: user }); } catch (_e) {}
    }
}

function bulkFetch() {
    bulkTimer = null;
    var ids = Object.keys(fetchQueue);
    fetchQueue = {};
    if (!ids.length) return Promise.resolve();
    return getUsersDecorations(ids).then(function (map) {
        map = map || {};
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            var deco = Object.prototype.hasOwnProperty.call(map, id) ? map[id] : null;
            usersDecorations[id] = deco;
            if (deco) stampUserFromStore(id, deco);
        }
        log("fetched", ids.length, "users");
    }).catch(function (err) {
        logError("bulkFetch", err);
    });
}

function queueFetch(userId, force) {
    if (!userId) return;
    if (!force && Object.prototype.hasOwnProperty.call(usersDecorations, userId)) return;
    fetchQueue[userId] = true;
    if (bulkTimer) return;
    bulkTimer = setTimeout(bulkFetch, 250);
}

function queueMany(userIds) {
    if (!userIds || !userIds.length) return;
    for (var i = 0; i < userIds.length; i++) queueFetch(userIds[i], false);
}

function loadConfig() {
    return doFetch(API_URL + "/config").then(function (r) { return r && r.json ? r.json() : null; }).then(function (cfg) {
        if (!cfg) return;
        if (cfg.CDN_URL) CDN_URL = cfg.CDN_URL;
        if (cfg.CLIENT_ID) CLIENT_ID = cfg.CLIENT_ID;
        log("config", CDN_URL);
    }).catch(function () {});
}

function handleFlux(event) {
    if (!event) return;
    var type = event.type;
    if (type === "CONNECTION_OPEN") {
        var me = getCurrentUser();
        if (me) queueFetch(me.id, true);
        return;
    }
    if (type === "USER_PROFILE_MODAL_OPEN" && event.userId) {
        queueFetch(event.userId, true);
        return;
    }
    if (type === "LOAD_MESSAGES_SUCCESS" && event.messages) {
        queueMany(event.messages.map(function (m) { return m && m.author && m.author.id; }).filter(Boolean));
        return;
    }
    if (type === "MESSAGE_CREATE") {
        var msg = event.message || event;
        var author = msg && msg.author;
        if (author && author.id) queueFetch(author.id, false);
        return;
    }
    if (type === "TYPING_START" && event.userId) queueFetch(event.userId, false);
}

function patchStores() {
    var UserStore = findByStoreName("UserStore") || findByProps("getUser", "getCurrentUser");
    if (UserStore) {
        var un = patchMethod("after", UserStore, "getUser", function (_args, user) {
            if (user && Object.prototype.hasOwnProperty.call(usersDecorations, user.id)) {
                applyDecorationToUser(user, usersDecorations[user.id]);
            }
            return user;
        });
        if (un) {
            unpatches.push(un);
            log("patched UserStore.getUser");
        }
    }
    var resolver = findByProps("getAvatarDecorationURL", "getUserAvatarURL")
        || findByProps("getAvatarDecorationURL");
    if (resolver && typeof resolver.getAvatarDecorationURL === "function") {
        var unUrl = patchMethod("instead", resolver, "getAvatarDecorationURL", function (args, orig) {
            var opts = args && args[0];
            var custom = opts && getDecorAvatarDecorationURL(opts.avatarDecoration, opts.canAnimate);
            if (custom) return custom;
            return orig.apply(resolver, args);
        });
        if (unUrl) {
            unpatches.push(unUrl);
            log("patched getAvatarDecorationURL");
        }
    }
}

function subscribeFlux() {
    var mod = getMod();
    if (mod.api && mod.api.flux && typeof mod.api.flux.intercept === "function") {
        unpatches.push(mod.api.flux.intercept(handleFlux));
        log("flux.intercept");
    }
    var Flux = getFluxDispatcher();
    if (Flux && typeof Flux.subscribe === "function") {
        var types = ["CONNECTION_OPEN", "USER_PROFILE_MODAL_OPEN", "LOAD_MESSAGES_SUCCESS", "MESSAGE_CREATE", "TYPING_START"];
        types.forEach(function (t) {
            var fn = function (payload) { handleFlux(Object.assign({ type: t }, payload)); };
            Flux.subscribe(t, fn);
            unpatches.push(function () { try { Flux.unsubscribe(t, fn); } catch (_e) {} });
        });
        log("FluxDispatcher.subscribe");
    }
}

function showToast(message) {
    var t = findByProps("showToast") || (getMod().ui && getMod().ui.toasts);
    if (t && t.showToast) {
        try { t.showToast(message); return; } catch (_e) {}
    }
    log("toast", message);
}

function hideSheet() {
    var Lazy = findByProps("hideActionSheet", "openLazy");
    try { if (Lazy && Lazy.hideActionSheet) Lazy.hideActionSheet(); } catch (_e) {}
}

function getWebView() {
    var named = findByName("WebView");
    if (named) return named;
    var mod = findByProps("WebView");
    if (!mod) return null;
    if (typeof mod.WebView === "function") return mod.WebView;
    if (mod.default && typeof mod.default === "function") return mod.default;
    return null;
}

function discordAuthorizeUrl() {
    return "https://discord.com/api/oauth2/authorize"
        + "?client_id=" + encodeURIComponent(CLIENT_ID)
        + "&redirect_uri=" + encodeURIComponent(AUTHORIZE_URL)
        + "&response_type=code&scope=identify";
}

function finishAuthFromRedirect(location) {
    var url = String(location || "");
    if (!url || url.indexOf(AUTHORIZE_URL) !== 0) return false;
    if (url.indexOf("code=") < 0 && url.indexOf("error=") < 0) return false;
    if (url.indexOf("client=") < 0) url += (url.indexOf("?") >= 0 ? "&" : "?") + "client=snow";
    doFetch(url).then(function (r) { return r.text(); }).then(function (token) {
        token = String(token || "").trim();
        if (!token || token.length < 8) throw new Error("empty token");
        setToken(token);
        hideSheet();
        showToast("Decor authorized");
        refreshMine();
        log("authorized");
    }).catch(function (err) {
        logError("authorize", err);
        showToast("Decor authorize failed");
    });
    return true;
}

function authorize() {
    var React = getReact();
    var Lazy = findByProps("openLazy", "hideActionSheet");
    var WebView = getWebView();
    var uri = discordAuthorizeUrl();
    if (React && Lazy && typeof Lazy.openLazy === "function" && WebView) {
        var handled = false;
        function AuthSheet() {
            return React.createElement(WebView, {
                source: { uri: uri },
                originWhitelist: ["*"],
                style: { height: 520, width: "100%" },
                onNavigationStateChange: function (nav) {
                    if (handled || !nav || !nav.url) return;
                    if (finishAuthFromRedirect(nav.url)) handled = true;
                },
                onShouldStartLoadWithRequest: function (req) {
                    var u = req && req.url;
                    if (u && u.indexOf(AUTHORIZE_URL) === 0) {
                        if (!handled) {
                            handled = true;
                            finishAuthFromRedirect(u);
                        }
                        return false;
                    }
                    return true;
                }
            });
        }
        try {
            Lazy.openLazy(Promise.resolve({ default: AuthSheet }), "ActionSheet");
            log("opened WebView authorize");
            return;
        } catch (err) {
            logError("openLazy authorize", err);
        }
    }
    var Linking = findByProps("openURL", "openDeeplink") || findByProps("openURL");
    if (Linking && typeof Linking.openURL === "function") {
        try { Linking.openURL(uri); } catch (_e2) {}
        showToast("Finish login, then paste the Decor token in settings");
        return;
    }
    showToast("No WebView — paste a Decor token in settings");
}

function refreshMine() {
    if (!getToken()) return Promise.resolve();
    return Promise.all([
        authFetch("/users/@me/decorations").then(function (r) { return r.json(); }).catch(function () { return []; }),
        authFetch("/users/@me/decoration").then(function (r) { return r.json(); }).catch(function () { return null }),
        doFetch(API_URL + "/decorations/presets").then(function (r) { return r.json(); }).catch(function () { return []; })
    ]).then(function (parts) {
        myDecorations = parts[0] || [];
        var selected = parts[1];
        selectedHash = selected && selected.hash ? selected.hash : null;
        presets = parts[2] || [];
        log("mine", myDecorations.length, "presets", presets.length);
    });
}

function selectDecoration(decoration) {
    if (!getToken()) {
        showToast("Authorize with Decor first");
        return Promise.resolve();
    }
    var body = new FormData();
    if (!decoration) body.append("hash", "null");
    else body.append("hash", decoration.hash);
    return authFetch("/users/@me/decoration", { method: "PUT", body: body }).then(function () {
        selectedHash = decoration ? decoration.hash : null;
        var me = getCurrentUser();
        var asset = decoration ? decorationToAsset(decoration) : null;
        if (me) {
            applyDecorationToUser(me, asset);
            if (me.id) usersDecorations[me.id] = asset;
            stampUserFromStore(me.id, asset);
        }
        showToast(decoration ? "Decoration applied" : "Decoration cleared");
    }).catch(function (err) {
        logError("select", err);
        showToast("Failed to apply decoration");
    });
}

function start() {
    stop();
    patchStores();
    subscribeFlux();
    loadConfig();
    var me = getCurrentUser();
    if (me) queueFetch(me.id, true);
    if (getToken()) refreshMine();
    log("started");
}

function stop() {
    if (bulkTimer) {
        try { clearTimeout(bulkTimer); } catch (_e) {}
        bulkTimer = null;
    }
    for (var i = 0; i < unpatches.length; i++) {
        try { if (typeof unpatches[i] === "function") unpatches[i](); } catch (_e2) {}
    }
    unpatches = [];
}

function SettingsComponent() {
    var React = getReact();
    if (!React) return null;
    var comps = (getMod().metro && getMod().metro.common && getMod().metro.common.components) || {};
    var TableRowGroup = comps.TableRowGroup;
    var TableRow = comps.TableRow;
    var Button = comps.Button || comps.LegacyButton;
    var [, bump] = React.useState(0);
    function refresh() { bump(function (n) { return n + 1; }); }
    var children = [];
    var authorized = !!getToken();
    var TextInput = comps.TextInput;
    if (TextInput) {
        children.push(React.createElement(TextInput, {
            key: "paste",
            label: "Decor token (paste if WebView cannot finish)",
            value: getToken() || "",
            onChange: function (v) { setToken(v); refresh(); },
            onChangeText: function (v) { setToken(v); refresh(); }
        }));
    }
    if (Button) {
        children.push(React.createElement(Button, {
            key: "auth",
            text: authorized ? "Re-authorize Decor" : "Authorize with Decor",
            onPress: function () { authorize(); setTimeout(refresh, 1500); }
        }));
        if (authorized) {
            children.push(React.createElement(Button, {
                key: "clear",
                text: "Clear my decoration",
                onPress: function () { selectDecoration(null).then(refresh); }
            }));
            children.push(React.createElement(Button, {
                key: "reload",
                text: "Reload presets",
                onPress: function () { refreshMine().then(refresh); }
            }));
        }
    }
    function addDeco(d, prefix) {
        if (!d || !d.hash || !TableRow) return;
        children.push(React.createElement(TableRow, {
            key: prefix + d.hash,
            label: (d.alt || d.hash) + (selectedHash === d.hash ? " (selected)" : ""),
            onPress: function () { selectDecoration(d).then(refresh); }
        }));
    }
    var i;
    for (i = 0; i < myDecorations.length; i++) addDeco(myDecorations[i], "mine-");
    for (i = 0; i < presets.length; i++) {
        var p = presets[i];
        var decos = (p && p.decorations) || [];
        for (var j = 0; j < decos.length; j++) addDeco(decos[j], "pre-");
    }
    if (TableRowGroup) return React.createElement(TableRowGroup, { title: "Decor" }, children);
    var RN = findByProps("View", "Text");
    if (RN && RN.View) return React.createElement(RN.View, { style: { padding: 12 } }, children);
    return children[0] || null;
}

const plugin = definePlugin({
    start: start,
    stop: stop,
    onLoad: start,
    onUnload: stop,
    SettingsComponent: SettingsComponent,
    settings: SettingsComponent,
    SKU_ID: SKU_ID,
    RAW_SKU_ID: RAW_SKU_ID,
    getDecorAvatarDecorationURL: getDecorAvatarDecorationURL,
    decorationToAsset: decorationToAsset,
    applyDecorationToUser: applyDecorationToUser,
    queueFetch: queueFetch,
    handleFlux: handleFlux
});
