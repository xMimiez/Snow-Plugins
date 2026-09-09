/* Debug Console — Snow/Bunny spec-3. Captures console + errors and shows them in-app. */
var lines = [];
var unhooks = [];
var MAX = 400;
var listeners = [];
var updateTimer = null;
var sequence = 0;
var running = false;
var CONSOLE_KEY = "mime-debug-console";

function getMod() {
    var list = [];
    try { if (typeof snow !== "undefined" && snow) list.push(snow); } catch (_e) {}
    try { if (typeof bunny !== "undefined" && bunny) list.push(bunny); } catch (_e2) {}
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    if (g.snow) list.push(g.snow);
    if (g.bunny) list.push(g.bunny);
    if (g.vendetta) list.push(g.vendetta);
    for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m && ((m.api && m.api.commands && m.api.commands.registerCommand) || (m.commands && m.commands.registerCommand))) return m;
    }
    return list[0] || {};
}

function metroFindByProps() {
    var args = arguments;
    var mod = getMod();
    var roots = [mod.metro, mod.metro && mod.metro.common, (typeof globalThis !== "undefined" && globalThis.vendetta && globalThis.vendetta.metro)].filter(Boolean);
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
        || (typeof window !== "undefined" && window.React)
        || (typeof globalThis !== "undefined" && globalThis.React);
}

function getRN() {
    var mod = getMod();
    return (mod.metro && mod.metro.common && mod.metro.common.ReactNative)
        || metroFindByProps("View", "Text", "ScrollView")
        || (typeof globalThis !== "undefined" && globalThis.ReactNative);
}

function stamp() {
    try { return new Date().toISOString().slice(11, 23); } catch (_e) { return ""; }
}

function fmtArg(a) {
    if (a == null) return String(a);
    if (typeof a === "string") return a;
    if (a instanceof Error || (a && a.stack && a.message)) return a.stack || a.name + ": " + a.message;
    var seen = [];
    try {
        var text = JSON.stringify(a, function (_key, value) {
            if (typeof value === "bigint") return String(value);
            if (value && typeof value === "object") {
                if (seen.indexOf(value) >= 0) return "[Circular]";
                seen.push(value);
            }
            return value;
        }, 2);
        return text === undefined ? String(a) : text;
    } catch (_e) { return String(a); }
}

function notify() {
    if (updateTimer != null) return;
    updateTimer = setTimeout(function () {
        updateTimer = null;
        listeners.slice().forEach(function (fn) { try { fn(); } catch (_e) {} });
    }, 100);
}

function clearConsole() {
    lines = [];
    notify();
}

function pushLine(level, args) {
    var parts = [];
    for (var i = 0; i < args.length; i++) parts.push(fmtArg(args[i]));
    var message = parts.join(" ");
    if (message.length > 12000) message = message.slice(0, 12000) + "\n[truncated]";
    var last = lines[lines.length - 1];
    if (last && last.level === level && last.message === message) {
        last.count++;
        last.time = stamp();
    } else {
        lines.push({ id: ++sequence, time: stamp(), level: level, message: message, count: 1 });
        if (lines.length > MAX) lines.splice(0, lines.length - MAX);
    }
    notify();
}

function hookConsole() {
    var c = globalThis.console;
    ["log", "info", "warn", "error", "debug"].forEach(function (method) {
        var orig = c[method];
        function capture() {
            try { pushLine(method.toUpperCase(), arguments); } catch (_e) {}
            if (typeof orig === "function") return orig.apply(c, arguments);
        }
        c[method] = capture;
        unhooks.push(function () { if (c[method] === capture) c[method] = orig; });
    });
}

function hookErrors() {
    var g = globalThis;
    if (g.ErrorUtils && typeof g.ErrorUtils.getGlobalHandler === "function") {
        var prev = g.ErrorUtils.getGlobalHandler();
        function handler(err, fatal) {
            pushLine(fatal ? "FATAL" : "ERROR", [err]);
            if (typeof prev === "function") prev(err, fatal);
        }
        g.ErrorUtils.setGlobalHandler(handler);
        unhooks.push(function () { if (g.ErrorUtils.getGlobalHandler() === handler) g.ErrorUtils.setGlobalHandler(prev); });
    }
    if (typeof g.addEventListener === "function" && typeof g.removeEventListener === "function") {
        var onError = function (ev) { pushLine("ERROR", [ev && (ev.error || ev.message || ev)]); };
        var onReject = function (ev) { pushLine("REJECT", [ev && (ev.reason || ev)]); };
        g.addEventListener("error", onError);
        g.addEventListener("unhandledrejection", onReject);
        unhooks.push(function () {
            g.removeEventListener("error", onError);
            g.removeEventListener("unhandledrejection", onReject);
        });
    }
}

