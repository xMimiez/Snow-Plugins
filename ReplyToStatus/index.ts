/*
  ReplyToStatus — Snow spec-3.
  Long-press a custom status to open a Reply to Status composer.
  Sends through Discord's user-client DM path (same as desktop).
  Author: Mime | N0_.q3.
  build: 1.1.6
*/
var unpatches = [];
var overlay = { open: false, user: null, status: null, sending: false };
var overlayListeners = [];
var lastOpenAt = 0;
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
    if (props.displayProfile && (props.displayProfile.userId || props.displayProfile.user_id)) {
        return String(props.displayProfile.userId || props.displayProfile.user_id);
    }
    if (props.userProfile && (props.userProfile.userId || props.userProfile.user_id)) {
        return String(props.userProfile.userId || props.userProfile.user_id);
    }
    if (props.profile && props.profile.userId) return String(props.profile.userId);
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

function openReplySheet(user, status) {
    var Lazy = findByProps("openLazy", "hideActionSheet") || findByProps("openLazy");
    if (!Lazy || typeof Lazy.openLazy !== "function") return false;
    var props = { user: user, status: status };
    try {
        Lazy.openLazy(Promise.resolve({ default: ReplySheet }), "MimeReplyToStatus", props);
        return true;
    } catch (_e) {}
    try {
        Lazy.openLazy(function () { return { default: ReplySheet }; }, "MimeReplyToStatus", props);
        return true;
    } catch (_e2) {}
    return false;
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
    var now = Date.now();
    if (now - lastOpenAt < 250) return true;
    lastOpenAt = now;
    overlay = { open: true, user: user, status: status, sending: false };
    notifyOverlay();
    log("open reply", userId, formatQuote(status));
    return true;
}

function setSending(v) {
    overlay.sending = !!v;
    notifyOverlay();
}

function ReplySheet(props) {
    var React = getReact();
    var RN = getRN() || {};
    var View = RN.View;
    var Text = RN.Text;
    var TextInput = RN.TextInput;
    var Pressable = RN.Pressable || RN.TouchableOpacity;
    var ScrollView = RN.ScrollView || View;
    if (!React || !View || !Text) return null;
    var t = themeColors();
    var user = (props && props.user) || overlay.user;
    var status = (props && props.status) || overlay.status;
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
        style: { backgroundColor: t.bg, borderRadius: 16, padding: 16, width: "100%" }
    },
        h(Text, { style: { color: t.header, fontSize: 18, fontWeight: "700", marginBottom: 10 } }, "Reply to Status"),
        h(View, {
            style: {
                backgroundColor: t.bgSecondary,
                borderRadius: 10,
                paddingVertical: 8,
                paddingHorizontal: 10,
                marginBottom: 12,
                borderLeftWidth: 3,
                borderLeftColor: t.brand
            }
        }, h(Text, { style: { color: t.text, fontSize: 15 } }, quote || "(empty status)")),
        TextInput ? h(TextInput, {
            value: text,
            onChangeText: onChange,
            onChange: onChange,
            placeholder: "Write a reply…",
            placeholderTextColor: t.muted,
            multiline: true,
            autoFocus: true,
            style: {
                minHeight: 64,
                maxHeight: 120,
                backgroundColor: t.bgSecondary,
                color: t.text,
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 8,
                fontSize: 16,
                marginBottom: 12
            }
        }) : null,
        h(View, { style: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center" } },
            h(Pressable || View, {
                onPress: closeReplyWindow,
                style: { paddingVertical: 10, paddingHorizontal: 14, marginRight: 8 }
            }, h(Text, { style: { color: t.muted, fontSize: 16, fontWeight: "600" } }, "Cancel")),
            h(Pressable || View, {
                onPress: function () { doSend(); },
                style: {
                    backgroundColor: t.brand,
                    borderRadius: 10,
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    opacity: sending ? 0.6 : 1
                }
            }, h(Text, { style: { color: "#fff", fontSize: 16, fontWeight: "700" } }, sending ? "Sending…" : "Send"))
        )
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
    if (!overlay.open) {
        return h(View, { pointerEvents: "none", style: { width: 0, height: 0 } });
    }
    var t = themeColors();
    var card = h(ReplySheet, { user: overlay.user, status: overlay.status });
    var Pressable = RN.Pressable || RN.TouchableOpacity || View;
    return h(View, {
        pointerEvents: "auto",
        style: {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 99999,
            elevation: 50,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 28
        }
    },
        h(Pressable, {
            onPress: closeReplyWindow,
            style: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }
        }),
        h(View, { style: { width: "100%", maxWidth: 360 }, pointerEvents: "auto" }, card)
    );
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

function collectText(node, acc, depth) {
    if (depth > 10 || node == null) return acc;
    if (typeof node === "string" || typeof node === "number") {
        acc.push(String(node));
        return acc;
    }
    if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) collectText(node[i], acc, depth + 1);
        return acc;
    }
    if (typeof node === "object" && node.props) {
        if (typeof node.props.children !== "undefined") collectText(node.props.children, acc, depth + 1);
        if (typeof node.props.text === "string") acc.push(node.props.text);
        if (typeof node.props.accessibilityLabel === "string") acc.push(node.props.accessibilityLabel);
    }
    return acc;
}

function nodeHasStatus(node, status) {
    if (!status) return false;
    var txt = collectText(node, [], 0).join(" ");
    if (status.text && txt.indexOf(status.text) >= 0) return true;
    if (!status.text && status.emojiName && txt.indexOf(status.emojiName) >= 0) return true;
    return false;
}

