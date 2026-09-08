/*
  Decor — Snow spec-3 port of Equicord/Vencord/Rain/Vendetta Decor (FieryFlames).
  Desktop Equicord uses webpack string patches + a large profile UI.
  Mobile: fetch Decor API, stamp users, resolve CDN URLs, and replace Discord's
  official avatar-decoration slot in Edit Profile with Decor's picker.
  Equipping goes through Decor's API so other Decor users see it.
  Original: Fiery. Rain/Vendetta UI. Snow port: Mime | N0_.q3.
  https://github.com/Equicord/Equicord/tree/main/src/plugins/decor
  https://github.com/decor-discord/vendetta-plugin
  https://codeberg.org/raincord/rain/src/commit/333142c78140586c458002bda0f502e7d4053fdf/src/plugins/decor
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

function findByName(name, expDefault) {
    if (expDefault === undefined) expDefault = true;
    var roots = metroRoots();
    for (var i = 0; i < roots.length; i++) {
        var fn = roots[i].findByName;
        if (!fn) continue;
        try {
            var found = fn.call(roots[i], name, expDefault);
            if (found) return found;
        } catch (_e) {
            try {
                var found2 = fn.call(roots[i], name);
                if (found2) return found2;
            } catch (_e2) {}
        }
    }
    return null;
}

function findByDisplayName(name, expDefault) {
    if (expDefault === undefined) expDefault = true;
    var roots = metroRoots();
    for (var i = 0; i < roots.length; i++) {
        var fn = roots[i].findByDisplayName;
        if (!fn) continue;
        try {
            var found = fn.call(roots[i], name, expDefault);
            if (found) return found;
        } catch (_e) {}
    }
    return null;
}

function findByTypeName(name, expDefault) {
    if (expDefault === undefined) expDefault = true;
    var roots = metroRoots();
    for (var i = 0; i < roots.length; i++) {
        var fn = roots[i].findByTypeName;
        if (!fn) continue;
        try {
            var found = fn.call(roots[i], name, expDefault);
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

function getRN() {
    var found = null;
    eachClient(function (m) {
        if (found) return;
        var c = m.metro && m.metro.common;
        if (c && c.ReactNative) found = c.ReactNative;
    });
    return found || findByProps("View", "Text", "Image") || findByProps("View", "Text");
}

function getDiscordToken() {
    var auth = findByProps("getToken");
    try {
        if (auth && typeof auth.getToken === "function") return auth.getToken();
    } catch (_e) {}
    return null;
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
        user.avatarDecoration = { asset: decorationAsset, skuId: SKU_ID };
    } else if (user.avatarDecoration && (user.avatarDecoration.skuId === SKU_ID || user.avatarDecoration.skuId === RAW_SKU_ID)) {
        user.avatarDecoration = null;
    }
    user.avatarDecorationData = user.avatarDecoration;
    user.avatar_decoration_data = user.avatarDecoration;
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
    var token = getToken();
    if (!token) return Promise.reject(new Error("unauthorized"));
    var headers = Object.assign({}, opts.headers || {}, { Authorization: "Bearer " + token });
    return doFetch(API_URL + path, Object.assign({}, opts, { headers: headers })).then(function (r) {
        if (r && r.status === 401) {
            setToken(null);
            throw new Error("unauthorized");
        }
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

function stampIfKnown(user) {
    if (!user || !user.id) return user;
    if (Object.prototype.hasOwnProperty.call(usersDecorations, user.id)) {
        applyDecorationToUser(user, usersDecorations[user.id]);
    } else {
        queueFetch(user.id, false);
    }
    return user;
}

function handleFlux(event) {
    if (!event) return;
    var type = event.type;
    if (type === "CONNECTION_OPEN") {
        var me = getCurrentUser();
        if (me) queueFetch(me.id, true);
        if (event.user) stampIfKnown(event.user);
        if (event.users) {
            var list = Array.isArray(event.users) ? event.users : [];
            queueMany(list.map(function (u) { return u && u.id; }).filter(Boolean));
            for (var i = 0; i < list.length; i++) stampIfKnown(list[i]);
        }
        if (getToken()) refreshMine();
        return;
    }
    if ((type === "USER_UPDATE" || type === "CURRENT_USER_UPDATE") && event.user) {
        stampIfKnown(event.user);
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

function decorationUrlFromOpts(opts) {
    if (!opts) return null;
    var uid = opts.userId || (opts.user && opts.user.id);
    if (uid && Object.prototype.hasOwnProperty.call(usersDecorations, uid) && usersDecorations[uid]) {
        return getDecorAvatarDecorationURL({ asset: usersDecorations[uid], skuId: SKU_ID }, opts.canAnimate);
    }
    return getDecorAvatarDecorationURL(opts.avatarDecoration, opts.canAnimate);
}

function patchUrlResolver(resolver) {
    if (!resolver || typeof resolver.getAvatarDecorationURL !== "function") return;
    var unUrl = patchMethod("instead", resolver, "getAvatarDecorationURL", function (args, orig) {
        var custom = decorationUrlFromOpts(args && args[0]);
        if (custom) return custom;
        return orig.apply(resolver, args);
    });
    if (unUrl) {
        unpatches.push(unUrl);
        log("patched getAvatarDecorationURL");
    }
}

function patchStores() {
    var UserStore = findByStoreName("UserStore") || findByProps("getUser", "getCurrentUser");
    if (UserStore) {
        var un = patchMethod("after", UserStore, "getUser", function (_args, user) {
            return stampIfKnown(user);
        });
        if (un) {
            unpatches.push(un);
            log("patched UserStore.getUser");
        }
        if (typeof UserStore.getCurrentUser === "function") {
            var unMe = patchMethod("after", UserStore, "getCurrentUser", function (_args, user) {
                return stampIfKnown(user);
            });
            if (unMe) unpatches.push(unMe);
        }
    }
    var resolver = findByProps("getAvatarDecorationURL", "getUserAvatarURL")
        || findByProps("getAvatarDecorationURL");
    patchUrlResolver(resolver);
    if (resolver && resolver.default) patchUrlResolver(resolver.default);
    var anim = findByProps("isAnimatedAvatarDecoration");
    if (anim && typeof anim.isAnimatedAvatarDecoration === "function") {
        var unAnim = patchMethod("after", anim, "isAnimatedAvatarDecoration", function (args, ret) {
            var d = args && args[0];
            var asset = d && (d.asset || d);
            if (typeof asset === "string" && asset.indexOf("a_") === 0) return true;
            return ret;
        });
        if (unAnim) unpatches.push(unAnim);
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
    return "https://discord.com/oauth2/authorize"
        + "?client_id=" + encodeURIComponent(CLIENT_ID)
        + "&redirect_uri=" + encodeURIComponent(AUTHORIZE_URL)
        + "&response_type=code&scope=identify";
}

function decoImageUri(decoration) {
    var asset = decorationToAsset(decoration);
    if (!asset) return null;
    return CDN_URL + "/" + asset + ".png";
}

function isLikelyJwt(token) {
    token = String(token || "").trim();
    if (!token || token.length < 16) return false;
    if (token.charAt(0) === "<" || token.indexOf("<!DOCTYPE") >= 0 || token.indexOf("{") === 0) return false;
    return token.split(".").length >= 2;
}

function exchangeDecorToken(location) {
    var url = String(location || "");
    if (!url) return Promise.reject(new Error("no location"));
    if (url.indexOf("http") !== 0 && url.charAt(0) === "/") url = "https://discord.com" + url;
    if (url.indexOf(AUTHORIZE_URL) !== 0 && url.indexOf("code=") < 0) {
        return Promise.reject(new Error("not a Decor redirect"));
    }
    function stripClient(u) {
        return u.replace(/([?&])client=[^&]*/g, "$1").replace(/[?&]$/, "").replace("?&", "?");
    }
    function tryClient(client) {
        var u = stripClient(url);
        u += (u.indexOf("?") >= 0 ? "&" : "?") + "client=" + encodeURIComponent(client);
        return doFetch(u).then(function (r) { return r.text(); }).then(function (token) {
            token = String(token || "").trim();
            if (!isLikelyJwt(token)) throw new Error("bad token for " + client);
            setToken(token);
            hideSheet();
            showToast("Decor authorized");
            log("authorized", client);
            return refreshMine();
        });
    }
    return tryClient("snow")
        .catch(function () { return tryClient("vendetta"); })
        .catch(function () { return tryClient("vencord"); })
        .catch(function () { return tryClient("rain"); });
}

