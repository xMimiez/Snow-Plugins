/* SpotifyPreview — Snow spec-3. Snow SDK: capture bunny during eval. */
var B = (typeof bunny !== "undefined" && bunny) || (typeof snow !== "undefined" && snow) || null;
var unpatches = [];

function getMod() {
    if (B && (B.metro || B.patcher || B.ui || B.api || B.plugin)) return B;
    var list = [];
    try { if (typeof snow !== "undefined" && snow) list.push(snow); } catch (_e) {}
    try { if (typeof bunny !== "undefined" && bunny) list.push(bunny); } catch (_e2) {}
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    if (g.snow) list.push(g.snow);
    if (g.bunny) list.push(g.bunny);
    if (g.vendetta) list.push(g.vendetta);
    function canPatch(m) {
        return m && m.api && m.api.patcher && typeof m.api.patcher.instead === "function";
    }
    var i;
    for (i = 0; i < list.length; i++) if (canPatch(list[i])) return list[i];
    for (i = 0; i < list.length; i++) if (list[i] && list[i].metro) return list[i];
    return list[0] || {};
}

function metroRoots() {
    var roots = [];
    var mod = getMod();
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    [B && B.metro, B && B.metro && B.metro.common, mod.metro, mod.metro && mod.metro.common, g.vendetta && g.vendetta.metro, g.snow && g.snow.metro].forEach(function (r) {
        if (r && roots.indexOf(r) < 0) roots.push(r);
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

function getReact() {
    var mod = getMod();
    return (mod.metro && mod.metro.common && mod.metro.common.React)
        || findByProps("createElement", "useState")
        || (typeof globalThis !== "undefined" && globalThis.React);
}

function isSpotifyHref(href) {
    if (!href || typeof href !== "string") return false;
    if (!/^https?:\/\/open\.spotify\.com\//i.test(href)) return false;
    if (/open\.spotify\.com\/embed/i.test(href)) return false;
    return true;
}

function toEmbedUrl(href) {
    var u = String(href).replace(/https?:\/\/open\.spotify\.com/i, "https://open.spotify.com/embed");
    if (u.indexOf("theme=") < 0) u += (u.indexOf("?") >= 0 ? "&" : "?") + "theme=0";
    return u;
}

function extractHref(arg) {
    if (!arg) return null;
    if (typeof arg === "string") return arg;
    if (typeof arg === "object") return arg.href || arg.url || arg.uri || arg.link || null;
    return null;
}

function getWebView() {
    var named = findByName("WebView");
    if (named) return named;
    var mod = findByProps("WebView");
    if (!mod) return null;
    if (typeof mod.WebView === "function") return mod.WebView;
    if (mod.default && typeof mod.default === "function") return mod.default;
    if (mod.default && typeof mod.default.render === "function") return mod.default.render;
    return null;
}

function getActionSheetCtor() {
    var m = findByProps("ActionSheet");
    if (m && m.ActionSheet) return m.ActionSheet;
    return null;
}

function showPreview(href) {
    var embed = toEmbedUrl(href);
    try { console.log("[SpotifyPreview] open", embed); } catch (_e) {}
    var React = getReact();
    var Lazy = findByProps("openLazy", "hideActionSheet");
    var WebView = getWebView();
    var Sheet = getActionSheetCtor();
    var scrollMod = findByProps("BottomSheetScrollView");

    if (!React || !Lazy || typeof Lazy.openLazy !== "function") {
        try { console.log("[SpotifyPreview] no ActionSheet, cannot preview"); } catch (_e2) {}
        return false;
    }
    if (!WebView) {
        try { console.log("[SpotifyPreview] no WebView"); } catch (_e3) {}
        return false;
    }

    function PreviewSheet(props) {
        var link = extractHref(props) || (props && props.url) || embed;
        var uri = toEmbedUrl(link);
        var RN = findByProps("View", "Text") || findByProps("View", "ScrollView");
        var View = RN && RN.View;
        var SPOTIFY_BG = "#121212";
        var web = React.createElement(WebView, {
            source: { uri: uri },
            originWhitelist: ["*"],
            opaque: false,
            backgroundColor: SPOTIFY_BG,
            containerStyle: { backgroundColor: SPOTIFY_BG, borderRadius: 12, overflow: "hidden" },
            style: { backgroundColor: SPOTIFY_BG, height: 152, width: "100%", borderRadius: 12 },
            injectedJavaScript: "document.documentElement.style.background='#121212';document.body.style.background='#121212';true;"
        });
        var player = View
            ? React.createElement(View, {
                style: {
                    marginTop: 8,
                    marginHorizontal: 12,
                    marginBottom: 28,
                    height: 152,
                    borderRadius: 12,
                    overflow: "hidden",
                    backgroundColor: SPOTIFY_BG
                }
            }, web)
            : web;
        var inner = player;
        if (scrollMod && scrollMod.BottomSheetScrollView) {
            inner = React.createElement(scrollMod.BottomSheetScrollView, {
                contentContainerStyle: {
                    paddingTop: 4,
                    paddingBottom: 180,
                    paddingHorizontal: 0
                }
            }, player);
        }
        if (Sheet) return React.createElement(Sheet, null, inner);
        return inner;
    }

    try {
        Lazy.openLazy(Promise.resolve({ default: PreviewSheet }), "ActionSheet", { url: href });
        return true;
    } catch (err) {
        try { console.error("[SpotifyPreview] openLazy failed", err); } catch (_e4) {}
        return false;
    }
}

function interceptArgs(args, orig, self) {
    var href = extractHref(args && args[0]);
    if (isSpotifyHref(href)) {
        showPreview(href);
        return;
    }
    return orig.apply(self, args);
}

function patchMethod(target, method) {
    if (!target || typeof target[method] !== "function") return;
    var patcher = getMod().api && getMod().api.patcher;
    if (!patcher || typeof patcher.instead !== "function") return;
    try {
        unpatches.push(patcher.instead(method, target, function (args, orig) {
            return interceptArgs(args, orig, target);
        }));
        try { console.log("[SpotifyPreview] patched", method); } catch (_e) {}
    } catch (err) {
        try { console.error("[SpotifyPreview] patch failed", method, err); } catch (_e2) {}
    }
}

function start() {
    stop();
    patchMethod(findByProps("handleClick"), "handleClick");
    patchMethod(findByProps("openURL", "openDeeplink"), "openURL");
    patchMethod(findByProps("openURL", "openDeeplink"), "openDeeplink");
    patchMethod(findByProps("openURL", "canOpenURL"), "openURL");
    try { console.log("[SpotifyPreview] started"); } catch (_e) {}
}

function stop() {
    for (var i = 0; i < unpatches.length; i++) {
        try { if (typeof unpatches[i] === "function") unpatches[i](); } catch (_e) {}
    }
    unpatches = [];
}

const plugin = definePlugin({
    start: start,
    stop: stop,
    onLoad: start,
    onUnload: stop,
    isSpotifyHref: isSpotifyHref,
    toEmbedUrl: toEmbedUrl,
    extractHref: extractHref,
    showPreview: showPreview
});