function isSmallStatusNode(node, status) {
    if (!node || !node.props || node.__mimeRtsDecorated) return false;
    if (!nodeHasStatus(node, status)) return false;
    var txt = collectText(node, [], 0).join(" ");
    var seed = status.text || status.emojiName || "";
    var extra = status.emojiId ? 48 : 32;
    if (txt.length > seed.length + extra) return false;
    return true;
}

function styleHasRadius(style) {
    if (!style) return false;
    if (Array.isArray(style)) {
        for (var i = 0; i < style.length; i++) if (styleHasRadius(style[i])) return true;
        return false;
    }
    if (typeof style !== "object") return false;
    return style.borderRadius > 0
        || style.borderTopLeftRadius > 0
        || style.borderTopRightRadius > 0;
}

function replyIconElement(color, size) {
    size = size || 16;
    color = color || "#fff";
    var iconNames = [
        "ArrowAngleLeftUpIcon",
        "ArrowAngleLeftUp",
        "ReplyIcon",
        "ChatReplyIcon",
        "ArrowBendUpLeftIcon"
    ];
    var i;
    for (i = 0; i < iconNames.length; i++) {
        var Comp = findByName(iconNames[i]) || findByDisplayName(iconNames[i]) || findByTypeName(iconNames[i]);
        if (typeof Comp === "function" && !isEsClass(Comp)) {
            return h(Comp, { size: size, color: color, colorPrimary: color });
        }
        var mod = findByName(iconNames[i], false) || findByDisplayName(iconNames[i], false);
        if (mod && typeof mod.default === "function" && !isEsClass(mod.default)) {
            return h(mod.default, { size: size, color: color, colorPrimary: color });
        }
        var byProps = findByProps(iconNames[i]);
        if (byProps && typeof byProps[iconNames[i]] === "function") {
            return h(byProps[iconNames[i]], { size: size, color: color, colorPrimary: color });
        }
    }
    var assetMod = findByProps("getAssetByName") || findByProps("registerAsset", "getAssetByName");
    var getAsset = assetMod && assetMod.getAssetByName;
    var Icon = findByName("Icon") || (findByProps("Icon") && findByProps("Icon").Icon);
    var Image = (getRN() || {}).Image;
    var assetNames = [
        "ic_reply_24px",
        "ic_reply",
        "reply",
        "ic_arrow_angle_left_up_24px",
        "ArrowAngleLeftUp",
        "ic_message_reply"
    ];
    if (typeof getAsset === "function") {
        for (i = 0; i < assetNames.length; i++) {
            var src = null;
            try { src = getAsset(assetNames[i]); } catch (_e) {}
            if (src == null) continue;
            if (typeof Icon === "function") return h(Icon, { source: src, size: size, color: color });
            if (Image) return h(Image, { source: src, style: { width: size, height: size }, tintColor: color });
        }
    }
    var Text = (getRN() || {}).Text;
    return Text ? h(Text, { style: { color: color, fontSize: size, fontWeight: "700" } }, "\u21A9") : null;
}

function getTypeName(type) {
    if (!type) return "";
    if (typeof type === "string") return type;
    if (type.displayName) return String(type.displayName);
    if (type.name && type.name !== "anonymous" && type.name !== "_default") return String(type.name);
    if (type.type) return getTypeName(type.type);
    if (type.render) return getTypeName(type.render);
    return "";
}

function isStatusTypeName(name) {
    if (!name) return false;
    if (/MemberList|GuildMember|NameTag|ListItem|UserList/i.test(name)) return false;
    return /UserProfileCustomStatus|ProfileCustomStatus|UserProfileStatus|^CustomStatus$/i.test(name);
}

function isMemberListContext(props, type) {
    var name = getTypeName(type);
    if (/MemberList|GuildMember|NameTag|UserList|ListItem/i.test(name)) return true;
    if (!props) return false;
    if (props.guildId || props.guild) return true;
    if (props.listType || props.compact === true) return true;
    return false;
}

function isIgnorableCreatedType(type, name) {
    if (type === "Text" || type === "Image" || type === "RCTText" || type === "RCTImage") return true;
    if (!name) return false;
    if (/^(Text|Image|RCTText|RCTImage)$/.test(name)) return true;
    if (/Icon$|Emoji$/i.test(name) && !/CustomStatus/i.test(name)) return true;
    return false;
}

function looksLikeChipStyle(style) {
    if (styleHasRadius(style)) return true;
    if (style == null) return false;
    if (typeof style === "number") return true;
    if (Array.isArray(style)) {
        for (var i = 0; i < style.length; i++) if (looksLikeChipStyle(style[i])) return true;
        return false;
    }
    if (typeof style !== "object") return false;
    if (style.flexDirection === "row" && (style.alignItems === "center" || style.paddingHorizontal > 0 || style.paddingLeft > 0 || style.overflow === "hidden")) return true;
    return false;
}

function makeOutputWrapper(Inner, userId, status) {
    if (typeof Inner === "function" && Inner.__mimeRtsStatusWrap) return Inner;
    function MimeRtsWrap(props) {
        var el = h(Inner, props);
        if (!inProfileSurface()) return el;
        return wrapWithReplyArrow(el, userId, status);
    }
    MimeRtsWrap.__mimeRtsStatusWrap = true;
    MimeRtsWrap.displayName = "MimeRtsWrap";
    return MimeRtsWrap;
}