function finishAuthFromRedirect(location) {
    var url = String(location || "");
    if (!url) return false;
    var isDecor = url.indexOf(AUTHORIZE_URL) === 0 || (url.indexOf("decor.fieryflames.dev") >= 0 && url.indexOf("code=") >= 0);
    if (!isDecor) return false;
    if (url.indexOf("code=") < 0 && url.indexOf("error=") < 0) return false;
    exchangeDecorToken(url).catch(function (err) {
        logError("authorize", err);
        showToast("Decor authorize failed");
    });
    return true;
}

function authorizeSilent() {
    var discordToken = getDiscordToken();
    if (!discordToken) return Promise.reject(new Error("no Discord token"));
    var qs = "client_id=" + encodeURIComponent(CLIENT_ID)
        + "&response_type=code"
        + "&redirect_uri=" + encodeURIComponent(AUTHORIZE_URL)
        + "&scope=identify";
    function post(body) {
        return doFetch("https://discord.com/api/v9/oauth2/authorize?" + qs, {
            method: "POST",
            headers: {
                Authorization: discordToken,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });
    }
    return post({ authorize: true, permissions: "0", integration_type: 0 }).then(function (r) {
        if (r && (r.status === 400 || r.status === 422)) {
            return post({ authorize: true, permissions: "0" });
        }
        return r;
    }).then(function (r) {
        if (!r || !r.ok) throw new Error("http " + (r && r.status));
        return r.json();
    }).then(function (data) {
        var loc = data && (data.location || data.redirect_to || data.redirect_uri);
        if (!loc) throw new Error("no redirect");
        return exchangeDecorToken(loc);
    });
}

function ensureAuth() {
    if (getToken()) return Promise.resolve(getToken());
    return authorizeSilent().catch(function (err) {
        logError("ensureAuth", err);
        return null;
    });
}

function authorizeWebView() {
    var React = getReact();
    var Lazy = findByProps("openLazy", "hideActionSheet");
    var WebView = getWebView();
    var Sheet = findByProps("ActionSheet");
    var uri = discordAuthorizeUrl();
    if (React && Lazy && typeof Lazy.openLazy === "function" && WebView) {
        var handled = false;
        function AuthSheet() {
            var web = React.createElement(WebView, {
                source: { uri: uri },
                originWhitelist: ["*"],
                incognito: false,
                sharedCookiesEnabled: true,
                thirdPartyCookiesEnabled: true,
                style: { height: 520, width: "100%", backgroundColor: "#2b2d31" },
                onNavigationStateChange: function (nav) {
                    if (handled || !nav || !nav.url) return;
                    if (finishAuthFromRedirect(nav.url)) handled = true;
                },
                onShouldStartLoadWithRequest: function (req) {
                    var u = req && req.url;
                    if (u && (u.indexOf(AUTHORIZE_URL) === 0 || (u.indexOf("decor.fieryflames.dev") >= 0 && u.indexOf("code=") >= 0))) {
                        if (!handled) {
                            handled = true;
                            finishAuthFromRedirect(u);
                        }
                        return false;
                    }
                    return true;
                }
            });
            if (Sheet && Sheet.ActionSheet) return React.createElement(Sheet.ActionSheet, null, web);
            return web;
        }
        try {
            Lazy.openLazy(Promise.resolve({ default: AuthSheet }), "ActionSheet");
            log("opened WebView authorize");
            return true;
        } catch (err) {
            logError("openLazy authorize", err);
        }
    }
    return false;
}

function authorize() {
    showToast("Authorizing Decor…");
    return authorizeSilent().catch(function (err) {
        logError("silent auth", err);
        if (authorizeWebView()) return;
        var Linking = findByProps("openURL", "openDeeplink") || findByProps("openURL");
        if (Linking && typeof Linking.openURL === "function") {
            try { Linking.openURL(discordAuthorizeUrl()); } catch (_e2) {}
            showToast("Finish login, then paste the Decor token in settings");
            return;
        }
        showToast("Could not authorize — paste a Decor token in settings");
    });
}

function normalizePresets(p) {
    if (!p) return [];
    if (Array.isArray(p)) return p;
    if (Array.isArray(p.presets)) return p.presets;
    if (Array.isArray(p.data)) return p.data;
    if (Array.isArray(p.results)) return p.results;
    return [];
}

function loadPresets() {
    return doFetch(API_URL + "/decorations/presets").then(function (r) { return r.json(); }).then(function (p) {
        presets = normalizePresets(p);
        log("presets", presets.length);
        return presets;
    }).catch(function (err) {
        logError("presets", err);
        presets = [];
        return [];
    });
}

function applySelectedLocally(decoration) {
    selectedHash = decoration && decoration.hash ? decoration.hash : null;
    var me = getCurrentUser();
    var asset = decoration ? decorationToAsset(decoration) : null;
    if (me && me.id) {
        usersDecorations[me.id] = asset;
        applyDecorationToUser(me, asset);
        stampUserFromStore(me.id, asset);
        var Flux = getFluxDispatcher();
        if (Flux && typeof Flux.dispatch === "function") {
            try { Flux.dispatch({ type: "CURRENT_USER_UPDATE", user: me }); } catch (_e) {}
            try { Flux.dispatch({ type: "USER_UPDATE", user: me }); } catch (_e2) {}
        }
    }
}

function refreshMine() {
    var jobs = [loadPresets()];
    if (getToken()) {
        jobs.push(authFetch("/users/@me/decorations").then(function (r) { return r.json(); }).catch(function () { return []; }));
        jobs.push(authFetch("/users/@me/decoration").then(function (r) { return r.json(); }).catch(function () { return null; }));
    }
    return Promise.all(jobs).then(function (parts) {
        if (parts[1]) myDecorations = Array.isArray(parts[1]) ? parts[1] : [];
        if (parts[2] !== undefined) {
            var selected = parts[2];
            applySelectedLocally(selected && selected.hash ? selected : null);
        }
        log("mine", myDecorations.length, "presets", presets.length);
    }).catch(function (err) {
        if (String(err && err.message) === "unauthorized" && !refreshMine._retrying) {
            refreshMine._retrying = true;
            return ensureAuth().then(function (tok) {
                refreshMine._retrying = false;
                if (tok) return refreshMine();
            }).catch(function () { refreshMine._retrying = false; });
        }
        logError("refreshMine", err);
    });
}

function putDecoration(decoration) {
    var hash = decoration && decoration.hash ? decoration.hash : null;
    var body = new FormData();
    body.append("hash", hash == null ? "null" : hash);
    return authFetch("/users/@me/decoration", { method: "PUT", body: body }).catch(function () {
        return authFetch("/users/@me/decoration", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hash: hash })
        });
    });
}

