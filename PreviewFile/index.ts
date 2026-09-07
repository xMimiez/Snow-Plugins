/*
  PreviewFile — Snow spec-3 port of m4fn3/PreviewFile (Enmity).
  Original: mafu. Snow port: Mime | N0_.q3.
  https://github.com/m4fn3/PreviewFile

  Enmity mutated message.content + MESSAGE_UPDATE. That no longer
  redraws iOS chat. This port fetches into a cache and injects a
  code block in DCDChatManager.updateRows (same path as HighlightCode).
*/
var unpatches = [];
var _storage;
var previewCache = {};
var fetchInflight = {};
var KNOWN_FORMATS = ["application/json", "application/javascript", "application/xml", "application/x-javascript", "application/typescript"];
var TEXT_EXT = {
    txt: 1, text: 1, log: 1, md: 1, markdown: 1, json: 1, js: 1, jsx: 1, ts: 1, tsx: 1,
    py: 1, rb: 1, php: 1, c: 1, h: 1, cpp: 1, hpp: 1, cc: 1, java: 1, go: 1, rs: 1,
    lua: 1, kt: 1, kts: 1, swift: 1, sh: 1, bash: 1, zsh: 1, bat: 1, cmd: 1, ps1: 1,
    css: 1, scss: 1, html: 1, htm: 1, xml: 1, csv: 1, yml: 1, yaml: 1, ini: 1, toml: 1,
    cfg: 1, conf: 1, env: 1, sql: 1, graphql: 1, vue: 1, svelte: 1, diff: 1, patch: 1,
    gradle: 1, properties: 1, gitignore: 1, dockerfile: 1, makefile: 1
};

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
    if (found) return found;
    try {
        var rn = require("react-native");
        if (rn && rn.View) return rn;
    } catch (_e) {}
    return findByProps("View", "Text", "NativeModules")
        || findByProps("NativeModules")
        || findByProps("View", "Text");
}

function getNativeModules() {
    var RN = getRN();
    if (RN && RN.NativeModules) return RN.NativeModules;
    try {
        var rn = require("react-native");
        if (rn && rn.NativeModules) return rn.NativeModules;
    } catch (_e) {}
    return findByProps("DCDChatManager") || {};
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
        if (obj[method] !== orig || typeof un === "function") {
            log("patched", kind, method, "name-first");
            return typeof un === "function" ? un : function () {};
        }
    } catch (err) {
        logError("patch name-first", method, err && err.message);
    }
    try {
        var un2 = patcher[kind](obj, method, cb);
        if (obj[method] !== orig || typeof un2 === "function") {
            log("patched", kind, method, "obj-first");
            return typeof un2 === "function" ? un2 : function () {};
        }
    } catch (err2) {
        logError("patch obj-first", method, err2 && err2.message);
    }
    return null;
}

function getStorage() {
    if (_storage) return _storage;
    try { _storage = getMod().plugin.createStorage(); } catch (_e) { _storage = {}; }
    if (_storage.size === undefined) _storage.size = "1000";
    if (_storage.lines === undefined) _storage.lines = "10";
    return _storage;
}

function numSetting(key, fallback) {
    var n = Number(getStorage()[key]);
    if (typeof n !== "number" || isNaN(n) || n < 0) return fallback;
    return n;
}

function getFluxDispatcher() {
    return findByProps("_currentDispatchActionType", "_subscriptions", "_actionHandlers", "_waitQueue")
        || findByProps("dispatch", "subscribe", "unsubscribe")
        || findByProps("_actionHandlers")
        || (getMod()._test && getMod()._test.dispatcher);
}

function getStoreHandlers(storeName) {
    var Flux = getFluxDispatcher();
    if (!Flux) return null;
    var graph = Flux._actionHandlers && Flux._actionHandlers._dependencyGraph;
    var nodes = graph && graph.nodes;
    if (!nodes) return null;
    var keys = Object.keys(nodes);
    for (var i = 0; i < keys.length; i++) {
        if (nodes[keys[i]] && nodes[keys[i]].name === storeName) {
            return nodes[keys[i]].actionHandler;
        }
    }
    return null;
}

function log() {
    try { console.log.apply(console, ["[PreviewFile]"].concat([].slice.call(arguments))); } catch (_e) {}
}

function logError() {
    try { console.error.apply(console, ["[PreviewFile]"].concat([].slice.call(arguments))); } catch (_e) {}
}

function listAttachments(message) {
    if (!message) return [];
    var a = message.attachments;
    if (!a) return [];
    if (Array.isArray(a)) return a;
    if (typeof a.toArray === "function") try { return a.toArray(); } catch (_e) {}
    if (typeof a.forEach === "function") {
        var out = [];
        try { a.forEach(function (x) { out.push(x); }); return out; } catch (_e2) {}
    }
    return [];
}

