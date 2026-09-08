/*
  TestPlugin — Snow spec-3.
  Checks whether extra files besides index.ts can load (require vs sibling fetch).
  /testplugin prints the result.
*/
var unpatches = [];
var lastReport = null;
var FALLBACK_BASE = "https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/TestPlugin/";

function getMod() {
    var list = [];
    try { if (typeof snow !== "undefined" && snow) list.push(snow); } catch (_e) {}
    try { if (typeof bunny !== "undefined" && bunny) list.push(bunny); } catch (_e2) {}
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    if (g.snow) list.push(g.snow);
    if (g.bunny) list.push(g.bunny);
    if (g.vendetta) list.push(g.vendetta);
    function canRegister(m) {
        return m && (
            (m.api && m.api.commands && m.api.commands.registerCommand) ||
            (m.commands && m.commands.registerCommand)
        );
    }
    var i;
    for (i = 0; i < list.length; i++) if (canRegister(list[i])) return list[i];
    for (i = 0; i < list.length; i++) if (list[i] && (list[i].api || list[i].plugin || list[i].metro)) return list[i];
    return list[0] || {};
}

function metroRoots() {
    var roots = [];
    var mod = getMod();
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    function add(r) { if (r && roots.indexOf(r) < 0) roots.push(r); }
    add(mod.metro);
    add(mod.metro && mod.metro.common);
    add(mod.api && mod.api.metro);
    add(g.snow && g.snow.metro);
    add(g.bunny && g.bunny.metro);
    add(g.vendetta && g.vendetta.metro);
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

function pluginBase() {
    var mod = getMod();
    var id = "";
    try { id = (mod.plugin && (mod.plugin.id || (mod.plugin.manifest && mod.plugin.manifest.id))) || ""; } catch (_e) {}
    if (typeof id === "string" && /^https?:\/\//i.test(id)) {
        return id.replace(/\/?$/, "/");
    }
    return FALLBACK_BASE;
}

function tryRequire(rel) {
    try {
        if (typeof require !== "function") return { ok: false, error: "no require" };
        var v = require(rel);
        return { ok: true, value: v };
    } catch (err) {
        return { ok: false, error: String(err && err.message ? err.message : err) };
    }
}

function doFetch(url) {
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    var fn = g.fetch || (typeof fetch === "function" ? fetch : null);
    if (!fn) return Promise.reject(new Error("no fetch"));
    return fn(url).then(function (resp) {
        if (!resp || (resp.status && resp.status >= 400)) throw new Error("http " + (resp && resp.status));
        return resp.text();
    });
}

function evalExport(src, name) {
    try {
        return new Function(src + "\n;return typeof " + name + " !== \"undefined\" ? " + name + " : null;")();
    } catch (err) {
        throw new Error("eval " + name + ": " + (err && err.message ? err.message : err));
    }
}

function summarizeRequire(rel) {
    var r = tryRequire(rel);
    if (r.ok) return "OK require(" + rel + ")";
    return "FAIL require(" + rel + "): " + r.error;
}

function loadExtraFiles() {
    var base = pluginBase();
    var reqExtra = tryRequire("./extra.js");
    var reqMath = tryRequire("./lib/math.js");
    var reqData = tryRequire("./data.json");

    function fetchOne(rel, exportName) {
        return doFetch(base + rel).then(function (text) {
            var out = { ok: true, rel: rel, bytes: text.length, exportName: exportName };
            if (exportName) {
                var exp = evalExport(text, exportName);
                out.export = exp;
            } else {
                out.json = JSON.parse(text);
            }
            return out;
        }).catch(function (err) {
            return { ok: false, rel: rel, error: String(err && err.message ? err.message : err) };
        });
    }

    return Promise.all([
        fetchOne("extra.js", "TestPluginExtra"),
        fetchOne("lib/math.js", "TestPluginMath"),
        fetchOne("data.json", null)
    ]).then(function (fetched) {
        var extra = fetched[0];
        var math = fetched[1];
        var data = fetched[2];
        var extraUsed = extra.ok && extra.export && extra.export.token === "EXTRA_FILE_OK";
        var mathUsed = math.ok && math.export && math.export.add(2, 3) === 5;
        var dataUsed = data.ok && data.json && data.json.token === "DATA_JSON_OK";
        var requireAny = reqExtra.ok || reqMath.ok || reqData.ok;
        var fetchAny = extra.ok || math.ok || data.ok;
        var verdict = "NONE";
        if (requireAny && fetchAny) verdict = "BOTH require AND sibling fetch";
        else if (requireAny) verdict = "require() only — loader resolved extra files";
        else if (extraUsed && mathUsed && dataUsed) verdict = "sibling fetch + eval — extra files hosted, not auto-imported";
        else if (fetchAny) verdict = "partial sibling fetch";
        else verdict = "NO extra files loaded (Snow evals main only)";

        lastReport = {
            base: base,
            require: {
                extra: reqExtra.ok,
                math: reqMath.ok,
                data: reqData.ok,
                extraError: reqExtra.ok ? null : reqExtra.error,
                mathError: reqMath.ok ? null : reqMath.error,
                dataError: reqData.ok ? null : reqData.error
            },
            fetch: {
                extra: extra,
                math: math,
                data: data
            },
            extraGreet: extraUsed ? extra.export.greet("Snow") : null,
            mathAdd: mathUsed ? math.export.add(2, 3) : null,
            dataName: dataUsed ? data.json.name : null,
            verdict: verdict
        };
        return lastReport;
    });
}

function formatReport(report) {
    if (!report) return "No report yet.";
    var lines = [];
    lines.push("TestPlugin multi-file report");
    lines.push("base: " + report.base);
    lines.push("");
    lines.push("1) require('./extra.js'): " + (report.require.extra ? "OK" : "FAIL " + report.require.extraError));
    lines.push("2) require('./lib/math.js'): " + (report.require.math ? "OK" : "FAIL " + report.require.mathError));
    lines.push("3) require('./data.json'): " + (report.require.data ? "OK" : "FAIL " + report.require.dataError));
    lines.push("");
    lines.push("4) fetch extra.js: " + (report.fetch.extra.ok ? "OK " + report.fetch.extra.bytes + " bytes token=" + (report.fetch.extra.export && report.fetch.extra.export.token) : "FAIL " + report.fetch.extra.error));
    lines.push("5) fetch lib/math.js: " + (report.fetch.math.ok ? "OK add(2,3)=" + report.mathAdd : "FAIL " + report.fetch.math.error));
    lines.push("6) fetch data.json: " + (report.fetch.data.ok ? "OK " + report.dataName + " " + (report.fetch.data.json && report.fetch.data.json.token) : "FAIL " + report.fetch.data.error));
    if (report.extraGreet) lines.push("greet: " + report.extraGreet);
    lines.push("");
    lines.push("VERDICT: " + report.verdict);
    return lines.join("\n");
}

function sendBot(channelId, content) {
    try {
        var bot = findByProps("sendBotMessage");
        if (bot && typeof bot.sendBotMessage === "function" && channelId) {
            bot.sendBotMessage(channelId, content);
            return true;
        }
    } catch (_e) {}
    try { console.log("[TestPlugin]\n" + content); } catch (_e2) {}
    return false;
}

function getChannelId(ctx) {
    if (!ctx) return null;
    if (ctx.channel && ctx.channel.id) return ctx.channel.id;
    return ctx.channelId || ctx.channel_id || null;
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
    out.options = out.options || [];
    return out;
}

function wrapExecute(cmd) {
    var name = cmd.name;
    var orig = cmd.execute;
    cmd.execute = function (args, ctx) {
        try { console.log("[TestPlugin] /" + name + " execute id=" + cmd.id); } catch (_e) {}
        return orig.apply(this, arguments);
    };
    return cmd;
}

function start() {
    stop();
    loadExtraFiles().then(function (report) {
        try { console.log("[TestPlugin]", report.verdict, report.base); } catch (_e) {}
    }).catch(function (err) {
        try { console.error("[TestPlugin] loadExtraFiles", err); } catch (_e2) {}
    });

    var mod = getMod();
    var register = (mod.api && mod.api.commands && mod.api.commands.registerCommand)
        || (mod.commands && mod.commands.registerCommand);
    if (!register) {
        try { console.log("[TestPlugin] no registerCommand"); } catch (_e3) {}
        return;
    }
    var cmd = wrapExecute(prepare({
        name: "testplugin",
        description: "Report whether extra plugin files loaded",
        options: [],
        execute: function (_opts, ctx) {
            var cid = getChannelId(ctx) || getChannelId(_opts);
            return loadExtraFiles().then(function (report) {
                var text = formatReport(report);
                sendBot(cid, text);
                return { content: text };
            }).catch(function (err) {
                var msg = "TestPlugin failed: " + (err && err.message ? err.message : err);
                sendBot(cid, msg);
                return { content: msg };
            });
        }
    }));
    register(cmd);
    cmd.id = -910100;
    unpatches.push(function () {
        try { if (typeof cmd.unregister === "function") cmd.unregister(); } catch (_e4) {}
    });
    try { console.log("[TestPlugin] started /testplugin"); } catch (_e5) {}
}

function stop() {
    for (var i = 0; i < unpatches.length; i++) {
        try { if (typeof unpatches[i] === "function") unpatches[i](); } catch (_e) {}
    }
    unpatches = [];
}

function SettingsComponent() {
    var React = getReact();
    if (!React) return null;
    var RN = findByProps("View", "Text") || {};
    var Text = RN.Text;
    var View = RN.View;
    var ScrollView = RN.ScrollView;
    var [, bump] = React.useState(0);
    var body = formatReport(lastReport);
    var node = Text ? React.createElement(Text, { selectable: true, style: { color: "#d4d4d4", fontSize: 12 } }, body) : null;
    var refresh = Text ? React.createElement(Text, {
        onPress: function () {
            loadExtraFiles().then(function () { bump(function (n) { return n + 1; }); });
        },
        style: { color: "#5865F2", marginBottom: 8 }
    }, "Run file test") : null;
    if (View) return React.createElement(View, { style: { padding: 12 } }, refresh, ScrollView ? React.createElement(ScrollView, { style: { maxHeight: 420 } }, node) : node);
    return node;
}

const plugin = definePlugin({
    start: start,
    stop: stop,
    onLoad: start,
    onUnload: stop,
    SettingsComponent: SettingsComponent,
    settings: SettingsComponent,
    tryRequire: tryRequire,
    pluginBase: pluginBase,
    evalExport: evalExport,
    formatReport: formatReport,
    loadExtraFiles: loadExtraFiles,
    getLastReport: function () { return lastReport; }
});