function selectDecoration(decoration) {
    var run = function () {
        if (!getToken()) {
            showToast("Authorize with Decor first");
            return Promise.resolve();
        }
        return putDecoration(decoration).then(function () {
            applySelectedLocally(decoration);
            showToast(decoration ? "Decoration applied" : "Decoration cleared");
        }).catch(function (err) {
            logError("select", err);
            if (String(err && err.message) === "unauthorized") {
                return authorizeSilent().then(function () { return putDecoration(decoration); }).then(function () {
                    applySelectedLocally(decoration);
                    showToast(decoration ? "Decoration applied" : "Decoration cleared");
                }).catch(function () {
                    authorize();
                    showToast("Authorize with Decor, then tap again");
                });
            }
            showToast("Failed to apply decoration");
        });
    };
    if (!getToken()) {
        return authorizeSilent().then(run).catch(function () {
            authorize();
            return Promise.resolve();
        });
    }
    return run();
}

function h(type, props) {
    var React = getReact();
    if (!React) return null;
    var kids = [].slice.call(arguments, 2);
    if (kids.length === 1 && Array.isArray(kids[0])) kids = kids[0];
    var clean = [];
    for (var i = 0; i < kids.length; i++) {
        if (kids[i] != null && kids[i] !== false) clean.push(kids[i]);
    }
    if (clean.length === 0) return React.createElement(type, props);
    if (clean.length === 1) return React.createElement(type, props, clean[0]);
    return React.createElement.apply(React, [type, props].concat(clean));
}

function findAssetId(name) {
    var roots = metroRoots();
    var i;
    for (i = 0; i < roots.length; i++) {
        var api = roots[i];
        try {
            if (api.assets && typeof api.assets.findAssetId === "function") {
                var id = api.assets.findAssetId(name);
                if (id != null) return id;
            }
        } catch (_e) {}
    }
    var mod = getMod();
    try {
        if (mod.api && mod.api.assets && typeof mod.api.assets.findAssetId === "function") {
            var id2 = mod.api.assets.findAssetId(name);
            if (id2 != null) return id2;
        }
    } catch (_e2) {}
    var byName = findByProps("getAssetByName") || findByProps("registerAsset");
    try {
        if (byName && typeof byName.getAssetByName === "function") {
            var asset = byName.getAssetByName(name);
            if (asset && asset.id != null) return asset.id;
            if (typeof asset === "number") return asset;
        }
    } catch (_e3) {}
    return name;
}

function typeNameOf(node) {
    if (!node) return "";
    var t = node.type;
    if (!t) return "";
    if (typeof t === "string") return t;
    return String((t.displayName || t.name || (t.type && (t.type.displayName || t.type.name)) || ""));
}

function isOfficialDecorNode(node) {
    if (!node || typeof node !== "object" || !node.props) return false;
    if (node.props.__mimeDecor) return false;
    if (node.key === "mime-decor-picker") return false;
    var n = typeNameOf(node);
    if (/AvatarDecoration|DecorationPreview|CollectiblesAvatar|EditAvatarDecoration|AvatarDecorationSetting/i.test(n)) return true;
    var p = node.props;
    if (p.pendingAvatarDecoration !== undefined) return true;
    if (p.avatarDecoration !== undefined && (p.onSelectAvatarDecoration || p.setPendingAvatarDecoration || p.onChangeAvatarDecoration || p.onAvatarDecorationChange)) return true;
    if (p.section === "decoration" || p.id === "decoration" || p.setting === "decoration") return true;
    var label = p.label || p.title || p.heading;
    if (typeof label === "string" && /avatar decoration/i.test(label)) return true;
    return false;
}