function mimeType(att) {
    if (!att) return "";
    var raw = att.content_type || att.contentType || "";
    return String(raw).split(";")[0].trim().toLowerCase();
}

function filenameOf(att) {
    if (!att) return "file";
    if (att.filename) return String(att.filename).split("?")[0];
    if (att.fileName) return String(att.fileName).split("?")[0];
    return filenameFromUrl(att.url || att.proxy_url || att.proxyURL || "");
}

function filenameFromUrl(url) {
    var last = String(url || "file").split("/").pop() || "file";
    return last.split("?")[0] || last;
}

function extOf(att) {
    var name = filenameOf(att).toLowerCase();
    var parts = name.split(".");
    return parts.length > 1 ? parts.pop() : "";
}

function isPreviewableAttachment(att) {
    if (!att) return false;
    var t = mimeType(att);
    if (t.indexOf("text/") === 0) return true;
    if (KNOWN_FORMATS.indexOf(t) >= 0) return true;
    var ext = extOf(att);
    return !!(ext && TEXT_EXT[ext]);
}

function urlOf(att) {
    return (att && (att.url || att.proxy_url || att.proxyURL)) || "";
}

function rangeEnd(attachment) {
    var savedSize = numSetting("size", 1000);
    var size = attachment && attachment.size != null ? Number(attachment.size) : savedSize;
    if (isNaN(size) || size < 0) size = savedSize;
    return size > savedSize ? savedSize : size;
}

function buildPreview(attachment, text) {
    var filename = filenameOf(attachment);
    var ext = extOf(attachment);
    var savedLines = numSetting("lines", 10);
    var lines = String(text == null ? "" : text).split("\n");
    if (lines.length > savedLines) lines = lines.slice(0, savedLines);
    return "`" + filename + "` ```" + ext + "\n" + lines.join("\n") + "\n```\n";
}

function clipText(text) {
    var savedLines = numSetting("lines", 10);
    var lines = String(text == null ? "" : text).split("\n");
    if (lines.length > savedLines) lines = lines.slice(0, savedLines);
    return lines.join("\n");
}

function doFetch(url, opts) {
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    var fn = g.fetch || (typeof fetch === "function" ? fetch : null);
    if (!fn) return Promise.reject(new Error("no fetch"));
    return fn(url, opts);
}

function fetchAttachmentText(att) {
    var url = urlOf(att);
    if (!url) return Promise.reject(new Error("no url"));
    var end = rangeEnd(att);
    var headers = { Accept: "text/plain,*/*" };
    return doFetch(url, { method: "GET", headers: Object.assign({ Range: "bytes=0-" + end }, headers) }).then(function (resp) {
        if (!resp || (resp.status && resp.status >= 400)) {
            return doFetch(url, { method: "GET", headers: headers });
        }
        return resp;
    }).then(function (resp) {
        if (!resp) throw new Error("empty response");
        if (resp.status && resp.status >= 400 && resp.status !== 206) throw new Error("http " + resp.status);
        return typeof resp.text === "function" ? resp.text() : "";
    }).then(function (text) {
        if (text && text.length > end + 1) text = text.slice(0, end + 1);
        return text;
    });
}

function refreshMessage(message) {
    try {
        var Flux = getFluxDispatcher();
        var channelId = message.channel_id || message.channelId;
        var store = findByStoreName("MessageStore");
        var live = store && typeof store.getMessage === "function" && channelId
            ? store.getMessage(channelId, message.id)
            : null;
        var payload = live || message;
        if (Flux && typeof Flux.dispatch === "function") {
            Flux.dispatch({ type: "MESSAGE_UPDATE", message: payload, log_edit: false });
        }
    } catch (err) {
        logError("refresh", err);
    }
}

function ensureCached(att, message) {
    var url = urlOf(att);
    if (!url) return;
    if (previewCache[url] && previewCache[url].status === "ok") return;
    if (fetchInflight[url]) return;
    fetchInflight[url] = true;
    previewCache[url] = previewCache[url] || { status: "loading" };
    log("fetch", filenameOf(att), url);
    fetchAttachmentText(att).then(function (text) {
        previewCache[url] = { status: "ok", text: clipText(text), filename: filenameOf(att), ext: extOf(att) };
        log("cached", filenameOf(att), (text || "").length);
        if (message) refreshMessage(message);
    }).catch(function (err) {
        previewCache[url] = { status: "err", error: String(err && err.message || err) };
        logError("fetch failed", filenameOf(att), err);
    }).then(function () {
        fetchInflight[url] = false;
    });
}

