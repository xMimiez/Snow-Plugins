/*
  ReplyToStatus — Snow spec-3.
  Long-press a custom status to open a Reply to Status composer.
  Sends through Discord's user-client DM path (same as desktop).
  Author: Mime | N0_.q3.
  build: 1.0.1
*/
var unpatches = [];
var overlay = { open: false, user: null, status: null, sending: false };
var overlayListeners = [];
var QUICK_REACTS = ["\uD83D\uDC4D", "\u2764\uFE0F", "\uD83D\uDE02", "\uD83D\uDD25", "\uD83C\uDF89", "\uD83D\uDE2E", "\uD83D\uDE22", "\uD83D\uDE4F"];
var STATUS_TYPE = 4;

function log() {
    try { console.log.apply(console, ["[ReplyToStatus]"].concat([].slice.call(arguments))); } catch (_e) {}
}
function logError() {
    try { console.error.apply(console, ["[ReplyToStatus]"].concat([].slice.call(arguments))); } catch (_e) {}
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

function hardWrap(kind, obj, method, cb) {
    var orig = obj[method];
    if (typeof orig !== "function" || orig.__mimeRtsWrap) return null;
    function wrapped() {
        var args = arguments;
        if (kind === "instead") return cb(args, orig.bind(obj));
        if (kind === "before") {
            try { cb(args); } catch (_e) {}
            return orig.apply(this, args);
        }
        var ret = orig.apply(this, args);
        try {
            var next = cb(args, ret);
            if (next !== undefined) ret = next;
        } catch (_e2) {}
        return ret;
    }
    wrapped.__mimeRtsWrap = true;
    obj[method] = wrapped;
    var un = function () {
        if (obj[method] === wrapped) obj[method] = orig;
    };
    unpatches.push(un);
    return un;
}

function patchMethod(kind, obj, method, cb) {
    if (!obj || typeof obj[method] !== "function") return null;
    var orig = obj[method];
    var patcher = getPatcher();
    if (patcher && typeof patcher[kind] === "function") {
        try {
            var un = patcher[kind](method, obj, cb);
            if (obj[method] !== orig) {
                if (typeof un === "function") unpatches.push(un);
                return typeof un === "function" ? un : function () {};
            }
        } catch (_e) {}
        try {
            var un2 = patcher[kind](obj, method, cb);
            if (obj[method] !== orig) {
                if (typeof un2 === "function") unpatches.push(un2);
                return typeof un2 === "function" ? un2 : function () {};
            }
        } catch (_e2) {}
    }
    return hardWrap(kind, obj, method, cb);
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
    return found || findByProps("View", "Text", "TextInput") || findByProps("View", "Text");
}

function h(type, props) {
    var React = getReact();
    var kids = [].slice.call(arguments, 2);
    if (!React || !React.createElement) return null;
    return React.createElement.apply(React, [type, props].concat(kids));
}

function showToast(message) {
    var t = findByProps("showToast") || (getMod().ui && getMod().ui.toasts);
    if (t && t.showToast) {
        try { t.showToast(message); return; } catch (_e) {}
    }
    log("toast", message);
}

function getDiscordToken() {
    var auth = findByProps("getToken");
    try {
        if (auth && typeof auth.getToken === "function") return auth.getToken();
    } catch (_e) {}
    return null;
}

function getCurrentUser() {
    var store = findByStoreName("UserStore") || findByProps("getCurrentUser", "getUser");
    return store && store.getCurrentUser ? store.getCurrentUser() : (getMod()._test && getMod()._test.currentUser);
}

function getUser(id) {
    if (!id) return null;
    var store = findByStoreName("UserStore") || findByProps("getUser", "getCurrentUser");
    if (store && typeof store.getUser === "function") {
        try { return store.getUser(id); } catch (_e) {}
    }
    return null;
}

function asColorString(v) {
    if (typeof v === "string" && (v.charAt(0) === "#" || v.indexOf("rgb") === 0 || v.indexOf("hsl") === 0)) return v;
    if (v && typeof v === "object") {
        if (typeof v.hex === "string") return v.hex;
        if (typeof v.color === "string") return asColorString(v.color);
    }
    return null;
}

function themeColors() {
    var fb = {
        bg: "#313338",
        bgSecondary: "#2b2d31",
        bgFloating: "#1e1f22",
        text: "#dbdee1",
        muted: "#949ba4",
        header: "#f2f3f5",
        link: "#00a8fc",
        border: "#3f4147",
        brand: "#5865F2"
    };
    try {
        var ThemeStore = findByStoreName("ThemeStore") || findByProps("theme");
        var theme = ThemeStore && ThemeStore.theme;
        var colorMod = findByProps("colors", "meta")
            || findByProps("colors", "unsafe_rawColors")
            || findByProps("SemanticColor");
        var root = colorMod && (colorMod.default || colorMod);
        var map = (root && (root.colors || root.SemanticColor))
            || (findByProps("ThemeColorMap") && findByProps("ThemeColorMap").ThemeColorMap);
        var meta = root && (root.meta || root.internal);
        var resolver = meta && meta.resolveSemanticColor;
        function resolve(keys, fallback) {
            if (!map) return fallback;
            for (var i = 0; i < keys.length; i++) {
                var sym = map[keys[i]];
                if (sym == null) continue;
                var hex = asColorString(sym);
                if (hex) return hex;
                if (typeof resolver === "function") {
                    try {
                        hex = asColorString(resolver(theme, sym)) || asColorString(resolver(sym));
                        if (hex) return hex;
                    } catch (_e) {}
                }
            }
            return fallback;
        }
        return {
            bg: resolve(["BACKGROUND_PRIMARY", "BG_BASE_PRIMARY"], fb.bg),
            bgSecondary: resolve(["BACKGROUND_SECONDARY", "BG_BASE_SECONDARY"], fb.bgSecondary),
            bgFloating: resolve(["BACKGROUND_FLOATING", "BG_SURFACE_OVERLAY"], fb.bgFloating),
            text: resolve(["TEXT_NORMAL", "TEXT_PRIMARY", "HEADER_PRIMARY"], fb.text),
            muted: resolve(["TEXT_MUTED", "TEXT_SECONDARY"], fb.muted),
            header: resolve(["HEADER_PRIMARY", "TEXT_NORMAL"], fb.header),
            link: resolve(["TEXT_LINK", "TEXT_BRAND"], fb.link),
            border: resolve(["BACKGROUND_MODIFIER_ACCENT", "BORDER_SUBTLE"], fb.border),
            brand: resolve(["CONTROL_BRAND_FOREGROUND", "BRAND_500"], fb.brand)
        };
    } catch (_e2) {
        return fb;
    }
}

function isCustomActivity(act) {
    if (!act) return false;
    if (act.type === STATUS_TYPE || act.type === "CUSTOM" || act.type === "CUSTOM_STATUS") return true;
    if (act.name === "Custom Status" || act.id === "custom") return true;
    return false;
}

function extractCustomStatus(activities) {
    if (!activities) return null;
    var list = Array.isArray(activities) ? activities : [activities];
    for (var i = 0; i < list.length; i++) {
        var a = list[i];
        if (!isCustomActivity(a)) continue;
        var emoji = a.emoji || null;
        var text = a.state || a.name;
        if (text === "Custom Status") text = a.state || "";
        return {
            text: text || "",
            emojiName: emoji && (emoji.name || emoji.emoji_name) || a.emoji_name || null,
            emojiId: emoji && (emoji.id || emoji.emoji_id) || a.emoji_id || null,
            emojiAnimated: !!(emoji && emoji.animated),
            expiresAt: a.expires_at || a.expiresAt || null,
            createdAt: a.created_at || a.createdAt || null,
            raw: a
        };
    }
    return null;
}

function statusFromProps(props) {
    if (!props) return null;
    if (props.customStatus && typeof props.customStatus === "object") {
        var cs = props.customStatus;
        if (cs.text || cs.emoji || cs.state) {
            return extractCustomStatus([{
                type: STATUS_TYPE,
                state: cs.text || cs.state,
                emoji: cs.emoji,
                emoji_name: cs.emoji_name || cs.emojiName,
                emoji_id: cs.emoji_id || cs.emojiId
            }]) || extractCustomStatus([cs]);
        }
    }
    if (props.activity && isCustomActivity(props.activity)) return extractCustomStatus([props.activity]);
    if (props.activities) return extractCustomStatus(props.activities);
    return null;
}

function userIdFromProps(props) {
    if (!props) return null;
    if (typeof props.userId === "string") return props.userId;
    if (typeof props.userID === "string") return props.userID;
    if (props.user && props.user.id) return String(props.user.id);
    if (props.member && props.member.userId) return String(props.member.userId);
    if (props.member && props.member.user && props.member.user.id) return String(props.member.user.id);
    if (props.message && props.message.author && props.message.author.id) return String(props.message.author.id);
    if (typeof props.id === "string" && /^\d{16,}$/.test(props.id)) return props.id;
    return null;
}

function getActivities(userId) {
    var store = findByStoreName("PresenceStore") || findByProps("getActivities", "getStatus");
    if (store && typeof store.getActivities === "function") {
        try { return store.getActivities(userId) || []; } catch (_e) {}
    }
    var mod = getMod();
    if (mod._test && mod._test.activities && mod._test.activities[userId]) return mod._test.activities[userId];
    return [];
}

function customStatusForUser(userId) {
    return extractCustomStatus(getActivities(userId));
}

function formatQuote(status) {
    if (!status) return "";
    var emoji = "";
    if (status.emojiId && status.emojiName) {
        emoji = (status.emojiAnimated ? "<a:" : "<:") + status.emojiName + ":" + status.emojiId + "> ";
    } else if (status.emojiName) {
        emoji = status.emojiName + " ";
    }
    return (emoji + (status.text || "")).replace(/^\s+|\s+$/g, "");
}

function displayName(user) {
    if (!user) return "this user";
    if (typeof user === "string") return user;
    return user.globalName || user.global_name || user.displayName || user.username || "this user";
}

function nameForUser(userId) {
    if (overlay.user && String(overlay.user.id) === String(userId)) return displayName(overlay.user);
    return displayName(getUser(userId));
}

function formatStatusReplyMessage(name, status, content, kind) {
    kind = kind || "Replied";
    var who = displayName(name);
    var lines = ["> -# *" + kind + " to " + who + "'s status*"];
    var quote = formatQuote(status);
    if (quote) lines.push("> " + quote);
    lines.push(String(content || ""));
    return lines.join("\n");
}

function shouldSkipUser(userId) {
    var me = getCurrentUser();
    if (!userId) return true;
    if (me && String(me.id) === String(userId)) return true;
    return false;
}

function statusApiObject(status) {
    if (!status) return null;
    var o = {
        text: status.text || null,
        emoji_name: status.emojiName || null,
        emoji_id: status.emojiId || null
    };
    if (status.expiresAt) o.expires_at = status.expiresAt;
    return o;
}

function buildSendBodies(content, userId, status, name, kind) {
    var msg = formatStatusReplyMessage(name || nameForUser(userId), status, content, kind || "Replied");
    return [{ content: msg }];
}

function getRest() {
    return findByProps("getAPIBaseURL")
        || findByProps("get", "post", "put", "patch")
        || findByProps("post", "get");
}

function restPost(url, body) {
    var rest = getRest();
    if (rest && typeof rest.post === "function") {
        try {
            var p = rest.post({ url: url, body: body });
            if (p && typeof p.then === "function") return p;
            return Promise.resolve(p);
        } catch (_e) {}
    }
    var token = getDiscordToken();
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    var fn = g.fetch || (typeof fetch === "function" ? fetch : null);
    if (!fn || !token) return Promise.reject(new Error("no rest"));
    return fn("https://discord.com/api/v9" + url, {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify(body)
    }).then(function (r) {
        if (!r) return r;
        if (r.status && r.status >= 400) {
            return r.json().then(function (j) {
                var err = new Error("http " + r.status);
                err.status = r.status;
                err.body = j;
                throw err;
            });
        }
        return typeof r.json === "function" ? r.json() : r;
    });
}

function unwrapChannelId(value) {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (value.id) return String(value.id);
    if (value.channelId) return String(value.channelId);
    if (value.channel_id) return String(value.channel_id);
    return null;
}

function openDm(userId) {
    var m = findByProps("ensurePrivateChannel", "openPrivateChannel")
        || findByProps("ensurePrivateChannel")
        || findByProps("openPrivateChannel")
        || findByProps("getOrCreatePrivateChannel");
    function fromFn(fn) {
        try {
            var out = fn(userId);
            if (out && typeof out.then === "function") return out.then(unwrapChannelId);
            return Promise.resolve(unwrapChannelId(out));
        } catch (_e) {
            return Promise.resolve(null);
        }
    }
    if (m && typeof m.ensurePrivateChannel === "function") {
        return fromFn(m.ensurePrivateChannel.bind(m)).then(function (id) {
            if (id) return id;
            if (m.openPrivateChannel) return fromFn(m.openPrivateChannel.bind(m));
            return null;
        });
    }
    if (m && typeof m.openPrivateChannel === "function") return fromFn(m.openPrivateChannel.bind(m));
    if (m && typeof m.getOrCreatePrivateChannel === "function") return fromFn(m.getOrCreatePrivateChannel.bind(m));
    var mod = getMod();
    if (mod._test && typeof mod._test.openDm === "function") {
        return Promise.resolve(mod._test.openDm(userId));
    }
    return restPost("/users/@me/channels", { recipient_id: String(userId) }).then(function (ch) {
        return unwrapChannelId(ch);
    });
}

function findNativeStatusReply() {
    var names = [
        ["sendCustomStatusReply"],
        ["sendStatusReply"],
        ["replyToCustomStatus"],
        ["replyToStatus", "reactToStatus"],
        ["reactToCustomStatus"],
        ["sendStatusReaction"]
    ];
    for (var i = 0; i < names.length; i++) {
        var found = findByProps.apply(null, names[i]);
        if (found) return found;
    }
    return null;
}

function sendViaNative(userId, content, status, emoji) {
    var native = findNativeStatusReply();
    if (!native) return Promise.resolve(false);
    var fns = ["sendCustomStatusReply", "sendStatusReply", "replyToCustomStatus", "replyToStatus"];
    if (emoji) fns = ["reactToCustomStatus", "reactToStatus", "sendStatusReaction"].concat(fns);
    for (var i = 0; i < fns.length; i++) {
        if (typeof native[fns[i]] !== "function") continue;
        try {
            var out = native[fns[i]](userId, emoji || content, status);
            if (out && typeof out.then === "function") {
                return out.then(function () { return true; }).catch(function () { return false; });
            }
            return Promise.resolve(true);
        } catch (_e) {}
        try {
            var out2 = native[fns[i]]({ userId: userId, content: content, emoji: emoji, customStatus: status });
            if (out2 && typeof out2.then === "function") {
                return out2.then(function () { return true; }).catch(function () { return false; });
            }
            return Promise.resolve(true);
        } catch (_e2) {}
    }
    return Promise.resolve(false);
}

function sendViaMessageActions(channelId, body, extra) {
    var util = findByProps("sendMessage", "receiveMessage")
        || findByProps("sendMessage", "sendBotMessage")
        || findByProps("sendMessage");
    if (!util || typeof util.sendMessage !== "function") return false;
    var attempts = [
        function () { return util.sendMessage(channelId, body, true, extra || { location: "CUSTOM_STATUS_REPLY" }); },
        function () { return util.sendMessage(channelId, body, true); },
        function () { return util.sendMessage(channelId, body); }
    ];
    for (var i = 0; i < attempts.length; i++) {
        try {
            attempts[i]();
            return true;
        } catch (_e) {}
    }
    return false;
}

function httpOk(res) {
    if (!res) return true;
    if (res.ok === false) return false;
    if (typeof res.status === "number" && res.status >= 400) return false;
    if (res.body && res.body.code && res.body.code >= 40000) return false;
    return true;
}

function sendBodiesToChannel(channelId, bodies, extra) {
    var i = 0;
    function next() {
        if (i >= bodies.length) return Promise.reject(new Error("all payloads rejected"));
        var body = bodies[i++];
        if (sendViaMessageActions(channelId, body, extra)) return Promise.resolve(true);
        return restPost("/channels/" + channelId + "/messages", body).then(function (res) {
            if (httpOk(res)) return true;
            return next();
        }).catch(function () {
            return next();
        });
    }
    return next();
}

function sendStatusReply(userId, content, status) {
    var trimmed = String(content || "").replace(/^\s+|\s+$/g, "");
    if (!trimmed) return Promise.reject(new Error("empty"));
    var extra = { location: "CUSTOM_STATUS_REPLY", customStatus: statusApiObject(status) };
    var name = nameForUser(userId);
    return openDm(userId).then(function (channelId) {
        if (!channelId) throw new Error("could not open DM");
        return sendBodiesToChannel(channelId, buildSendBodies(trimmed, userId, status, name, "Replied"), extra);
    });
}

function sendStatusReaction(userId, emoji, status) {
    var extra = { location: "CUSTOM_STATUS_REACTION", customStatus: statusApiObject(status) };
    var name = nameForUser(userId);
    return openDm(userId).then(function (channelId) {
        if (!channelId) throw new Error("could not open DM");
        return sendBodiesToChannel(channelId, buildSendBodies(emoji, userId, status, name, "Reacted"), extra);
    });
}

function notifyOverlay() {
    for (var i = 0; i < overlayListeners.length; i++) {
        try { overlayListeners[i](); } catch (_e) {}
    }
}

function closeReplyWindow() {
    overlay = { open: false, user: null, status: null, sending: false };
    notifyOverlay();
}

function openReplyWindow(userId, statusHint) {
    if (shouldSkipUser(userId)) {
        showToast("Can't reply to your own status");
        return false;
    }
    var status = statusHint || customStatusForUser(userId);
    if (!status || (!status.text && !status.emojiName)) {
        showToast("No custom status");
        return false;
    }
    var user = getUser(userId) || { id: userId };
    overlay = { open: true, user: user, status: status, sending: false };
    notifyOverlay();
    log("open reply", userId, formatQuote(status));
    return true;
}

function setSending(v) {
    overlay.sending = !!v;
    notifyOverlay();
}

function ReplySheet() {
    var React = getReact();
    var RN = getRN() || {};
    var View = RN.View;
    var Text = RN.Text;
    var TextInput = RN.TextInput;
    var Pressable = RN.Pressable || RN.TouchableOpacity;
    var ScrollView = RN.ScrollView || View;
    if (!React || !View || !Text) return null;
    var t = themeColors();
    var user = overlay.user;
    var status = overlay.status;
    var sending = overlay.sending;
    var quote = formatQuote(status);
    var name = displayName(user);
    var draft = React.useRef ? { current: "" } : { current: "" };
    try { draft = React.useRef(""); } catch (_e) { draft = { current: "" }; }
    var pair = React.useState ? React.useState("") : ["", function () {}];
    var text = pair[0];
    var setText = pair[1];

    function onChange(v) {
        var val = v && v.nativeEvent ? v.nativeEvent.text : v;
        setText(val);
        draft.current = val;
    }

    function doSend(content) {
        if (sending) return;
        var body = content != null ? content : (text || draft.current);
        if (!String(body || "").replace(/^\s+|\s+$/g, "")) {
            showToast("Type a reply");
            return;
        }
        setSending(true);
        sendStatusReply(user.id, body, status).then(function () {
            showToast("Reply sent");
            closeReplyWindow();
        }).catch(function (err) {
            setSending(false);
            showToast((err && err.message) || "Failed to send");
            logError("send failed", err);
        });
    }

    function doReact(emoji) {
        if (sending) return;
        setSending(true);
        sendStatusReaction(user.id, emoji, status).then(function () {
            showToast("Reaction sent");
            closeReplyWindow();
        }).catch(function (err) {
            setSending(false);
            showToast((err && err.message) || "Failed to react");
        });
    }

    var reacts = [];
    for (var i = 0; i < QUICK_REACTS.length; i++) {
        (function (emoji) {
            reacts.push(h(Pressable || View, {
                key: emoji,
                onPress: function () { doReact(emoji); },
                style: {
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: t.bgSecondary,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 8
                }
            }, h(Text, { style: { fontSize: 22 } }, emoji)));
        })(QUICK_REACTS[i]);
    }

    return h(View, {
        style: { flex: 1, backgroundColor: t.bg, paddingTop: 18, paddingHorizontal: 16 }
    },
        h(View, {
            style: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }
        },
            h(Text, { style: { color: t.header, fontSize: 20, fontWeight: "700" } }, "Reply to Status"),
            h(Pressable || View, { onPress: closeReplyWindow, hitSlop: 12 },
                h(Text, { style: { color: t.link, fontSize: 16 } }, "Close")
            )
        ),
        h(Text, { style: { color: t.muted, fontSize: 13, marginBottom: 8 } }, "Replying to " + name),
        h(View, {
            style: {
                backgroundColor: t.bgSecondary,
                borderRadius: 12,
                paddingVertical: 10,
                paddingHorizontal: 12,
                marginBottom: 16,
                borderLeftWidth: 3,
                borderLeftColor: t.brand
            }
        }, h(Text, { style: { color: t.text, fontSize: 16 } }, quote || "(empty status)")),
        h(Text, { style: { color: t.muted, fontSize: 12, marginBottom: 8 } }, "React"),
        h(ScrollView, { horizontal: true, style: { marginBottom: 16 }, showsHorizontalScrollIndicator: false }, reacts),
        TextInput ? h(TextInput, {
            value: text,
            onChangeText: onChange,
            onChange: onChange,
            placeholder: "Write a reply…",
            placeholderTextColor: t.muted,
            multiline: true,
            autoFocus: true,
            style: {
                minHeight: 88,
                maxHeight: 160,
                backgroundColor: t.bgSecondary,
                color: t.text,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 16,
                marginBottom: 16
            }
        }) : null,
        h(Pressable || View, {
            onPress: function () { doSend(); },
            style: {
                backgroundColor: t.brand,
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center",
                opacity: sending ? 0.6 : 1
            }
        }, h(Text, { style: { color: "#fff", fontSize: 16, fontWeight: "700" } }, sending ? "Sending…" : "Send reply"))
    );
}