function injectDecorAboveOfficial(node, pickerEl) {
    if (!node || typeof node !== "object" || !pickerEl) return false;
    if (node.props && node.props.__mimeDecor) return true;
    var kids = node.props && node.props.children;
    if (kids == null) return false;
    var isArr = Array.isArray(kids);
    var arr = isArr ? kids : [kids];
    var already = false;
    var idx = -1;
    var i;
    for (i = 0; i < arr.length; i++) {
        var c = arr[i];
        if (c && ((c.props && c.props.__mimeDecor) || c.key === "mime-decor-picker")) already = true;
        if (idx < 0 && isOfficialDecorNode(c)) idx = i;
    }
    if (already) return true;
    if (idx >= 0) {
        var next = arr.slice();
        next[idx] = pickerEl;
        node.props.children = isArr ? next : (next.length === 1 ? next[0] : next);
        return true;
    }
    for (i = 0; i < arr.length; i++) {
        if (injectDecorAboveOfficial(arr[i], pickerEl)) return true;
    }
    return false;
}

function wrapExport(obj, key, afterFn) {
    var orig = obj[key];
    if (typeof orig !== "function") return null;
    if (orig.__mimeDecorWrapped) return null;
    function wrapped() {
        var ret = orig.apply(this, arguments);
        try {
            var next = afterFn(arguments, ret);
            if (next !== undefined) ret = next;
        } catch (err) {
            logError("wrap", key, err);
        }
        return ret;
    }
    wrapped.__mimeDecorWrapped = true;
    try { Object.defineProperty(wrapped, "name", { value: orig.name }); } catch (_e) {}
    wrapped.displayName = orig.displayName || orig.name;
    try {
        Object.keys(orig).forEach(function (k) {
            try { wrapped[k] = orig[k]; } catch (_e2) {}
        });
    } catch (_e3) {}
    obj[key] = wrapped;
    unpatches.push(function () {
        if (obj[key] === wrapped) obj[key] = orig;
    });
    return true;
}

function wrapComponentModule(mod, afterFn) {
    if (!mod || typeof mod === "function") return false;
    var ok = false;
    if (typeof mod.default === "function" && wrapExport(mod, "default", afterFn)) ok = true;
    if (typeof mod.type === "function" && wrapExport(mod, "type", afterFn)) ok = true;
    if (mod.prototype && typeof mod.prototype.render === "function" && wrapExport(mod.prototype, "render", afterFn)) ok = true;
    return ok;
}

function makePickerEl() {
    var React = getReact();
    if (!React) return null;
    return React.createElement(EditProfileDecorBlock, { key: "mime-decor-picker", __mimeDecor: true });
}

function onEditProfileRender(_args, ret) {
    if (!ret) return ret;
    var picker = makePickerEl();
    if (picker) injectDecorAboveOfficial(ret, picker);
    return ret;
}

function onOfficialDecorRender(_args, _ret) {
    var picker = makePickerEl();
    return picker || _ret;
}

function patchNamedComponent(name, afterFn) {
    afterFn = afterFn || onEditProfileRender;
    var roots = metroRoots();
    var i;
    for (i = 0; i < roots.length; i++) {
        var r = roots[i];
        var raw = null;
        try { if (r.findByName) raw = r.findByName(name, false); } catch (_e) {}
        if (raw && wrapComponentModule(raw, afterFn)) {
            log("patched", name);
            return true;
        }
        try { if (r.findByDisplayName) raw = r.findByDisplayName(name, false); } catch (_e2) {}
        if (raw && wrapComponentModule(raw, afterFn)) {
            log("patched display", name);
            return true;
        }
        try { if (r.findByTypeName) raw = r.findByTypeName(name, false); } catch (_e3) {}
        if (raw && wrapComponentModule(raw, afterFn)) {
            log("patched type", name);
            return true;
        }
    }
    var named = findByName(name, false) || findByDisplayName(name, false) || findByTypeName(name, false);
    if (named && wrapComponentModule(named, afterFn)) {
        log("patched fallback", name);
        return true;
    }
    return false;
}

function patchEditProfile() {
    var screens = [
        "EditProfile",
        "EditProfileScreen",
        "UserSettingsEditProfile",
        "UserSettingsEditProfileScreen",
        "EditCurrentUserProfile",
        "UserProfileEdit",
        "UserProfileEditScreen",
        "ProfileEditForm",
        "ProfileCustomization",
        "ProfileCustomizationScreen",
        "UserSettingsProfile"
    ];
    var official = [
        "CollectiblesProfileSettings",
        "AvatarDecorationSettings",
        "EditAvatarDecoration",
        "AvatarDecorationSetting",
        "AvatarDecorationPicker",
        "CollectiblesAvatarDecoration"
    ];
    var hit = 0;
    var i;
    for (i = 0; i < screens.length; i++) {
        if (patchNamedComponent(screens[i], onEditProfileRender)) hit++;
    }
    for (i = 0; i < official.length; i++) {
        if (patchNamedComponent(official[i], onOfficialDecorRender)) hit++;
    }
    log("edit-profile patches", hit);
}

function getSelectedDecoration() {
    if (!selectedHash) return null;
    var i;
    var j;
    for (i = 0; i < myDecorations.length; i++) {
        if (myDecorations[i] && myDecorations[i].hash === selectedHash) return myDecorations[i];
    }
    for (i = 0; i < presets.length; i++) {
        var decos = (presets[i] && presets[i].decorations) || [];
        for (j = 0; j < decos.length; j++) {
            if (decos[j] && decos[j].hash === selectedHash) return decos[j];
        }
    }
    return null;
}

function presetFor(decoration) {
    if (!decoration || !decoration.presetId) return null;
    for (var i = 0; i < presets.length; i++) {
        if (presets[i] && presets[i].id === decoration.presetId) return presets[i];
    }
    return null;
}