function dumpText() {
    return lines.length ? lines.map(function (line) {
        return "[" + line.time + "] " + line.level + (line.count > 1 ? " ×" + line.count : "") + "\n" + line.message;
    }).join("\n\n") : "No logs yet.";
}

function sendBot(channelId, content) {
    var util = metroFindByProps("sendBotMessage") || (getMod().metro && getMod().metro.common && getMod().metro.common.messageUtil);
    if (util && util.sendBotMessage) {
        try { return util.sendBotMessage(channelId, typeof content === "string" ? content : content); } catch (_e) {
            try { return util.sendBotMessage(channelId, { content: content }); } catch (_e2) {}
        }
    }
}

function chunkSend(channelId, text) {
    var max = 1800;
    if (!text.length) {
        sendBot(channelId, { content: "(empty)" });
        return;
    }
    for (var i = 0; i < text.length; i += max) {
        sendBot(channelId, { content: "```\n" + text.slice(i, i + max) + "\n```" });
    }
}

function copyText(text) {
    var clip = metroFindByProps("setString", "getString") || metroFindByProps("setString");
    if (clip && clip.setString) {
        try { clip.setString(text); return true; } catch (_e) {}
    }
    return false;
}

function closeWindow() {
    var modals = metroFindByProps("pushModal", "popModal");
    if (modals) { try { modals.popModal(CONSOLE_KEY); } catch (_e) {} }
}

function openWindow() {
    var modals = metroFindByProps("pushModal", "popModal");
    if (modals && getReact() && getRN()) {
        try {
            modals.pushModal({ key: CONSOLE_KEY, modal: {
                key: CONSOLE_KEY, modal: ConsoleModal, animation: "slide-up",
                shouldPersistUnderModals: false, closable: true
            } });
            return true;
        } catch (err) { pushLine("ERROR", ["Could not open console page", err]); }
    }
    var RN = getRN() || {};
    if (RN.Alert && RN.Alert.alert) {
        RN.Alert.alert("Debug Console", dumpText().slice(-2500), [
            { text: "Copy logs", onPress: function () { copyText(dumpText()); } },
            { text: "Clear console", style: "destructive", onPress: clearConsole },
            { text: "Close", style: "cancel" }
        ]);
        return true;
    }
    return false;
}

function ConsoleModal() { return ConsolePanel({ onClose: closeWindow }); }