function OverlayHost() {
    var React = getReact();
    var RN = getRN() || {};
    var Modal = RN.Modal;
    var View = RN.View;
    var Safe = RN.SafeAreaView || View;
    if (!React || !View) return null;
    var bump = React.useState ? React.useState(0) : [0, function () {}];
    var setBump = bump[1];
    if (React.useEffect) {
        React.useEffect(function () {
            function on() { setBump(function (n) { return (n || 0) + 1; }); }
            overlayListeners.push(on);
            return function () {
                var i = overlayListeners.indexOf(on);
                if (i >= 0) overlayListeners.splice(i, 1);
            };
        }, []);
    }
    if (!overlay.open) return null;
    var t = themeColors();
    var sheet = h(ReplySheet, null);
    if (Modal) {
        return h(Modal, {
            visible: true,
            animationType: "slide",
            transparent: false,
            onRequestClose: closeReplyWindow
        }, h(Safe, { style: { flex: 1, backgroundColor: t.bg } }, sheet));
    }
    return h(View, {
        style: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, backgroundColor: t.bg }
    }, sheet);
}

function injectOverlay(el) {
    var React = getReact();
    if (!React || !el) return el;
    var host = h(OverlayHost, { key: "mime-rts-overlay" });
    if (!host) return el;
    if (React.Fragment) return h(React.Fragment, null, el, host);
    var RN = getRN() || {};
    if (RN.View) return h(RN.View, { style: { flex: 1 } }, el, host);
    return el;
}