function currentAvatarUri() {
    var user = getCurrentUser();
    var resolver = findByProps("getUserAvatarURL") || findByProps("getUserAvatarURL", "getGuildMemberAvatarURL");
    try {
        if (resolver && user && typeof resolver.getUserAvatarURL === "function") {
            return resolver.getUserAvatarURL(user, true, 128);
        }
    } catch (_e) {}
    if (user && user.avatar) return "https://cdn.discordapp.com/avatars/" + user.id + "/" + user.avatar + ".png?size=128";
    return null;
}

function hapticTap() {
    var haptics = findByProps("triggerHapticFeedback");
    try {
        if (haptics && haptics.triggerHapticFeedback) haptics.triggerHapticFeedback(haptics.HapticFeedbackTypes && haptics.HapticFeedbackTypes.IMPACT_LIGHT);
    } catch (_e) {}
}

function getSafeTop() {
    var RN = getRN() || {};
    try {
        if (RN.StatusBar && typeof RN.StatusBar.currentHeight === "number") {
            return RN.StatusBar.currentHeight + 8;
        }
    } catch (_e) {}
    try {
        if (RN.Platform && RN.Platform.OS === "ios") return 54;
    } catch (_e2) {}
    return 28;
}

function screenHeight() {
    var RN = getRN() || {};
    try {
        var d = RN.Dimensions && RN.Dimensions.get && RN.Dimensions.get("window");
        if (d && d.height) return d.height;
    } catch (_e) {}
    return 720;
}

function closeDecorScreen() {
    var modals = findByProps("pushModal", "popModal") || findByProps("popModal");
    var keys = ["mime-decor-screen", "create-decoration", "decor-presets"];
    if (modals && typeof modals.popModal === "function") {
        for (var i = 0; i < keys.length; i++) {
            try { modals.popModal(keys[i]); } catch (_e) {}
        }
        try { modals.popModal(); } catch (_e2) {}
    }
    hideSheet();
}

function DecorScreenShell(props) {
    var RN = getRN() || {};
    var View = RN.View;
    var Text = RN.Text;
    var Pressable = RN.Pressable || RN.TouchableOpacity;
    var ScrollView = RN.ScrollView;
    if (!View) return null;
    var Page = props.page;
    var top = getSafeTop();
    var header = h(View, {
        style: {
            height: 48,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 8,
            borderBottomWidth: 1,
            borderBottomColor: "#3f4147",
            backgroundColor: "#111214"
        }
    },
        Pressable ? h(Pressable, {
            onPress: closeDecorScreen,
            hitSlop: 12,
            style: { paddingHorizontal: 12, paddingVertical: 8 }
        }, Text ? h(Text, { style: { color: "#00a8fc", fontSize: 16 } }, "Close") : null) : null,
        Text ? h(Text, {
            style: { color: "#fff", fontSize: 16, fontWeight: "700", flex: 1, textAlign: "center", marginRight: 64 }
        }, props.title || "") : null
    );
    var body = Page ? h(Page, null) : null;
    return h(View, {
        style: {
            flex: 1,
            height: screenHeight(),
            backgroundColor: "#111214",
            paddingTop: top
        }
    }, header, h(View, { style: { flex: 1, backgroundColor: "#111214" } }, body));
}

function openCustomPage(title, render) {
    var React = getReact();
    if (!React) return false;
    function Modal() {
        return h(DecorScreenShell, { title: title, page: render });
    }
    var modals = findByProps("pushModal", "popModal") || findByProps("pushModal");
    if (modals && typeof modals.pushModal === "function") {
        try {
            modals.pushModal({
                key: "mime-decor-screen",
                modal: {
                    key: "mime-decor-screen",
                    modal: Modal,
                    animation: "slide-up",
                    shouldPersistUnderModals: false,
                    closable: true,
                    props: {}
                }
            });
            return true;
        } catch (err) {
            logError("pushModal object", err);
        }
        try {
            modals.pushModal(Modal, "mime-decor-screen");
            return true;
        } catch (err2) {
            logError("pushModal fn", err2);
        }
    }
    var Navigator = findByName("Navigator") || (findByProps("Navigator") && findByProps("Navigator").Navigator);
    if (modals && Navigator && typeof modals.pushModal === "function") {
        function NavModal() {
            return h(Navigator, {
                initialRouteName: "DECOR_PAGE",
                screens: {
                    DECOR_PAGE: {
                        title: title,
                        render: render
                    }
                }
            });
        }
        try {
            modals.pushModal({
                key: "mime-decor-screen",
                modal: { key: "mime-decor-screen", modal: NavModal, animation: "slide-up", closable: true, props: {} }
            });
            return true;
        } catch (_e3) {}
    }
    var Lazy = findByProps("openLazy", "hideActionSheet");
    var SheetMod = findByProps("ActionSheet");
    if (Lazy && typeof Lazy.openLazy === "function") {
        function Sheet() {
            var host = SheetMod && SheetMod.ActionSheet;
            var page = h(DecorScreenShell, { title: title, page: render });
            if (host) return h(host, { style: { flex: 1, backgroundColor: "#111214" } }, page);
            return page;
        }
        try {
            Lazy.openLazy(Promise.resolve({ default: Sheet }), "ActionSheet");
            return true;
        } catch (err4) {
            logError("openLazy page", err4);
        }
    }
    return false;
}

function assetSource(names) {
    var list = Array.isArray(names) ? names : [names];
    for (var i = 0; i < list.length; i++) {
        var id = findAssetId(list[i]);
        if (typeof id === "number") return id;
        if (id && typeof id === "object") return id;
    }
    return null;
}