function looksLikeStatusChip(node, status) {
    if (!node || !node.props || !status) return false;
    if (statusFromProps(node.props)) return true;
    var txt = collectText(node, [], 0).join(" ");
    var seed = status.text || status.emojiName || "";
    if (!seed || txt.indexOf(seed) < 0) return false;
    if (txt.length > seed.length + 96) return false;
    return styleHasRadius(node.props.style) || txt.length <= seed.length + 24;
}

function decorateProfileTree(node, userId, status) {
    if (node == null || typeof node !== "object") return node;
    if (node.__mimeRtsDecorated) return node;
    if (Array.isArray(node)) {
        var changed = false;
        var arr = [];
        for (var i = 0; i < node.length; i++) {
            var n = decorateProfileTree(node[i], userId, status);
            if (n !== node[i]) changed = true;
            arr.push(n);
        }
        return changed ? arr : node;
    }
    if (!node.type && !node.props) return node;
    var props = node.props || {};
    var nextChildren = decorateProfileTree(props.children, userId, status);
    var type = node.type;
    var name = getTypeName(type);
    var asStatusComp = !didPlaceButton
        && (typeof type === "function" || (type && typeof type === "object"))
        && isStatusTypeName(name);
    if (asStatusComp && /UserProfileActionSheet|UserProfileModal|^UserProfile$|UserProfileHeader/i.test(name)) {
        asStatusComp = false;
    }
    var asChip = !asStatusComp && !didPlaceButton && looksLikeStatusChip(node, status);
    if (!asStatusComp && !asChip && nextChildren === props.children) return node;
    var nextType = asStatusComp ? makeOutputWrapper(type, userId, status) : type;
    var merged = Object.assign({}, props);
    if (nextChildren !== props.children) merged.children = nextChildren;
    var created = h(nextType, merged);
    if (!created) return node;
    if (asChip) created = wrapWithReplyArrow(created, userId, status);
    return created;
}

function makeReplyButton(userId, status, extraStyle) {
    if (didPlaceButton) return null;
    var RN = getRN() || {};
    var Pressable = RN.Pressable || RN.TouchableOpacity || RN.TouchableHighlight;
    if (!Pressable) return null;
    didPlaceButton = true;
    var t = themeColors();
    function fire(e) {
        try {
            if (e && typeof e.stopPropagation === "function") e.stopPropagation();
            if (e && typeof e.preventDefault === "function") e.preventDefault();
        } catch (_e) {}
        openReplyWindow(userId, status || customStatusForUser(userId));
    }
    var icon = replyIconElement(t.text, 16);
    return h(Pressable, {
        onPress: fire,
        onPressIn: fire,
        hitSlop: 12,
        pointerEvents: "auto",
        accessibilityLabel: "Reply to Status",
        style: Object.assign({
            width: 28,
            height: 28,
            borderRadius: 8,
            backgroundColor: t.bg,
            borderWidth: 1,
            borderColor: t.border,
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            elevation: 20
        }, extraStyle || {})
    }, icon);
}

function makeInlineReplyRow(userId, status) {
    var RN = getRN() || {};
    var View = RN.View;
    if (!View) return makeReplyButton(userId, status);
    return h(View, {
        key: "mime-rts-inline",
        pointerEvents: "box-none",
        style: {
            alignSelf: "stretch",
            alignItems: "flex-end",
            paddingRight: 12,
            paddingVertical: 6,
            zIndex: 20,
            elevation: 8
        }
    }, makeReplyButton(userId, status), h(OverlayHost, { key: "mime-rts-sheet-overlay" }));
}

function isScrollName(name) {
    return /ScrollView|BottomSheetScrollView|FlashList|FlatList/i.test(String(name || ""));
}

function pinButtonOver(children, userId, status) {
    var RN = getRN() || {};
    var View = RN.View;
    if (!View) return children;
    var btn = makeReplyButton(userId, status, {
        position: "absolute",
        top: 152,
        right: 12,
        zIndex: 9999,
        elevation: 20
    });
    if (!btn) return children;
    return h(View, {
        pointerEvents: "box-none",
        style: { position: "relative" }
    }, children, btn, h(OverlayHost, { key: "mime-rts-sheet-overlay" }));
}

function injectOnceInNamedScroll(node, userId, status, depth) {
    if (depth == null) depth = 0;
    if (!node || typeof node !== "object" || depth > 14 || didPlaceButton) return { node: node, did: false };
    if (Array.isArray(node)) {
        var any = false;
        var arr = [];
        var i;
        for (i = 0; i < node.length; i++) {
            var r = injectOnceInNamedScroll(node[i], userId, status, depth + 1);
            if (r.did) any = true;
            arr.push(r.node);
            if (any) {
                for (i = i + 1; i < node.length; i++) arr.push(node[i]);
                break;
            }
        }
        return { node: any ? arr : node, did: any };
    }
    var props = node.props || {};
    var name = getTypeName(node.type);
    if (isScrollName(name)) {
        var over = pinButtonOver(props.children, userId, status);
        return { node: h(node.type, Object.assign({}, props, { children: over })), did: !!didPlaceButton };
    }
    if (typeof props.children !== "undefined") {
        var inner = injectOnceInNamedScroll(props.children, userId, status, depth + 1);
        if (inner.did) {
            return { node: h(node.type, Object.assign({}, props, { children: inner.node })), did: true };
        }
    }
    return { node: node, did: false };
}

function injectInlineInScroll(node, userId, status) {
    return injectOnceInNamedScroll(node, userId, status, 0);
}