function attachLongPress(el, userId, status) {
    var React = getReact();
    var RN = getRN() || {};
    var Pressable = RN.Pressable || RN.TouchableOpacity || RN.TouchableHighlight;
    if (!React || !Pressable || !el) return el;
    function fire() {
        openReplyWindow(userId, status || customStatusForUser(userId));
    }
    return h(Pressable, {
        onLongPress: fire,
        delayLongPress: 380,
        unstable_pressDelay: 0
    }, el);
}

function afterStatusRender(args, res) {
    var props = args && args[0];
    var userId = userIdFromProps(props);
    if (!userId) return res;
    if (shouldSkipUser(userId)) return res;
    var status = statusFromProps(props) || customStatusForUser(userId);
    if (!status) return res;
    return attachLongPress(res, userId, status);
}

function resolveComponent(name) {
    return findByName(name)
        || findByDisplayName(name)
        || findByTypeName(name)
        || findByName(name, false)
        || findByDisplayName(name, false);
}

function patchComponentModule(comp, label) {
    if (!comp) return 0;
    var n = 0;
    if (typeof comp === "function") {
        var holder = { default: comp };
        if (patchMethod("after", holder, "default", afterStatusRender)) n++;
        if (comp.prototype && typeof comp.prototype.render === "function") {
            if (patchMethod("after", comp.prototype, "render", function (args, res) {
                return afterStatusRender([this && this.props], res);
            })) n++;
        }
        if (typeof comp.type === "function") {
            if (patchMethod("after", comp, "type", afterStatusRender)) n++;
        }
        log("patched fn", label, n);
        return n;
    }
    var keys = ["default", "Z", "ZP", "AZ", "render"];
    for (var i = 0; i < keys.length; i++) {
        if (typeof comp[keys[i]] === "function") {
            if (patchMethod("after", comp, keys[i], afterStatusRender)) n++;
        }
    }
    if (n) log("patched", label, n);
    return n;
}