function injectBlocks(message, blocks) {
    if (!blocks.length) return false;
    if (Array.isArray(message.content)) {
        for (var i = 0; i < blocks.length; i++) {
            var b = blocks[i];
            message.content.push({
                type: "paragraph",
                content: [{ type: "text", content: b.filename }]
            });
            message.content.push({
                type: "codeBlock",
                lang: b.ext || "txt",
                content: b.text
            });
        }
        return true;
    }
    var md = "";
    for (var j = 0; j < blocks.length; j++) {
        md += buildPreview({ filename: blocks[j].filename, url: blocks[j].filename }, blocks[j].text);
    }
    message.content = (message.content || "") + "\n\n" + md;
    return true;
}

function handleMessageRecord(message) {
    if (!message) return false;
    var atts = listAttachments(message).filter(isPreviewableAttachment);
    if (!atts.length) return false;
    var blocks = [];
    for (var i = 0; i < atts.length; i++) {
        var url = urlOf(atts[i]);
        var cached = previewCache[url];
        if (cached && cached.status === "ok") {
            blocks.push({
                filename: cached.filename || filenameOf(atts[i]),
                ext: cached.ext || extOf(atts[i]),
                text: cached.text
            });
        } else {
            ensureCached(atts[i], message);
        }
    }
    if (!blocks.length) return false;
    return injectBlocks(message, blocks);
}

function handleRow(row) {
    if (!row || !row.message) return;
    handleMessageRecord(row.message);
}

function transformRowsJson(json) {
    var rows = typeof json === "string" ? JSON.parse(json) : json;
    if (!Array.isArray(rows)) return json;
    for (var i = 0; i < rows.length; i++) handleRow(rows[i]);
    return typeof json === "string" ? JSON.stringify(rows) : rows;
}

function parseMessage(message) {
    if (!message) return Promise.resolve(false);
    var atts = listAttachments(message).filter(isPreviewableAttachment);
    if (!atts.length) return Promise.resolve(false);
    var pending = atts.map(function (att) {
        var url = urlOf(att);
        if (previewCache[url] && previewCache[url].status === "ok") return Promise.resolve(true);
        return fetchAttachmentText(att).then(function (text) {
            previewCache[url] = { status: "ok", text: clipText(text), filename: filenameOf(att), ext: extOf(att) };
            return true;
        }).catch(function (err) {
            previewCache[url] = { status: "err", error: String(err && err.message || err) };
            logError("parseMessage fetch", err);
            return false;
        });
    });
    return Promise.all(pending).then(function (oks) {
        var any = oks.some(Boolean);
        if (any) {
            handleMessageRecord(message);
            refreshMessage(message);
        }
        return any;
    });
}

function handlePayload(payload) {
    if (!payload) return;
    if (payload.type === "LOAD_MESSAGES_SUCCESS" || (payload.messages && !payload.message)) {
        var messages = payload.messages || [];
        for (var i = 0; i < messages.length; i++) {
            var m = messages[i];
            if (listAttachments(m).length) parseMessage(m);
        }
        return;
    }
    var message = payload.message || ((payload.content || payload.attachments) && payload);
    if (message && listAttachments(message).length) parseMessage(message);
}

function fluxHandler(event) {
    try { handlePayload(event); } catch (err) { logError("flux", err); }
}

function patchNativeRows() {
    var ok = false;
    var NM = getNativeModules() || {};
    var names = [];
    try { names = Object.keys(NM); } catch (_e) {}
    for (var i = 0; i < names.length; i++) {
        var nativeMod = NM[names[i]];
        if (nativeMod && typeof nativeMod.updateRows === "function") {
            var un = patchMethod("before", nativeMod, "updateRows", function (args) {
                try { if (args && args[1] != null) args[1] = transformRowsJson(args[1]); } catch (err) { logError("updateRows", err); }
            });
            if (un) {
                unpatches.push(un);
                ok = true;
                log("updateRows on", names[i]);
            }
        }
    }
    var RowManager = findByName("RowManager");
    var proto = RowManager && (RowManager.prototype || RowManager);
    if (proto && typeof proto.generate === "function") {
        var unRm = patchMethod("after", proto, "generate", function (_args, row) {
            try { handleRow(row); } catch (err2) { logError("RowManager.generate", err2); }
            return row;
        });
        if (unRm) {
            unpatches.push(unRm);
            ok = true;
        }
    }
    return ok;
}