function DecorCard(props) {
    var RN = getRN() || {};
    var View = RN.View;
    var Touchable = RN.TouchableOpacity || RN.Pressable;
    var Image = RN.Image;
    if (!View || !Touchable) return null;
    var selected = !!props.selected;
    var disabled = !!props.disabled;
    var inner = props.children;
    if (!inner && Image && props.uri) {
        inner = h(Image, { source: { uri: props.uri }, style: { width: 72, height: 72 }, resizeMode: "contain" });
    }
    return h(View, {
        style: { width: 72, height: 72 }
    }, h(Touchable, {
        onPress: disabled ? undefined : function () {
            hapticTap();
            if (props.onPress) props.onPress();
        },
        onLongPress: disabled ? undefined : props.onLongPress,
        disabled: disabled,
        activeOpacity: 0.75
    }, h(View, {
        style: {
            width: 72,
            height: 72,
            borderRadius: 4,
            backgroundColor: "#2b2d31",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            borderWidth: selected ? 2 : 0,
            borderColor: "#5865F2",
            opacity: disabled ? 0.5 : 1
        }
    }, inner)));
}

function HorizontalTiles(nodes) {
    var React = getReact();
    var RN = getRN() || {};
    var View = RN.View;
    var ScrollView = RN.ScrollView;
    if (!View || !nodes || !nodes.length) return null;
    var slots = [];
    for (var i = 0; i < nodes.length; i++) {
        if (!nodes[i]) continue;
        slots.push(h(View, {
            key: (nodes[i].key != null ? nodes[i].key : String(i)),
            style: { width: 72, height: 72, marginRight: 8 }
        }, nodes[i]));
    }
    if (ScrollView) {
        return React.createElement.apply(React, [ScrollView, {
            horizontal: true,
            showsHorizontalScrollIndicator: false,
            nestedScrollEnabled: true,
            style: { height: 88, width: "100%", flexGrow: 0, flexShrink: 0 },
            contentContainerStyle: { paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" }
        }].concat(slots));
    }
    return React.createElement.apply(React, [View, {
        style: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, minHeight: 88 }
    }].concat(slots));
}

function CardButton(props) {
    var RN = getRN() || {};
    var View = RN.View;
    var Text = RN.Text;
    var Image = RN.Image;
    var inner = [];
    var src = props.source;
    if (Image && src != null) {
        inner.push(h(Image, { key: "icon", source: src, style: { width: 22, height: 22, marginBottom: 4, tintColor: "#dbdee1" } }));
    }
    if (Text) {
        inner.push(h(Text, {
            key: "label",
            numberOfLines: 1,
            style: { color: "#dbdee1", fontSize: 11, fontWeight: "600" }
        }, props.label || ""));
    }
    return h(DecorCard, {
        selected: props.selected,
        disabled: props.disabled,
        onPress: props.onPress
    }, h(View, { style: { alignItems: "center", justifyContent: "center", paddingHorizontal: 4 } }, inner));
}

function DecorationTile(props) {
    var RN = getRN() || {};
    var Image = RN.Image;
    var decoration = props.decoration;
    var selected = selectedHash === (decoration && decoration.hash);
    var uri = decoImageUri(decoration);
    var img = (Image && uri) ? h(Image, {
        source: { uri: uri },
        style: { width: 72, height: 72 },
        resizeMode: "contain"
    }) : null;
    return h(DecorCard, {
        selected: selected,
        disabled: props.disabled,
        onPress: function () {
            selectDecoration(selected ? null : decoration).then(function () {
                if (props.onChanged) props.onChanged();
            });
        },
        onLongPress: function () {
            showToast((decoration && (decoration.alt || decoration.hash)) || "Decoration");
        }
    }, img);
}

function AvatarDecorationPreviews(props) {
    var RN = getRN() || {};
    var View = RN.View;
    var Image = RN.Image;
    if (!View) return null;
    var decoration = props.pendingAvatarDecoration;
    var decoUri = null;
    if (decoration) {
        if (decoration.asset && /^(file|content|ph|data):/i.test(String(decoration.asset))) decoUri = decoration.asset;
        else decoUri = getDecorAvatarDecorationURL(decoration, true) || decoImageUri(decoration);
    }
    var avatarUri = currentAvatarUri();
    var Avatar = null;
    var comps = (getMod().metro && getMod().metro.common && getMod().metro.common.components) || {};
    if (comps.Avatar) Avatar = comps.Avatar;
    var avatarEl = null;
    if (Avatar) {
        avatarEl = h(Avatar, { user: getCurrentUser(), size: "large", style: { transform: [{ scale: 3 }] } });
    } else if (Image && avatarUri) {
        avatarEl = h(Image, {
            source: { uri: avatarUri },
            style: { width: 80, height: 80, borderRadius: 40 }
        });
    }
    return h(View, {
        style: { flexDirection: "row", width: "100%", justifyContent: "center", alignItems: "center", paddingHorizontal: 16, paddingTop: 16 }
    }, h(View, {
        style: {
            width: 208,
            height: 208,
            borderRadius: 4,
            backgroundColor: "#111214",
            alignItems: "center",
            justifyContent: "center"
        }
    }, avatarEl, decoUri && Image ? h(Image, {
        source: { uri: decoUri },
        style: { position: "absolute", width: 180, height: 180 }
    }) : null));
}

