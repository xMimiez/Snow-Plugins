/*
  PreviewFile — Snow spec-3 port of m4fn3/PreviewFile (Enmity).
  Original: mafu. Snow port: Mime | N0_.q3.
  https://github.com/m4fn3/PreviewFile
*/
var unpatches = [];
var _storage;
var KNOWN_FORMATS = ["application/json", "application/javascript"];

function getMod() {
    var list = [];
    try { if (typeof snow !== "undefined" && snow) list.push(snow); } catch (_e) {}
    try { if (typeof bunny !== "undefined" && bunny) list.push(bunny); } catch (_e2) {}
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    if (g.snow) list.push(g.snow);
    if (g.bunny) list.push(g.bunny);
    if (g.vendetta) list.push(g.vendetta);
    function ok(m) {
        return m && ((m.api && (m.api.flux || m.api.patcher)) || m.plugin || m.metro);
    }
    var i;
    for (i = 0; i < list.length; i++) if (ok(list[i]) && list[i].api) return list[i];
    for (i = 0; i < list.length; i++) if (ok(list[i])) return list[i];
    return list[0] || {};
}

function metroRoots() {
    var roots = [];
    var mod = getMod();
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    [mod.metro, mod.metro && mod.metro.common, g.vendetta && g.vendetta.metro].forEach(function (r) {
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

function getReact() {
    var mod = getMod();
    return (mod.metro && mod.metro.common && mod.metro.common.React)
        || findByProps("createElement", "useState")
        || (typeof globalThis !== "undefined" && globalThis.React);
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

function mimeType(att) {
    if (!att || !att.content_type) return "";
    return String(att.content_type).split(";")[0].trim().toLowerCase();
}

function isPreviewableAttachment(att) {
    var t = mimeType(att);
    if (!t) return false;
    if (t.indexOf("text/") === 0) return true;
    return KNOWN_FORMATS.indexOf(t) >= 0;
}

function filenameFromUrl(url) {
    var last = String(url || "file").split("/").pop() || "file";
    return last.split("?")[0] || last;
}

function extFromName(name) {
    var parts = String(name || "").split(".");
    return parts.length > 1 ? parts.pop() : "";
}

function buildPreview(attachment, text) {
    var filename = filenameFromUrl(attachment && attachment.url);
    var ext = extFromName(filename);
    var savedLines = numSetting("lines", 10);
    var lines = String(text == null ? "" : text).split("\n");
    if (lines.length > savedLines) lines = lines.slice(0, savedLines);
    return "`" + filename + "` ```" + ext + "\n" + lines.join("\n") + "\n```\n";
}

function rangeEnd(attachment) {
    var savedSize = numSetting("size", 1000);
    var size = attachment && attachment.size != null ? Number(attachment.size) : savedSize;
    if (isNaN(size) || size < 0) size = savedSize;
    return size > savedSize ? savedSize : size;
}

function doFetch(url, opts) {
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    var fn = g.fetch || (typeof fetch === "function" ? fetch : null);
    if (!fn) return Promise.reject(new Error("no fetch"));
    return fn(url, opts);
}

function parseMessage(message) {
    if (!message || !message.attachments || !message.attachments.length) return Promise.resolve(false);
    if (message._previewFile) return Promise.resolve(false);
    var atts = message.attachments.filter(isPreviewableAttachment);
    if (!atts.length) return Promise.resolve(false);
    message._previewFile = true;
    var Flux = getFluxDispatcher();
    return atts.reduce(function (chain, att) {
        return chain.then(function (acc) {
            var end = rangeEnd(att);
            return doFetch(att.url, { headers: { Range: "bytes=0-" + end } }).then(function (resp) {
                return resp && typeof resp.text === "function" ? resp.text() : "";
            }).then(function (text) {
                acc.push(buildPreview(att, text));
                return acc;
            }).catch(function (err) {
                try { console.error("[PreviewFile] fetch", att && att.url, err); } catch (_e) {}
                return acc;
            });
        });
    }, Promise.resolve([])).then(function (parts) {
        var preview = parts.join("");
        if (!preview) return false;
        message.content = (message.content || "") + "\n\n" + preview;
        if (Flux && typeof Flux.dispatch === "function") {
            Flux.dispatch({ type: "MESSAGE_UPDATE", message: message, ignore: true });
        }
        try { console.log("[PreviewFile] previewed", message.id); } catch (_e2) {}
        return true;
    }).catch(function (err) {
        try { console.error("[PreviewFile] parseMessage", err); } catch (_e3) {}
        message._previewFile = false;
        return false;
    });
}

function handlePayload(payload) {
    if (!payload) return;
    if (payload.type === "LOAD_MESSAGES_SUCCESS" || (payload.messages && !payload.message && !payload.type)) {
        var messages = payload.messages || [];
        messages.filter(function (m) { return m && m.attachments && m.attachments.length; }).forEach(function (m) {
            parseMessage(m);
        });
        return;
    }
    if (payload.type === "MESSAGE_CREATE" || payload.message) {
        var message = payload.message;
        if (message && message.attachments && message.attachments.length) parseMessage(message);
    }
}

function fluxHandler(event) {
    try { handlePayload(event); } catch (err) {
        try { console.error("[PreviewFile] flux", err); } catch (_e) {}
    }
}

function patchStore() {
    var patcher = getMod().api && getMod().api.patcher;
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
    return patched;
}

function start() {
    stop();
    var patchedStore = patchStore();
    if (patchedStore) {
        try { console.log("[PreviewFile] patched MessageStore handlers"); } catch (_e) {}
    } else {
        var mod = getMod();
        if (mod.api && mod.api.flux && typeof mod.api.flux.intercept === "function") {
            unpatches.push(mod.api.flux.intercept(fluxHandler));
            try { console.log("[PreviewFile] flux.intercept attached"); } catch (_e2) {}
        }
        var Flux = getFluxDispatcher();
        if (Flux && typeof Flux.subscribe === "function") {
            var onCreate = function (payload) { handlePayload({ type: "MESSAGE_CREATE", message: payload && (payload.message || payload) }); };
            var onLoad = function (payload) { handlePayload(payload || { type: "LOAD_MESSAGES_SUCCESS" }); };
            Flux.subscribe("MESSAGE_CREATE", onCreate);
            if (typeof Flux.subscribe === "function") Flux.subscribe("LOAD_MESSAGES_SUCCESS", onLoad);
            unpatches.push(function () {
                try { Flux.unsubscribe("MESSAGE_CREATE", onCreate); } catch (_e3) {}
                try { Flux.unsubscribe("LOAD_MESSAGES_SUCCESS", onLoad); } catch (_e4) {}
            });
            try { console.log("[PreviewFile] FluxDispatcher.subscribe attached"); } catch (_e5) {}
        }
    }
    try { console.log("[PreviewFile] started"); } catch (_e6) {}
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
    try { console.log("[PreviewFile toast]", message); } catch (_e3) {}
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
            label: "Max file size",
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
    rangeEnd: rangeEnd,
    filenameFromUrl: filenameFromUrl,
    getStorage: getStorage,
    getStoreHandlers: getStoreHandlers,
    numSetting: numSetting
});