function wrapWithReplyArrow(el, userId, status) {
    if (!el || el.__mimeRtsDecorated) return el;
    var RN = getRN() || {};
    var View = RN.View;
    if (!View) return el;
    var btn = makeReplyButton(userId, status, {
        position: "absolute",
        bottom: 4,
        right: 4,
        zIndex: 80,
        elevation: 8
    });
    if (!btn) return el;
    var wrapped = h(View, {
        pointerEvents: "box-none",
        style: { position: "relative", overflow: "visible", alignSelf: "flex-start" }
    }, el, btn);
    if (wrapped) wrapped.__mimeRtsDecorated = true;
    return wrapped || el;
}

function findBestStatusNode(node, status, best, depth) {
    if (!node || typeof node !== "object" || depth > 16) return best;
    if (node.__mimeRtsDecorated) return best;
    if (treeHasArrow(node, 0)) return best;
    if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) best = findBestStatusNode(node[i], status, best, depth + 1);
        return best;
    }
    if (!node.props) return best;
    var ch = node.props.children;
    if (Array.isArray(ch)) {
        for (var j = 0; j < ch.length; j++) best = findBestStatusNode(ch[j], status, best, depth + 1);
    } else if (ch && typeof ch === "object") {
        best = findBestStatusNode(ch, status, best, depth + 1);
    }
    if (best && best.node) return best;
    if (!nodeHasStatus(node, status)) return best;
    var txt = collectText(node, [], 0).join(" ");
    var seed = status.text || status.emojiName || "";
    if (txt.length > Math.max(seed.length + 96, 180)) return best;
    var score = 1;
    if (styleHasRadius(node.props.style)) score += 6;
    if (node.props.style && (node.props.style.flexDirection === "row" || (Array.isArray(node.props.style) && node.props.style.some && node.props.style.some(function (s) { return s && s.flexDirection === "row"; })))) score += 2;
    if (!best || score > best.score || (score === best.score && depth >= best.depth)) {
        best = { node: node, score: score, depth: depth };
    }
    return best;
}

function replaceNode(root, target, replacement) {
    if (root === target) return replacement;
    if (!root || typeof root !== "object") return root;
    if (Array.isArray(root)) {
        for (var i = 0; i < root.length; i++) root[i] = replaceNode(root[i], target, replacement);
        return root;
    }
    if (!root.props) return root;
    var ch = root.props.children;
    if (ch === target) {
        root.props.children = replacement;
        return root;
    }
    if (Array.isArray(ch)) {
        for (var j = 0; j < ch.length; j++) {
            if (ch[j] === target) ch[j] = replacement;
            else ch[j] = replaceNode(ch[j], target, replacement);
        }
    } else if (ch && typeof ch === "object") {
        root.props.children = replaceNode(ch, target, replacement);
    }
    return root;
}

function treeHasArrow(node, depth) {
    if (!node || depth > 14) return false;
    if (node.__mimeRtsDecorated) return true;
    if (node.props && node.props.accessibilityLabel === "Reply to Status") return true;
    if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) if (treeHasArrow(node[i], depth + 1)) return true;
        return false;
    }
    if (node.props && node.props.children) return treeHasArrow(node.props.children, depth + 1);
    return false;
}

function decorateTree(node, userId, status) {
    if (!node || typeof node !== "object") return node;
    var best = findBestStatusNode(node, status, null, 0);
    if (!best || !best.node) return node;
    return replaceNode(node, best.node, wrapWithReplyArrow(best.node, userId, status));
}

function wrapSheetWithFloatingButton(res, userId, status) {
    if (!res || res.__mimeRtsDecorated) return res;
    var RN = getRN() || {};
    var View = RN.View;
    var Pressable = RN.Pressable || RN.TouchableOpacity;
    if (!View || !Pressable) return res;
    var t = themeColors();
    var icon = replyIconElement(t.header, 16);
    var btn = h(Pressable, {
        onPress: function () { openReplyWindow(userId, status); },
        accessibilityLabel: "Reply to Status",
        hitSlop: 8,
        style: {
            position: "absolute",
            top: 132,
            right: 16,
            width: 28,
            height: 28,
            borderRadius: 8,
            backgroundColor: t.bgFloating,
            alignItems: "center",
            justifyContent: "center",
            zIndex: 80,
            elevation: 8
        }
    }, icon);
    var wrapped = h(View, { style: { flex: 1 }, pointerEvents: "box-none" }, res, btn);
    if (wrapped) wrapped.__mimeRtsDecorated = true;
    return wrapped || res;
}

function forceInjectReply(res, userId, status) {
    if (didPlaceButton) return res;
    if (res && res.props && typeof res.props.children !== "undefined") {
        var ch = res.props.children;
        var list = Array.isArray(ch) ? ch.slice() : [ch];
        var insertAt = Math.min(1, list.length);
        list.splice(insertAt, 0, makeInlineReplyRow(userId, status));
        return h(res.type, Object.assign({}, res.props, { children: list })) || res;
    }
    var RN = getRN() || {};
    if (RN.View) return h(RN.View, { pointerEvents: "box-none" }, makeInlineReplyRow(userId, status), res);
    return makeInlineReplyRow(userId, status) || res;
}

function countElements(node, depth) {
    if (node == null || depth > 8) return 0;
    if (Array.isArray(node)) {
        var n = 0;
        var i;
        for (i = 0; i < node.length && i < 24; i++) n += countElements(node[i], depth + 1);
        return n;
    }
    if (typeof node !== "object") return 0;
    var c = 1;
    if (node.props) c += countElements(node.props.children, depth + 1);
    return c;
}