function DecorationPicker(props) {
    var React = getReact();
    var RN = getRN() || {};
    var View = RN.View;
    var Text = RN.Text;
    var Pressable = RN.Pressable || RN.TouchableOpacity;
    var FlatList = RN.FlatList;
    var ScrollView = RN.ScrollView;
    var ActivityIndicator = RN.ActivityIndicator;
    if (!React || !View) return null;
    var [, bump] = React.useState(0);
    function refresh() { bump(function (n) { return n + 1; }); }
    React.useEffect(function () {
        loadPresets().then(refresh);
        if (getToken()) refreshMine().then(refresh);
    }, []);
    var authorized = !!getToken();
    var selected = getSelectedDecoration();
    var selectedAvatar = selected ? decorationToAvatar(selected) : null;
    var decorPreset = presetFor(selected);
    var own = [];
    var i;
    for (i = 0; i < myDecorations.length; i++) {
        if (myDecorations[i] && (myDecorations[i].presetId == null)) own.push(myDecorations[i]);
    }
    if (!own.length) own = myDecorations.slice();
    var hasPending = myDecorations.some(function (d) { return d && d.reviewed === false; });
    var disabled = !authorized;
    var TextStyleSheet = (findByProps("TextStyleSheet") || {}).TextStyleSheet || {};
    var Parser = findByProps("parse", "parseToAST");
    var showUserProfile = (findByProps("showUserProfile") || {}).showUserProfile;
    var UserUtils = findByProps("getUser", "fetchCurrentUser");
    var titleStyle = TextStyleSheet["text-lg/semibold"] || { color: "#dbdee1", fontSize: 18, fontWeight: "600" };
    var mutedStyle = TextStyleSheet.eyebrow || { color: "#949ba4", fontSize: 12, textTransform: "uppercase" };
    var bodyStyle = TextStyleSheet["text-md/normal"] || { color: "#dbdee1", fontSize: 14 };

    var meta = null;
    if (selected && Text) {
        var created = ["Created by "];
        if (selected.authorId && Pressable) {
            created.push(h(Pressable, {
                key: "author",
                onPress: function () {
                    var uid = selected.authorId;
                    try {
                        if (showUserProfile) showUserProfile({ userId: uid });
                        else if (UserUtils && UserUtils.getUser) UserUtils.getUser(uid);
                    } catch (_e) {}
                }
            }, Parser && Parser.parse ? Parser.parse("<@" + selected.authorId + ">", true) : ("@" + selected.authorId)));
        }
        meta = h(View, { style: { marginTop: 12, paddingHorizontal: 16 } },
            h(Text, { style: titleStyle }, selected.alt || selected.hash),
            decorPreset ? h(Text, { style: [mutedStyle, { marginTop: 4 }] }, "Part of the " + decorPreset.name + " Preset") : null,
            h(Text, { style: [bodyStyle, { marginTop: 4 }] }, created)
        );
    }

    var tiles = [];
    tiles.push(h(CardButton, {
        key: "none",
        source: assetSource(["img_none", "ic_close_circle", "CircleXIcon", "ic_close_16px"]),
        label: "None",
        selected: !selected,
        disabled: disabled,
        onPress: function () { selectDecoration(null).then(refresh); }
    }));
    for (i = 0; i < own.length; i++) {
        tiles.push(h(DecorationTile, {
            key: own[i].hash,
            decoration: own[i],
            disabled: disabled,
            onChanged: refresh
        }));
    }
    tiles.push(h(CardButton, {
        key: "presets",
        source: assetSource(["smile", "ReactionIcon", "ic_reaction_smile", "ic_emoji_24px"]),
        label: "Presets",
        selected: !!(selected && selected.presetId),
        disabled: disabled,
        onPress: function () { openCustomPage("Presets", PresetsPage); }
    }));
    tiles.push(h(CardButton, {
        key: "new",
        source: assetSource(["ic_add_24px", "PlusSmallIcon", "ic_plus_24px", "PlusIcon"]),
        label: "New",
        disabled: disabled || hasPending,
        onPress: function () {
            if (hasPending) {
                showToast("You already have a decoration pending review");
                return;
            }
            openCustomPage("Submit a Decoration", CreateDecorationPage);
        }
    }));

    var list = HorizontalTiles(tiles);

    var headerIcon = null;
    if (!authorized && ActivityIndicator) headerIcon = null;
    var FormTitle = ((getMod().metro && getMod().metro.common && getMod().metro.common.components && getMod().metro.common.components.FormTitle)
        || (findByProps("FormTitle") && findByProps("FormTitle").FormTitle));
    var titleRow = FormTitle
        ? h(FormTitle, { title: "Decorations" })
        : (Text ? h(Text, { style: { color: "#949ba4", fontSize: 12, fontWeight: "700", letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 8 } }, "DECORATIONS") : null);

    return h(View, { __mimeDecor: true, style: { gap: 0 } },
        h(AvatarDecorationPreviews, { pendingAvatarDecoration: selectedAvatar }),
        meta,
        titleRow,
        list
    );
}

function PresetsPage() {
    var React = getReact();
    var RN = getRN() || {};
    var View = RN.View;
    var Text = RN.Text;
    var ScrollView = RN.ScrollView;
    if (!React || !View) return null;
    var state = React.useState(presets.slice ? presets.slice() : []);
    var list = state[0] || [];
    var setList = state[1];
    React.useEffect(function () {
        loadPresets().then(function (p) { setList(p || []); });
    }, []);
    var rows = [];
    var i;
    if (!list.length && Text) {
        rows.push(h(Text, {
            key: "empty",
            style: { color: "#949ba4", padding: 16 }
        }, "Loading presets…"));
    }
    for (i = 0; i < list.length; i++) {
        var preset = list[i];
        if (!preset) continue;
        var decos = preset.decorations || preset.items || [];
        var cards = [];
        for (var j = 0; j < decos.length; j++) {
            if (!decos[j] || !decos[j].hash) continue;
            cards.push(h(DecorationTile, {
                key: decos[j].hash,
                decoration: decos[j],
                onChanged: function () { closeDecorScreen(); }
            }));
        }
        rows.push(h(View, { key: preset.id || String(i), style: { marginBottom: 20 } },
            Text ? h(Text, { style: { color: "#dbdee1", fontSize: 16, fontWeight: "600", paddingHorizontal: 16, paddingBottom: 4 } }, preset.name || "Preset") : null,
            (preset.description && Text) ? h(Text, { style: { color: "#949ba4", fontSize: 13, paddingHorizontal: 16, paddingBottom: 8 } }, preset.description) : null,
            cards.length ? HorizontalTiles(cards) : (Text ? h(Text, { style: { color: "#949ba4", paddingHorizontal: 16 } }, "No decorations in this preset") : null)
        ));
    }
    if (ScrollView) {
        return h(ScrollView, {
            style: { flex: 1, backgroundColor: "#111214" },
            contentContainerStyle: { paddingTop: 8, paddingBottom: 40 }
        }, rows);
    }
    return h(View, { style: { flex: 1, backgroundColor: "#111214", paddingTop: 8 } }, rows);
}