function patchStatusComponents() {
    var names = [
        "CustomStatus",
        "UserProfileCustomStatus",
        "ProfileCustomStatus",
        "CustomStatusContent",
        "StatusEmojiAndText",
        "UserStatus",
        "ActivityStatus",
        "CustomStatusText",
        "ProfileCustomStatusSection",
        "UserProfileStatus",
        "Status"
    ];
    var total = 0;
    for (var i = 0; i < names.length; i++) {
        total += patchComponentModule(resolveComponent(names[i]), names[i]);
        var byProps = findByProps(names[i]);
        if (byProps && byProps !== resolveComponent(names[i])) {
            total += patchComponentModule(byProps, names[i] + ".props");
        }
    }
    log("status component patches", total);
    return total;
}

function patchOverlayAnchor() {
    var names = ["App", "AppContainer", "MainApp", "Chat", "ConnectedChat", "UserProfileModal", "UserProfile"];
    for (var i = 0; i < names.length; i++) {
        var comp = resolveComponent(names[i]);
        if (!comp) continue;
        var target = typeof comp === "function" ? { default: comp } : comp;
        var method = typeof comp === "function" ? "default" : (target.default ? "default" : (target.Z ? "Z" : null));
        if (!method) continue;
        if (patchMethod("after", target, method, function (_args, res) {
            return injectOverlay(res);
        })) {
            log("overlay host on", names[i]);
            return true;
        }
    }
    return false;
}

