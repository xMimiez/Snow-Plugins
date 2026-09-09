/* Debug Console — Snow spec-3. Snow SDK: capture bunny during eval. */
var B = (typeof bunny !== "undefined" && bunny) || (typeof snow !== "undefined" && snow) || null;
var lines = [];
var unhooks = [];
var MAX = 400;

function getMod() {
    if (B && (B.commands || B.metro || B.ui || B.api || B.plugin)) return B;
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
    if (a instanceof Error) return a.name + ": " + a.message + (a.stack ? "\n" + a.stack : "");
    try { return JSON.stringify(a); } catch (_e) { return String(a); }
}

function pushLine(level, args) {
    var parts = [];
    for (var i = 0; i < args.length; i++) parts.push(fmtArg(args[i]));
    var text = "[" + stamp() + "] " + level + " " + parts.join(" ");
    lines.push(text);
    if (lines.length > MAX) lines.splice(0, lines.length - MAX);
}

function hookConsole() {
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    var c = g.console || console;
    ["log", "info", "warn", "error", "debug"].forEach(function (method) {
        var orig = c[method] ? c[method].bind(c) : function () {};
        c[method] = function () {
            try { pushLine(method.toUpperCase(), arguments); } catch (_e) {}
            try { return orig.apply(c, arguments); } catch (_e2) {}
        };
        unhooks.push(function () { c[method] = orig; });
    });
}

function hookErrors() {
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    if (g.ErrorUtils && typeof g.ErrorUtils.getGlobalHandler === "function") {
        var prev = g.ErrorUtils.getGlobalHandler();
        g.ErrorUtils.setGlobalHandler(function (err, isFatal) {
            pushLine("FATAL", [isFatal ? "fatal" : "error", err]);
            if (typeof prev === "function") prev(err, isFatal);
        });
        unhooks.push(function () {
            try { g.ErrorUtils.setGlobalHandler(prev); } catch (_e) {}
        });
    }
    var onErr = function (ev) {
        pushLine("ONERROR", [ev && (ev.message || ev.error || ev)]);
    };
    if (typeof g.addEventListener === "function") {
        try {
            g.addEventListener("error", onErr);
            g.addEventListener("unhandledrejection", function (ev) {
                pushLine("REJECT", [ev && (ev.reason || ev)]);
            });
        } catch (_e) {}
    }
}

function dumpText() {
    return lines.length ? lines.join("\n") : "(no logs yet — trigger /gifroulette then /console)";
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

function openWindow() {
    pushLine("INFO", ["opening console window"]);
    var React = getReact();
    var RN = getRN();
    var text = dumpText();
    var shown = false;
    var snippet = text.length > 1500 ? text.slice(-1500) : text;

    if (RN && RN.Alert && typeof RN.Alert.alert === "function") {
        try {
            RN.Alert.alert("Debug logs", snippet, [
                { text: "Copy", onPress: function () { copyText(text); } },
                { text: "OK" }
            ]);
            shown = true;
        } catch (e2) {
            pushLine("ERROR", ["Alert.alert failed", e2]);
        }
    }

    var alerts = (getMod().ui && getMod().ui.alerts)
        || (typeof globalThis !== "undefined" && globalThis.vendetta && globalThis.vendetta.ui && globalThis.vendetta.ui.alerts);
    if (!shown && alerts && typeof alerts.showCustomAlert === "function" && React && RN && RN.Text) {
        try {
            function ConsolePanel() {
                var ScrollView = RN.ScrollView;
                var Text = RN.Text;
                var inner = React.createElement(Text, { selectable: true, style: { color: "#d4d4d4", fontSize: 11 } }, text);
                if (ScrollView) return React.createElement(ScrollView, { style: { maxHeight: 420 } }, inner);
                return inner;
            }
            alerts.showCustomAlert(ConsolePanel);
            shown = true;
        } catch (e) {
            pushLine("ERROR", ["showCustomAlert failed", e]);
        }
    }

    copyText(text);
    return shown;
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
    hookConsole();
    hookErrors();
    pushLine("INFO", ["Debug Console loaded"]);
    var mod = getMod();
    var register = mod.api && mod.api.commands && mod.api.commands.registerCommand
        || (mod.commands && mod.commands.registerCommand);
    if (register) {
        unregisters.push(register(prepare({
            name: "console",
            description: "Open the debug console overlay and dump recent logs",
            options: [],
            execute: function (_opts, ctx) {
                var opened = openWindow();
                var id = ctx && ctx.channel && ctx.channel.id;
                var header = opened ? "Console opened. Last logs:" : "Could not open overlay. Last logs (also copied if clipboard exists):";
                sendBot(id, { content: header });
                chunkSend(id, dumpText());
            }
        })));
        unregisters.push(register(prepare({
            name: "consoleclear",
            description: "Clear captured debug logs",
            options: [],
            execute: function (_opts, ctx) {
                lines = [];
                pushLine("INFO", ["cleared"]);
                sendBot(ctx && ctx.channel && ctx.channel.id, { content: "Debug console cleared." });
            }
        })));
    }
}

function stop() {
    for (var i = 0; i < unhooks.length; i++) try { unhooks[i](); } catch (_e) {}
    unhooks = [];
    for (var j = 0; j < unregisters.length; j++) try { unregisters[j](); } catch (_e2) {}
    unregisters = [];
}

function SettingsComponent() {
    var React = getReact();
    if (!React) return null;
    var RN = getRN() || {};
    var Text = RN.Text;
    var View = RN.View;
    var ScrollView = RN.ScrollView;
    if (!Text || !View) return null;
    var [, bump] = React.useState(0);
    var logNode = React.createElement(Text, { selectable: true, style: { color: "#c0c0c0", fontSize: 11 } }, dumpText());
    return React.createElement(View, { style: { padding: 12 } },
        React.createElement(Text, { style: { color: "#fff", marginBottom: 8 } }, "Debug Console — /console dumps logs. Tap refresh after errors."),
        React.createElement(Text, {
            onPress: function () { bump(function (n) { return n + 1; }); },
            style: { color: "#5865F2", marginBottom: 8 }
        }, "Refresh"),
        ScrollView ? React.createElement(ScrollView, { style: { maxHeight: 480 } }, logNode) : logNode
    );
}

const plugin = definePlugin({
    start: start,
    stop: stop,
    onLoad: start,
    onUnload: stop,
    SettingsComponent: SettingsComponent,
    settings: SettingsComponent
});