function afterProfileRender(args, res) {
    var props = args && args[0];
    var userId = userIdFromProps(props) || profileUserId;
    if (!userId && props && props.user) userId = props.user.id || props.user.userId;
    if (userId && !shouldSkipUser(userId)) enterProfile([{ userId: userId, user: props && props.user }]);
    profileDidRender = true;
    if (!res) return res;
    var status = statusFromProps(props) || (userId && customStatusForUser(userId));
    if (userId && status && !shouldSkipUser(userId) && !didPlaceButton) {
        try { res = forceInjectReply(res, userId, status) || res; } catch (err) { logError("forceInject", err); }
    }
    var Ctx = getProfileFlagContext();
    if (Ctx) res = h(Ctx.Provider, { value: true }, res) || res;
    if (!overlayAnchored) res = injectOverlay(res);
    return res;
}

function isEsClass(fn) {
    if (typeof fn !== "function") return false;
    try {
        var src = Function.prototype.toString.call(fn);
        if (/^\s*class[\s{]/.test(src)) return true;
    } catch (_e) {}
    return false;
}

var profileSheetOpen = false;
var profileUserId = null;
var didPlaceButton = false;
var profileDidRender = false;
var lastProfileOpenAt = 0;
var ProfileFlagContext = null;

function getProfileFlagContext() {
    if (ProfileFlagContext) return ProfileFlagContext;
    var React = getReact();
    if (!React || typeof React.createContext !== "function") return null;
    try { ProfileFlagContext = React.createContext(false); } catch (_e) { return null; }
    return ProfileFlagContext;
}

function ownerLooksLikeProfile() {
    try {
        var React = getReact();
        var internals = React && (
            React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
            || React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
        );
        if (!internals) return false;
        var owner = (internals.ReactCurrentOwner && internals.ReactCurrentOwner.current)
            || internals.A
            || null;
        var n = 0;
        while (owner && n < 28) {
            var tn = getTypeName(owner.type || owner.elementType || owner);
            if (/MemberList|GuildMember/i.test(tn)) return false;
            if (/UserProfile|ProfileActionSheet|MimeProfileGate|MimeRtsWrap/i.test(tn) && !/Edit|Settings|Preview/i.test(tn)) return true;
            owner = owner.return || owner._debugOwner || owner._debugStack || null;
            n++;
        }
    } catch (_e) {}
    return false;
}

function isInsideProfileTree() {
    var ctx = ProfileFlagContext;
    if (ctx && (ctx._currentValue === true || ctx._currentValue2 === true)) return true;
    return ownerLooksLikeProfile();
}

function inProfileSurface() {
    return isInsideProfileTree() || !!profileSheetOpen;
}

function enterProfile(args) {
    var id = userIdFromProps(args && args[0]);
    if (!id && args && args[0] && args[0].user) id = args[0].user.id;
    var switching = !!(id && profileUserId && String(id) !== String(profileUserId));
    var fresh = !profileSheetOpen;
    profileSheetOpen = true;
    lastProfileOpenAt = Date.now();
    if (fresh || switching) {
        didPlaceButton = false;
        profileDidRender = false;
    }
    if (id) profileUserId = String(id);
}

function leaveProfile() {
    profileSheetOpen = false;
    profileUserId = null;
    didPlaceButton = false;
    profileDidRender = false;
}

function armProfile(userId) {
    profileSheetOpen = true;
    profileDidRender = true;
    didPlaceButton = false;
    lastProfileOpenAt = Date.now();
    if (userId) profileUserId = String(userId);
}

function wrapExport(obj, key, afterFn, opts) {
    opts = opts || {};
    var orig = obj[key];
    if (typeof orig !== "function") return null;
    if (orig.__mimeRtsWrapped) return null;
    if (isEsClass(orig)) return null;
    function wrapped() {
        var constructed = typeof new.target !== "undefined" && new.target;
        if (opts.gateProfile) enterProfile(arguments);
        if (constructed) {
            try {
                return Reflect.construct(orig, Array.prototype.slice.call(arguments), new.target);
            } catch (_e) {
                return orig.apply(this, arguments);
            }
        }
        var ret = orig.apply(this, arguments);
        if (typeof afterFn === "function") {
            try {
                var next = afterFn(arguments, ret);
                if (next !== undefined) ret = next;
            } catch (err) {
                logError("wrap", key, err);
            }
        }
        return ret;
    }
    wrapped.__mimeRtsWrapped = true;
    try { Object.defineProperty(wrapped, "name", { value: orig.name }); } catch (_e2) {}
    wrapped.displayName = orig.displayName || orig.name;
    try {
        Object.keys(orig).forEach(function (k) {
            try { wrapped[k] = orig[k]; } catch (_e3) {}
        });
    } catch (_e4) {}
    obj[key] = wrapped;
    unpatches.push(function () {
        if (obj[key] === wrapped) obj[key] = orig;
    });
    return true;
}

function tryWrapKey(obj, key, afterFn, opts) {
    if (!obj || typeof obj[key] !== "function") return false;
    if (isEsClass(obj[key])) return false;
    return !!wrapExport(obj, key, afterFn, opts);
}

function wrapFunctionComponent(orig, afterFn, opts) {
    opts = opts || {};
    if (typeof orig !== "function" || orig.__mimeRtsWrapped) return orig;
    if (isEsClass(orig)) return orig;
    function wrapped() {
        if (opts.gateProfile) enterProfile(arguments);
        var constructed = typeof new.target !== "undefined" && new.target;
        if (constructed) {
            try {
                return Reflect.construct(orig, Array.prototype.slice.call(arguments), new.target);
            } catch (_e) {
                return orig.apply(this, arguments);
            }
        }
        var ret = orig.apply(this, arguments);
        if (typeof afterFn === "function") {
            try {
                var next = afterFn(arguments, ret);
                if (next !== undefined) ret = next;
            } catch (err) {
                logError("wrapFn", err);
            }
        }
        return ret;
    }
    wrapped.__mimeRtsWrapped = true;
    try { Object.defineProperty(wrapped, "name", { value: orig.name }); } catch (_e2) {}
    wrapped.displayName = orig.displayName || orig.name;
    try {
        Object.keys(orig).forEach(function (k) {
            try { wrapped[k] = orig[k]; } catch (_e3) {}
        });
    } catch (_e4) {}
    try { if (orig.prototype) wrapped.prototype = orig.prototype; } catch (_e5) {}
    return wrapped;
}

function wrapComponentModule(mod, afterFn, opts) {
    if (!mod) return false;
    if (typeof mod === "function") return false;
    var ok = false;
    if (tryWrapKey(mod, "default", afterFn, opts)) ok = true;
    if (tryWrapKey(mod, "type", afterFn, opts)) ok = true;
    if (tryWrapKey(mod, "Z", afterFn, opts)) ok = true;
    if (tryWrapKey(mod, "ZP", afterFn, opts)) ok = true;
    if (mod.default && typeof mod.default === "object") {
        if (tryWrapKey(mod.default, "type", afterFn, opts)) ok = true;
        if (tryWrapKey(mod.default, "render", afterFn, opts)) ok = true;
    }
    if (mod.type && typeof mod.type === "object") {
        if (tryWrapKey(mod.type, "type", afterFn, opts)) ok = true;
    }
    if (mod.prototype && tryWrapKey(mod.prototype, "render", afterFn, opts)) ok = true;
    return ok;
}

function findModuleByName(name) {
    var roots = metroRoots();
    var i;
    for (i = 0; i < roots.length; i++) {
        var r = roots[i];
        if (typeof r.find === "function") {
            try {
                var found = r.find(function (exp) {
                    if (!exp) return false;
                    function hit(fn) {
                        return fn && (fn.name === name || fn.displayName === name);
                    }
                    return hit(exp)
                        || hit(exp.default)
                        || hit(exp.Z)
                        || hit(exp.ZP)
                        || hit(exp.type)
                        || (exp.default && hit(exp.default.type));
                });
                if (found) return found;
            } catch (_e) {}
        }
    }
    return findByName(name, false) || findByDisplayName(name, false) || findByTypeName(name, false);
}

function patchNamedComponent(name, afterFn, opts) {
    var raw = findModuleByName(name);
    if (raw && wrapComponentModule(raw, afterFn, opts)) {
        log("patched", name);
        return true;
    }
    var roots = metroRoots();
    var i;
    for (i = 0; i < roots.length; i++) {
        var r = roots[i];
        try { if (r.findByName) raw = r.findByName(name, false); } catch (_e) { raw = null; }
        if (raw && wrapComponentModule(raw, afterFn, opts)) {
            log("patched", name);
            return true;
        }
        try { if (r.findByDisplayName) raw = r.findByDisplayName(name, false); } catch (_e2) { raw = null; }
        if (raw && wrapComponentModule(raw, afterFn, opts)) {
            log("patched display", name);
            return true;
        }
        try { if (r.findByTypeName) raw = r.findByTypeName(name, false); } catch (_e3) { raw = null; }
        if (raw && wrapComponentModule(raw, afterFn, opts)) {
            log("patched type", name);
            return true;
        }
    }
    return false;
}

var overlayAnchored = false;

function shouldAttachToCreated(type, props, el, status) {
    if (!el || !status) return false;
    if (el.__mimeRtsDecorated) return false;
    if (props && props.accessibilityLabel === "Reply to Status") return false;
    var name = getTypeName(type);
    if (isMemberListContext(props, type)) return false;
    if (/^CustomStatus$/i.test(name)) return false;
    if (isStatusTypeName(name)) return true;
    var txt = collectText(el, [], 0).join(" ");
    var seed = status.text || status.emojiName || "";
    var exact = !!(seed && txt.replace(/^\s+|\s+$/g, "") === seed);
    if (exact && txt.length < 160) return true;
    if (isIgnorableCreatedType(type, name)) return false;
    if (!isSmallStatusNode(el, status)) return false;
    if (looksLikeChipStyle(props && props.style)) return true;
    if (typeof type === "string" && /Pressable|TouchableOpacity|TouchableHighlight/.test(type)) return true;
    if (/Pressable|TouchableOpacity|TouchableHighlight/.test(name)) return true;
    if (type === "View" || name === "View" || name === "RCTView") {
        if (!seed) return false;
        if (txt.indexOf(seed) >= 0 && txt.length <= seed.length + 8) return true;
    }
    return false;
}

function maybeDecorateCreated(type, el) {
    if (!el || !profileSheetOpen || didPlaceButton) return el;
    if (!profileDidRender && !isInsideProfileTree()) return el;
    var props = el.props || {};
    if (isMemberListContext(props, type)) return el;
    var userId = userIdFromProps(props) || profileUserId;
    if (!userId || shouldSkipUser(userId)) return el;
    var status = statusFromProps(props) || customStatusForUser(userId);
    if (!status) return el;
    if (!shouldAttachToCreated(type, props, el, status)) return el;
    return wrapWithReplyArrow(el, userId, status);
}

function wrapElementFactory(obj, key) {
    if (!obj || typeof obj[key] !== "function") return false;
    var orig = obj[key];
    if (orig.__mimeRtsEl) return false;
    function wrapped(type) {
        var el = orig.apply(this, arguments);
        try {
            var next = maybeDecorateCreated(type, el);
            if (next !== undefined) el = next;
        } catch (err) {
            logError("createElement", err);
        }
        return el;
    }
    wrapped.__mimeRtsEl = true;
    try { obj[key] = wrapped; } catch (_e) { return false; }
    unpatches.push(function () {
        if (obj[key] === wrapped) obj[key] = orig;
    });
    return true;
}

function eachMetroExport(filter, cb) {
    var roots = metroRoots();
    var i;
    for (i = 0; i < roots.length; i++) {
        var r = roots[i];
        var allFns = [r.findAll, r.findAllExports, r.findAllModule, r.findByPropsAll];
        var j;
        for (j = 0; j < allFns.length; j++) {
            if (typeof allFns[j] !== "function") continue;
            try {
                var list = allFns[j].call(r, filter);
                if (!list) continue;
                if (!Array.isArray(list)) list = [list];
                var k;
                for (k = 0; k < list.length; k++) if (list[k]) cb(list[k]);
            } catch (_e) {}
        }
        if (typeof r.find === "function") {
            try {
                var one = r.find(filter);
                if (one) cb(one);
            } catch (_e2) {}
        }
    }
}

function patchElementFactories() {
    var n = 0;
    function patchMod(mod) {
        if (!mod || typeof mod !== "object") return;
        if (typeof mod.createElement === "function" && wrapElementFactory(mod, "createElement")) n++;
        if (typeof mod.jsx === "function" && wrapElementFactory(mod, "jsx")) n++;
        if (typeof mod.jsxs === "function" && wrapElementFactory(mod, "jsxs")) n++;
        if (typeof mod.jsxDEV === "function" && wrapElementFactory(mod, "jsxDEV")) n++;
    }
    patchMod(getReact());
    patchMod(findByProps("jsx", "jsxs"));
    patchMod(findByProps("createElement", "useState"));
    try {
        eachMetroExport(function (exp) {
            return !!(exp && (typeof exp.jsx === "function" || typeof exp.jsxs === "function") && (exp.jsx || exp.jsxs));
        }, patchMod);
    } catch (_e) {}
    log("element factory patches", n);
    return n;
}

function afterStatusRender(args, res) {
    if (!profileSheetOpen || !profileDidRender) return res;
    var props = args && args[0];
    if (isMemberListContext(props)) return res;
    var userId = userIdFromProps(props) || profileUserId;
    if (!userId) return res;
    if (shouldSkipUser(userId)) return res;
    if (props && props.activity && !isCustomActivity(props.activity) && !props.customStatus) return res;
    var status = statusFromProps(props) || customStatusForUser(userId);
    if (!status || !res) return res;
    if (treeHasArrow(res, 0)) return res;
    return wrapWithReplyArrow(res, userId, status);
}

function patchStatusComponents() {
    var names = [
        "UserProfileCustomStatus",
        "ProfileCustomStatus",
        "UserProfileStatus",
        "ProfileStatus",
        "StatusWidget"
    ];
    var total = 0;
    for (var i = 0; i < names.length; i++) {
        if (patchNamedComponent(names[i], afterStatusRender)) total++;
    }
    log("status component patches", total);
    return total;
}

function patchProfileComponents() {
    var names = [
        "UserProfileActionSheet",
        "UserProfile",
        "UserProfileModal",
        "UserProfileHeader",
        "UserProfileCard",
        "UserProfileInfo",
        "UserProfileTopSection",
        "ProfileHeader",
        "ProfilePrimaryInfo",
        "UserProfileBannerInfo",
        "UserProfileBottomSheet",
        "UserProfileV2",
        "ProfileSheet",
        "FullUserProfile",
        "UserInfoModal"
    ];
    var opts = { gateProfile: true };
    var total = 0;
    for (var i = 0; i < names.length; i++) {
        if (patchNamedComponent(names[i], afterProfileRender, opts)) total++;
    }
    log("profile patches", total);
    return total;
}

function userIdFromProfileKey(key) {
    if (!key) return null;
    var m = String(key).match(/UserProfile[_-]?(\d{16,22})/i);
    return m ? m[1] : null;
}

function isProfileSheetKey(key) {
    if (!key) return false;
    var s = String(key);
    if (/Edit|Settings|Preview/i.test(s)) return false;
    return /UserProfile/i.test(s) || !!userIdFromProfileKey(s);
}

function wrapProfileModule(mod) {
    if (!mod) return mod;
    if (typeof mod === "function") {
        if (isEsClass(mod)) {
            if (mod.prototype && typeof mod.prototype.render === "function") {
                wrapExport(mod.prototype, "render", afterProfileRender, { gateProfile: true });
            }
            return mod;
        }
        return wrapFunctionComponent(mod, afterProfileRender, { gateProfile: true });
    }
    var keys = ["default", "type", "Z", "ZP"];
    var i;
    for (i = 0; i < keys.length; i++) {
        var fn = mod[keys[i]];
        if (typeof fn !== "function" || fn.__mimeRtsWrapped) continue;
        if (isEsClass(fn)) {
            if (fn.prototype && typeof fn.prototype.render === "function") {
                wrapExport(fn.prototype, "render", afterProfileRender, { gateProfile: true });
            }
            continue;
        }
        var wrapped = wrapFunctionComponent(fn, afterProfileRender, { gateProfile: true });
        if (wrapped === fn) continue;
        try {
            mod[keys[i]] = wrapped;
        } catch (_e) {
            var copy = {};
            try { Object.keys(mod).forEach(function (k) { copy[k] = mod[k]; }); } catch (_e2) {}
            copy[keys[i]] = wrapped;
            wrapComponentModule(copy, afterProfileRender, { gateProfile: true });
            return copy;
        }
    }
    wrapComponentModule(mod, afterProfileRender, { gateProfile: true });
    return mod;
}

function wrapFactory(factory) {
    if (typeof factory === "function") {
        return function () {
            var out = factory.apply(this, arguments);
            if (out && typeof out.then === "function") {
                return out.then(function (m) { return wrapProfileModule(m); });
            }
            return wrapProfileModule(out);
        };
    }
    if (factory && typeof factory.then === "function") {
        return factory.then(function (m) { return wrapProfileModule(m); });
    }
    return wrapProfileModule(factory);
}

function patchSheetMethods(sheet) {
    if (!sheet) return false;
    var ok = false;
    ["openLazy", "open"].forEach(function (method) {
        if (typeof sheet[method] !== "function" || sheet[method].__mimeRtsWrapped) return;
        var orig = sheet[method];
        sheet[method] = function () {
            var args = Array.prototype.slice.call(arguments);
            var key = null;
            var props = null;
            var fi = -1;
            var i;
            for (i = 0; i < args.length; i++) {
                var a = args[i];
                if (typeof a === "string" && isProfileSheetKey(a)) key = a;
                if (a && typeof a === "object" && typeof a.then !== "function" && !Array.isArray(a) && (a.userId || a.user || a.guildId || a.channelId || a.userID)) props = a;
                if (fi < 0 && (typeof a === "function" || (a && typeof a.then === "function") || (a && (a.default || a.type)))) fi = i;
            }
            if (key) {
                var uid = userIdFromProfileKey(key) || userIdFromProps(props);
                enterProfile([{ userId: uid, user: props && props.user }]);
                log("profile sheet", method, key, uid);
                if (method === "open" && typeof args[0] === "function") {
                    args[0] = wrapFunctionComponent(args[0], afterProfileRender, { gateProfile: true });
                } else if (fi >= 0) {
                    args[fi] = wrapFactory(args[fi]);
                }
            }
            return orig.apply(this, args);
        };
        sheet[method].__mimeRtsWrapped = true;
        unpatches.push(function () {
            if (sheet[method] && sheet[method].__mimeRtsWrapped) sheet[method] = orig;
        });
        ok = true;
        log("patched ActionSheet." + method);
    });
    return ok;
}

function patchActionSheetOpen() {
    var ok = false;
    var sheet = findByProps("openLazy", "hideActionSheet")
        || findByProps("openLazy")
        || findByProps("open", "hideActionSheet");
    if (patchSheetMethods(sheet)) ok = true;
    try {
        eachMetroExport(function (exp) {
            return !!(exp && typeof exp.openLazy === "function");
        }, function (exp) {
            if (patchSheetMethods(exp)) ok = true;
        });
    } catch (_e) {}
    return ok;
}

function patchHideActionSheet() {
    var sheet = findByProps("hideActionSheet", "openLazy") || findByProps("hideActionSheet");
    if (!sheet || typeof sheet.hideActionSheet !== "function") return false;
    return !!wrapExport(sheet, "hideActionSheet", function (args) {
        var key = args && args[0];
        if (key && !isProfileSheetKey(key) && typeof key === "string") return;
        var opened = 0;
        try { opened = lastProfileOpenAt || 0; } catch (_e) {}
        if (Date.now() - opened < 1200) return;
        leaveProfile();
    });
}

function patchOverlayAnchor() {
    var names = ["App", "AppContainer", "MainApp", "Chat", "ConnectedChat"];
    for (var i = 0; i < names.length; i++) {
        if (patchNamedComponent(names[i], function (_args, res) {
            return injectOverlay(res);
        })) {
            overlayAnchored = true;
            log("overlay host on", names[i]);
            return true;
        }
    }
    return false;
}

function start() {
    overlayAnchored = false;
    profileSheetOpen = false;
    profileUserId = null;
    didPlaceButton = false;
    getProfileFlagContext();
    patchElementFactories();
    patchStatusComponents();
    patchProfileComponents();
    patchActionSheetOpen();
    patchHideActionSheet();
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
    wrapWithReplyArrow: wrapWithReplyArrow,
    decorateTree: decorateTree,
    decorateProfileTree: decorateProfileTree,
    isSmallStatusNode: isSmallStatusNode,
    isEsClass: isEsClass,
    wrapComponentModule: wrapComponentModule,
    replyIconElement: replyIconElement,
    afterStatusRender: afterStatusRender,
    afterProfileRender: afterProfileRender,
    wrapProfileModule: wrapProfileModule,
    enterProfile: enterProfile,
    armProfile: armProfile,
    leaveProfile: leaveProfile,
    getProfileFlagContext: getProfileFlagContext,
    isInsideProfileTree: isInsideProfileTree,
    isMemberListContext: isMemberListContext,
    maybeDecorateCreated: maybeDecorateCreated,
    injectOnceInNamedScroll: injectOnceInNamedScroll,
    forceInjectReply: forceInjectReply,
    countElements: countElements,
    userIdFromProfileKey: userIdFromProfileKey,
    isProfileSheetKey: isProfileSheetKey,
    QUICK_REACTS: QUICK_REACTS
});