function tryNativeRespondScreen(userId) {
    var native = findNativeStatusReply();
    if (native && typeof native.openRespondToStatus === "function") {
        try { native.openRespondToStatus(userId); return true; } catch (_e) {}
    }
    var screens = ["RespondToStatus", "StatusReply", "CustomStatusReply", "ReplyToStatus"];
    var nav = findByProps("pushLazy", "push") || findByProps("navigate", "push") || findByProps("push");
    if (!nav) return false;
    for (var i = 0; i < screens.length; i++) {
        var Comp = resolveComponent(screens[i]);
        if (!Comp) continue;
        try {
            if (typeof nav.push === "function") {
                nav.push(screens[i], { userId: userId });
                return true;
            }
        } catch (_e2) {}
    }
    return false;
}

function openFromHold(userId, status) {
    if (tryNativeRespondScreen(userId)) return true;
    return openReplyWindow(userId, status);
}

function afterStatusRenderOpen(args, res) {
    var props = args && args[0];
    var userId = userIdFromProps(props);
    if (!userId) return res;
    if (shouldSkipUser(userId)) return res;
    var status = statusFromProps(props) || customStatusForUser(userId);
    if (!status) return res;
    var React = getReact();
    var RN = getRN() || {};
    var Pressable = RN.Pressable || RN.TouchableOpacity;
    if (!React || !Pressable || !res) return res;
    return h(Pressable, {
        onLongPress: function () { openFromHold(userId, status); },
        delayLongPress: 380
    }, res);
}

function start() {
    afterStatusRender = afterStatusRenderOpen;
    patchStatusComponents();
    patchOverlayAnchor();
    log("started");
}

function stop() {
    closeReplyWindow();
    overlayListeners.length = 0;
    while (unpatches.length) {
        var un = unpatches.pop();
        try { if (typeof un === "function") un(); } catch (_e) {}
    }
    log("stopped");
}

const plugin = definePlugin({
    start: start,
    stop: stop,
    onLoad: start,
    onUnload: stop,
    extractCustomStatus: extractCustomStatus,
    userIdFromProps: userIdFromProps,
    formatQuote: formatQuote,
    formatStatusReplyMessage: formatStatusReplyMessage,
    buildSendBodies: buildSendBodies,
    shouldSkipUser: shouldSkipUser,
    statusApiObject: statusApiObject,
    openReplyWindow: openReplyWindow,
    sendStatusReply: sendStatusReply,
    QUICK_REACTS: QUICK_REACTS
});