function CreateDecorationPage() {
    var React = getReact();
    var RN = getRN() || {};
    var View = RN.View;
    var Text = RN.Text;
    var comps = (getMod().metro && getMod().metro.common && getMod().metro.common.components) || {};
    var Button = comps.Button || comps.LegacyButton;
    var TextInput = comps.TextInput;
    if (!React || !View) return null;
    var assetState = React.useState(null);
    var altState = React.useState("");
    var creatingState = React.useState(false);
    var asset = assetState[0];
    var setAsset = assetState[1];
    var alt = altState[0];
    var setAlt = altState[1];
    var creating = creatingState[0];
    var setCreating = creatingState[1];
    var picker = findByProps("launchImageLibrary");
    function pick() {
        if (!picker || typeof picker.launchImageLibrary !== "function") {
            showToast("Image picker unavailable");
            return;
        }
        picker.launchImageLibrary({ mediaType: "photo" }, function (ret) {
            if (!ret || ret.didCancel) return;
            var picked = ret.assets && ret.assets[0];
            if (picked) setAsset(picked);
        });
    }
    function submit() {
        if (!asset || !alt || creating) return;
        setCreating(true);
        var form = new FormData();
        form.append("image", { uri: asset.uri, type: asset.type || "image/png", name: asset.fileName || "decoration.png" });
        form.append("alt", alt);
        authFetch("/users/@me/decoration", { method: "PUT", body: form }).then(function (r) { return r.json(); }).then(function () {
            showToast("Decoration created and pending review");
            refreshMine();
            closeDecorScreen();
        }).catch(function (err) {
            logError("create", err);
            showToast("Failed to create decoration");
            setCreating(false);
        });
    }
    var body = [
        h(AvatarDecorationPreviews, { key: "preview", pendingAvatarDecoration: asset ? { asset: asset.uri, skuId: RAW_SKU_ID } : null }),
        Text ? h(Text, { key: "hint", style: { color: "#949ba4", marginTop: 16, marginBottom: 12, lineHeight: 18 } }, "File must be a PNG or APNG.") : null,
        Button ? h(View, { key: "pick", style: { marginBottom: 12 } }, h(Button, { text: asset ? (asset.fileName || "Image selected") : "Select Image", onPress: pick })) : null,
        TextInput ? h(View, { key: "name", style: { marginBottom: 16 } }, h(TextInput, { label: "Decoration Name", placeholder: "e.g. Companion Cube", value: alt, onChange: setAlt, onChangeText: setAlt })) : null,
        Button ? h(Button, { key: "go", text: creating ? "Creating…" : "Create Decoration", disabled: !asset || !alt, onPress: submit }) : null
    ];
    var ScrollView = RN.ScrollView;
    if (ScrollView) {
        return h(ScrollView, {
            style: { flex: 1, backgroundColor: "#111214" },
            contentContainerStyle: { padding: 16, paddingBottom: 40 }
        }, body);
    }
    return h(View, { style: { padding: 16, backgroundColor: "#111214", flex: 1 } }, body);
}

function EditProfileDecorBlock() {
    var RN = getRN() || {};
    var View = RN.View;
    var Text = RN.Text;
    if (!View) return h(DecorationPicker, null);
    return h(View, { __mimeDecor: true, style: { marginBottom: 16, paddingBottom: 8 } },
        Text ? h(Text, { style: { color: "#dbdee1", fontSize: 16, fontWeight: "600", paddingHorizontal: 16, paddingTop: 8 } }, "Avatar decoration") : null,
        h(DecorationPicker, null)
    );
}

function start() {
    stop();
    patchStores();
    subscribeFlux();
    patchEditProfile();
    loadConfig();
    loadPresets();
    var me = getCurrentUser();
    if (me) queueFetch(me.id, true);
    ensureAuth().then(function (tok) {
        if (tok) return refreshMine();
    });
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
    var RN = getRN() || {};
    var View = RN.View;
    var Text = RN.Text;
    var ScrollView = RN.ScrollView;
    var comps = (getMod().metro && getMod().metro.common && getMod().metro.common.components) || {};
    var Button = comps.Button || comps.LegacyButton;
    var TextInput = comps.TextInput;
    var [, bump] = React.useState(0);
    React.useEffect(function () {
        loadPresets().then(function () { bump(function (n) { return n + 1; }); });
        if (getToken()) refreshMine().then(function () { bump(function (n) { return n + 1; }); });
    }, []);
    function refresh() { bump(function (n) { return n + 1; }); }
    var authorized = !!getToken();
    var children = [];
    children.push(h(DecorationPicker, { key: "picker" }));
    if (Text) {
        children.push(h(Text, {
            key: "status",
            style: { color: "#dbdee1", marginTop: 16, marginBottom: 8, paddingHorizontal: 12 }
        }, authorized ? "Authorized with Decor." : "Authorize to equip decorations. Uses your Discord login."));
    }
    if (Button) {
        children.push(h(View, { key: "authwrap", style: { paddingHorizontal: 12, marginTop: 8, marginBottom: 8 } }, h(Button, {
            text: authorized ? "Re-authorize" : "Authorize with Decor",
            onPress: function () { authorize().then(refresh); setTimeout(refresh, 2000); }
        })));
        if (authorized) {
            children.push(h(View, { key: "logoutwrap", style: { paddingHorizontal: 12, marginBottom: 8 } }, h(Button, {
                text: "Log out",
                onPress: function () { setToken(null); refresh(); }
            })));
        }
        children.push(h(View, { key: "reloadwrap", style: { paddingHorizontal: 12, marginBottom: 8 } }, h(Button, {
            text: "Reload list",
            onPress: function () { refreshMine().then(refresh); }
        })));
    }
    if (TextInput) {
        children.push(h(TextInput, {
            key: "paste",
            label: "Token fallback (only if authorize fails)",
            value: getToken() || "",
            onChange: function (v) { setToken(v); refresh(); },
            onChangeText: function (v) { setToken(v); refresh(); }
        }));
    }
    var inner = View ? h(View, { style: { paddingBottom: 40 } }, children) : children[0];
    if (ScrollView) return h(ScrollView, { style: { flex: 1 } }, inner);
    return inner;
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
    handleFlux: handleFlux,
    decoImageUri: decoImageUri,
    discordAuthorizeUrl: discordAuthorizeUrl,
    decorationUrlFromOpts: decorationUrlFromOpts,
    isOfficialDecorNode: isOfficialDecorNode,
    injectDecorAboveOfficial: injectDecorAboveOfficial,
    normalizePresets: normalizePresets,
    DecorationPicker: DecorationPicker
});