function ConsolePanel(props) {
    var React = getReact();
    var RN = getRN() || {};
    if (!React || !RN.View || !RN.Text) return null;
    var e = React.createElement;
    var state = React.useState(0);
    var filterState = React.useState(false);
    var queryState = React.useState("");
    var statusState = React.useState("");
    React.useEffect(function () {
        function refresh() { state[1](function (n) { return n + 1; }); }
        listeners.push(refresh);
        return function () { var i = listeners.indexOf(refresh); if (i >= 0) listeners.splice(i, 1); };
    }, []);
    function action(label, fn) {
        return e(RN.Pressable || RN.TouchableOpacity, {
            key: label, onPress: fn, accessibilityRole: "button", accessibilityLabel: label,
            style: { paddingVertical: 11, paddingHorizontal: 13, borderRadius: 8, backgroundColor: "#313641", marginRight: 8, marginBottom: 8 }
        }, e(RN.Text, { style: { color: "#f2f3f5", fontSize: 14, fontWeight: "600" } }, label));
    }
    var query = queryState[0].toLowerCase();
    var visible = lines.filter(function (line) {
        return (!filterState[0] || /WARN|ERROR|FATAL|REJECT/.test(line.level)) && (!query || (line.level + " " + line.message).toLowerCase().indexOf(query) >= 0);
    }).slice().reverse();
    function row(line) {
        var color = /ERROR|FATAL|REJECT/.test(line.level) ? "#ff929b" : line.level === "WARN" ? "#f5ce75" : "#97b7ff";
        return e(RN.View, { key: String(line.id), style: { backgroundColor: "#232730", borderLeftWidth: 3, borderLeftColor: color, borderRadius: 6, padding: 12, marginBottom: 9 } },
            e(RN.Text, { style: { color: color, fontSize: 12, fontWeight: "700", marginBottom: 6 } }, line.level + "   " + line.time + (line.count > 1 ? "   ×" + line.count : "")),
            e(RN.Text, { selectable: true, style: { color: "#e5e7eb", fontSize: 13, lineHeight: 19, fontFamily: RN.Platform && RN.Platform.OS === "ios" ? "Menlo" : "monospace" } }, line.message));
    }
    var feed = RN.FlatList ? e(RN.FlatList, {
        data: visible, keyExtractor: function (line) { return String(line.id); },
        renderItem: function (item) { return row(item.item); },
        keyboardShouldPersistTaps: "handled", initialNumToRender: 20,
        style: { flex: 1 }, contentContainerStyle: { paddingBottom: 24 },
        ListEmptyComponent: e(RN.Text, { style: { color: "#b5bac1", paddingVertical: 20 } }, query || filterState[0] ? "No matching logs." : "Console is clear. New logs appear here.")
    }) : e(RN.ScrollView || RN.View, { style: { flex: 1 } }, visible.map(row));
    return e(RN.SafeAreaView || RN.View, { style: { flex: 1, backgroundColor: "#181b21", padding: 16 } },
        e(RN.Text, { style: { color: "#fff", fontSize: 23, fontWeight: "700", marginBottom: 5 } }, "Debug Console"),
        e(RN.Text, { style: { color: "#b5bac1", marginBottom: 14 } }, visible.length + " of " + lines.length + " entries · newest first · live"),
        e(RN.View, { style: { flexDirection: "row", flexWrap: "wrap" } },
            action("Clear console", function () { clearConsole(); statusState[1]("Console cleared"); }),
            action("Copy logs", function () { statusState[1](copyText(dumpText()) ? "Logs copied" : "Clipboard unavailable"); }),
            action(filterState[0] ? "Show all" : "Warnings & errors", function () { filterState[1](!filterState[0]); }),
            props && props.onClose ? action("Close", props.onClose) : null),
        RN.TextInput ? e(RN.TextInput, { value: queryState[0], onChangeText: queryState[1], placeholder: "Search logs or plugin name", placeholderTextColor: "#9ba2af", accessibilityLabel: "Search logs", autoCapitalize: "none", autoCorrect: false, style: { color: "#fff", backgroundColor: "#232730", padding: 12, borderRadius: 8, marginBottom: 12 } }) : null,
        statusState[0] ? e(RN.Text, { accessibilityLiveRegion: "polite", style: { color: "#9ddab5", marginBottom: 10 } }, statusState[0]) : null,
        feed);
}

function prepare(cmd) {
    var out = Object.assign({}, cmd);
    out.displayName = out.name;
    out.displayDescription = out.description;
    out.untranslatedName = out.name;
    out.untranslatedDescription = out.description;
    out.applicationId = "-1";
    out.type = 1;
    out.inputType = 0;
    out.options = (out.options || []).map(function (o) {
        return Object.assign({}, o, {
            displayName: o.name,
            displayDescription: o.description || o.name
        });
    });
    return out;
}


var unregisters = [];

function start() {
    if (running) return;
    running = true;
    hookConsole();
    hookErrors();
    pushLine("INFO", ["Debug Console loaded"]);
    var mod = getMod();
    var api = (mod.api && mod.api.commands) || mod.commands;
    if (!api || !api.registerCommand) return;
    var commands = [prepare({
        name: "console", description: "Open the live debug console", options: [],
        execute: function () { if (!openWindow()) pushLine("WARN", ["Open Debug Console from plugin settings on this build."]); }
    }), prepare({
        name: "consoleclear", description: "Clear captured debug logs", options: [],
        execute: function () { clearConsole(); }
    })];
    commands.forEach(function (cmd, index) {
        var unregister = api.registerCommand(cmd);
        cmd.id = String(-920000 - index);
        if (typeof unregister === "function") unregisters.push(unregister);
    });
    var module = metroFindByProps("getBuiltInCommands");
    var patcher = (mod.api && mod.api.patcher) || mod.patcher;
    if (module && patcher && patcher.after) unregisters.push(patcher.after("getBuiltInCommands", module, function (_args, result) {
        if (!Array.isArray(result)) return result;
        return result.filter(function (cmd) { return cmd && !commands.some(function (c) { return c.name === (cmd.name || cmd.untranslatedName); }); }).concat(commands);
    }));
}

function stop() {
    if (running) closeWindow();
    running = false;
    while (unhooks.length) try { unhooks.pop()(); } catch (_e) {}
    while (unregisters.length) try { unregisters.pop()(); } catch (_e2) {}
    if (updateTimer != null) clearTimeout(updateTimer);
    updateTimer = null;
}

function SettingsComponent() { return ConsolePanel({}); }

const plugin = definePlugin({ start: start, stop: stop, onLoad: start, onUnload: stop, SettingsComponent: SettingsComponent, settings: SettingsComponent });