function patchStore() {
    var patcher = getPatcher();
    if (!patcher || typeof patcher.before !== "function") return false;
    var handlers = getStoreHandlers("MessageStore");
    if (!handlers) return false;
    var patched = false;
    if (typeof handlers.LOAD_MESSAGES_SUCCESS === "function") {
        unpatches.push(patcher.before("LOAD_MESSAGES_SUCCESS", handlers, function (args) {
            try { if (args && args[0]) handlePayload({ type: "LOAD_MESSAGES_SUCCESS", messages: args[0].messages }); } catch (_e) {}
        }));
        patched = true;
    }
    if (typeof handlers.MESSAGE_CREATE === "function") {
        unpatches.push(patcher.before("MESSAGE_CREATE", handlers, function (args) {
            try { if (args && args[0]) handlePayload({ type: "MESSAGE_CREATE", message: args[0].message }); } catch (_e2) {}
        }));
        patched = true;
    }
    if (patched) log("patched MessageStore handlers");
    return patched;
}

function start() {
    stop();
    patchNativeRows();
    patchStore();
    var mod = getMod();
    if (mod.api && mod.api.flux && typeof mod.api.flux.intercept === "function") {
        unpatches.push(mod.api.flux.intercept(fluxHandler));
        log("flux.intercept attached");
    }
    var Flux = getFluxDispatcher();
    if (Flux && typeof Flux.subscribe === "function") {
        var onCreate = function (payload) { handlePayload({ type: "MESSAGE_CREATE", message: payload && (payload.message || payload) }); };
        var onLoad = function (payload) { handlePayload(payload && payload.messages ? payload : { type: "LOAD_MESSAGES_SUCCESS", messages: payload && payload.messages }); };
        Flux.subscribe("MESSAGE_CREATE", onCreate);
        Flux.subscribe("LOAD_MESSAGES_SUCCESS", onLoad);
        unpatches.push(function () {
            try { Flux.unsubscribe("MESSAGE_CREATE", onCreate); } catch (_e3) {}
            try { Flux.unsubscribe("LOAD_MESSAGES_SUCCESS", onLoad); } catch (_e4) {}
        });
        log("FluxDispatcher.subscribe attached");
    }
    log("started");
}

function stop() {
    for (var i = 0; i < unpatches.length; i++) {
        try { if (typeof unpatches[i] === "function") unpatches[i](); } catch (_e) {}
    }
    unpatches = [];
}

function showToast(message) {
    var t = findByProps("showToast") || findByProps("open") || (getMod().ui && getMod().ui.toasts);
    if (t && t.showToast) {
        try { t.showToast(message); return; } catch (_e) {}
    }
    if (t && t.open) {
        try { t.open({ content: message }); return; } catch (_e2) {}
    }
    log("toast", message);
}

function SettingsComponent() {
    var React = getReact();
    if (!React) return null;
    var store = getStorage();
    var comps = (getMod().metro && getMod().metro.common && getMod().metro.common.components) || {};
    var TableRowGroup = comps.TableRowGroup;
    var TextInput = comps.TextInput;
    var [, bump] = React.useState(0);
    function refresh() { bump(function (n) { return n + 1; }); }
    function setNum(key, raw) {
        if (raw === "" || raw == null) return;
        if (isNaN(Number(raw))) {
            showToast("You entered an invalid number");
            return;
        }
        store[key] = String(raw);
        refresh();
    }
    var children = [];
    if (TextInput) {
        children.push(React.createElement(TextInput, {
            key: "size",
            label: "Max file size (bytes)",
            value: String(store.size == null ? "1000" : store.size),
            onChange: function (v) { setNum("size", v); },
            onChangeText: function (v) { setNum("size", v); }
        }));
        children.push(React.createElement(TextInput, {
            key: "lines",
            label: "Max number of lines",
            value: String(store.lines == null ? "10" : store.lines),
            onChange: function (v) { setNum("lines", v); },
            onChangeText: function (v) { setNum("lines", v); }
        }));
    }
    if (TableRowGroup) return React.createElement(TableRowGroup, { title: "SETTING" }, children);
    var RN = findByProps("View", "Text");
    if (RN && RN.View) return React.createElement(RN.View, { style: { padding: 12 } }, children);
    return children.length ? children[0] : null;
}

const plugin = definePlugin({
    start: start,
    stop: stop,
    onLoad: start,
    onUnload: stop,
    SettingsComponent: SettingsComponent,
    settings: SettingsComponent,
    isPreviewableAttachment: isPreviewableAttachment,
    buildPreview: buildPreview,
    parseMessage: parseMessage,
    handlePayload: handlePayload,
    handleMessageRecord: handleMessageRecord,
    transformRowsJson: transformRowsJson,
    rangeEnd: rangeEnd,
    filenameFromUrl: filenameFromUrl,
    filenameOf: filenameOf,
    getStorage: getStorage,
    getStoreHandlers: getStoreHandlers,
    numSetting: numSetting,
    previewCache: previewCache
});
