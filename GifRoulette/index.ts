/* GifRoulette — Bunny-compatible spec-3 plugin. */
const GUILD_IDS = ["1173279886065029291", "1015060230222131221"];

function getMod() {
    var list = [];
    try { if (typeof snow !== "undefined" && snow) list.push(snow); } catch (_e) { /* unbound */ }
    try { if (typeof bunny !== "undefined" && bunny) list.push(bunny); } catch (_e2) { /* unbound */ }
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    if (g.snow) list.push(g.snow);
    if (g.bunny) list.push(g.bunny);
    if (g.vendetta) list.push(g.vendetta);
    function canRegister(m) {
        return !!(m && (
            (m.api && m.api.commands && m.api.commands.registerCommand) ||
            (m.commands && m.commands.registerCommand)
        ));
    }
    var i;
    for (i = 0; i < list.length; i++) if (canRegister(list[i])) return list[i];
    for (i = 0; i < list.length; i++) {
        if (list[i] && (list[i].api || list[i].plugin || list[i].metro || list[i]._test)) return list[i];
    }
    return list[0] || {};
}

function getRegisterCommand() {
    var mod = getMod();
    if (mod.api && mod.api.commands && typeof mod.api.commands.registerCommand === "function") {
        return function (cmd) { return mod.api.commands.registerCommand(cmd); };
    }
    if (mod.commands && typeof mod.commands.registerCommand === "function") {
        return function (cmd) { return mod.commands.registerCommand(cmd); };
    }
    return null;
}

function prepareOption(opt) {
    if (!opt || typeof opt !== "object") return opt;
    var out = Object.assign({}, opt);
    out.displayName = out.displayName || out.name;
    out.displayDescription = out.displayDescription || out.description || out.name;
    out.untranslatedName = out.untranslatedName || out.name;
    out.untranslatedDescription = out.untranslatedDescription || out.description || out.name;
    if (out.choices && out.choices.length) {
        out.choices = out.choices.map(function (c) {
            var ch = Object.assign({}, c);
            ch.displayName = ch.displayName || ch.name || String(ch.value);
            return ch;
        });
    }
    return out;
}

function prepareCommand(cmd) {
    var out = Object.assign({}, cmd);
    out.displayName = out.displayName || out.name;
    out.displayDescription = out.displayDescription || out.description;
    out.untranslatedName = out.untranslatedName || out.name;
    out.untranslatedDescription = out.untranslatedDescription || out.description;
    out.applicationId = out.applicationId || "-1";
    out.type = out.type != null ? out.type : 1;
    if (out.inputType == null) out.inputType = 0;
    out.options = (out.options || []).map(prepareOption);
    return out;
}


function metroRoots() {
    const roots = [];
    const seen = [];
    function add(m) {
        if (!m || seen.indexOf(m) >= 0) return;
        seen.push(m);
        roots.push(m);
    }
    const mod = getMod();
    add(mod.metro);
    add(mod.metro && mod.metro.common);
    const g = typeof globalThis !== "undefined" ? globalThis : {};
    add(g.snow && g.snow.metro);
    add(g.bunny && g.bunny.metro);
    add(g.vendetta && g.vendetta.metro);
    return roots;
}

function findByProps() {
    const args = arguments;
    for (let i = 0; i < metroRoots().length; i++) {
        const metro = metroRoots()[i];
        const fn = metro.findByProps || (metro.common && metro.common.findByProps);
        if (!fn) continue;
        try {
            const found = fn.apply(metro, args);
            if (found) return found;
        } catch (_e) { /* try next */ }
    }
    return null;
}

function findByStoreName(name) {
    const roots = metroRoots();
    for (let i = 0; i < roots.length; i++) {
        const metro = roots[i];
        const fn = metro.findByStoreName;
        if (!fn) continue;
        try {
            const found = fn.call(metro, name);
            if (found) return found;
        } catch (_e) { /* try next */ }
    }
    return null;
}

function findProtoSettings(suffix) {
    const roots = metroRoots();
    for (let i = 0; i < roots.length; i++) {
        const metro = roots[i];
        const find = metro.find || metro.findExports;
        if (typeof find !== "function") continue;
        try {
            const found = find(function (x) {
                return x && x.ProtoClass && String(x.ProtoClass.typeName || "").indexOf(suffix) >= 0;
            });
            if (found) return found;
        } catch (_e) { /* try next */ }
    }
    return null;
}

function sendBotMessage(channelId, message) {
    const mod = getMod();
    const util = findByProps("sendBotMessage")
        || (mod.metro && mod.metro.common && mod.metro.common.messageUtil);
    const content = typeof message === "string" ? message : (message && message.content) || "";
    if (util && util.sendBotMessage) {
        try {
            return util.sendBotMessage(channelId, typeof message === "string" ? message : message);
        } catch (_e) {
            try { return util.sendBotMessage(channelId, content); } catch (_e2) { /* ignore */ }
        }
    }
    if (mod._test && mod._test.sendBotMessage) {
        return mod._test.sendBotMessage(channelId, typeof message === "string" ? { content: message } : message);
    }
}

function getChannelId(ctx) {
    if (!ctx) return null;
    if (typeof ctx === "string") return ctx;
    if (ctx.channel && (ctx.channel.id || ctx.channel.channelId)) return ctx.channel.id || ctx.channel.channelId;
    if (ctx.channelId) return ctx.channelId;
    if (ctx.channel_id) return ctx.channel_id;
    if (ctx.id && (ctx.guild_id !== undefined || ctx.guildId !== undefined || ctx.recipients || ctx.type !== undefined)) return ctx.id;
    return null;
}

function resolveCtx(opts, other) {
    if (other && getChannelId(other)) return other;
    if (opts && getChannelId(opts)) return opts;
    return other || opts;
}

function makeNonce() {
    var S = findByProps("fromTimestamp", "extractTimestamp") || findByProps("fromTimestamp");
    if (S && typeof S.fromTimestamp === "function") {
        try { return String(S.fromTimestamp(Date.now())); } catch (_e) {}
    }
    return String(Date.now());
}

function messageBody(msg) {
    const content = typeof msg === "string" ? msg : (msg && msg.content) || "";
    return Object.assign({
        content: content,
        tts: false,
        nonce: makeNonce(),
        invalidEmojis: [],
        validNonShortcutEmojis: []
    }, typeof msg === "object" && msg ? msg : {});
}

function sendViaApi(channelId, content) {
    var auth = findByProps("getToken");
    var token = auth && typeof auth.getToken === "function" && auth.getToken();
    if (!token || typeof fetch !== "function") return Promise.resolve(false);
    var url = "https://discord.com/api/v9/channels/" + channelId + "/messages";
    try { console.log("[GifRoulette] API POST", url); } catch (_e0) {}
    return fetch(url, {
        method: "POST",
        headers: {
            Authorization: token,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ content: content, nonce: makeNonce() })
    }).then(function (res) {
        try { console.log("[GifRoulette] API status", res.status); } catch (_e1) {}
        return res.status >= 200 && res.status < 300;
    }).catch(function (err) {
        try { console.log("[GifRoulette] API fetch failed", err && err.message); } catch (_e2) {}
        return false;
    });
}

function sendUserMessage(channelId, msg) {
    if (!channelId || !msg) {
        try { console.log("[GifRoulette] sendUserMessage skip, channelId=", channelId); } catch (_e0) {}
        return false;
    }
    const body = messageBody(msg);
    const mod = getMod();
    const util = findByProps("sendMessage", "receiveMessage")
        || findByProps("sendMessage", "sendBotMessage")
        || (mod.metro && mod.metro.common && mod.metro.common.messageUtil)
        || findByProps("sendMessage");
    if (util && typeof util.sendMessage === "function") {
        const attempts = [
            function () { return util.sendMessage(channelId, body); },
            function () { return util.sendMessage(channelId, body, true); },
            function () { return util.sendMessage(channelId, body, void 0, { location: "slash_command" }); },
            function () { return util.sendMessage(channelId, body.content); }
        ];
        for (let i = 0; i < attempts.length; i++) {
            try {
                attempts[i]();
                try { console.log("[GifRoulette] sendMessage ok via", i, "channel", channelId, "content", body.content); } catch (_e1) {}
                return true;
            } catch (err) {
                try { console.log("[GifRoulette] sendMessage attempt", i, "failed", err && err.message); } catch (_e2) {}
            }
        }
    } else {
        try { console.log("[GifRoulette] no sendMessage module"); } catch (_e3) {}
    }
    const http = findByProps("getAPIBaseURL");
    if (http && typeof http.post === "function") {
        try {
            http.post({ url: "/channels/" + channelId + "/messages", body: { content: body.content } });
            try { console.log("[GifRoulette] HTTP post message ok", channelId); } catch (_e4) {}
            return true;
        } catch (err2) {
            try { console.log("[GifRoulette] HTTP post failed", err2 && err2.message); } catch (_e5) {}
        }
    }
    if (mod._test && mod._test.sendMessage) {
        mod._test.sendMessage(channelId, body);
        return true;
    }
    return false;
}

function sendGifToChannel(channelId, url) {
    var auth = findByProps("getToken");
    var token = auth && typeof auth.getToken === "function" && auth.getToken();
    if (token && typeof fetch === "function") {
        return sendViaApi(channelId, url).then(function (ok) {
            if (ok) {
                try { console.log("[GifRoulette] gif sent via API"); } catch (_e) {}
                return true;
            }
            var sent = sendUserMessage(channelId, { content: url });
            try { console.log("[GifRoulette] gif fallback sendMessage", sent); } catch (_e2) {}
            return sent;
        });
    }
    var sentNow = sendUserMessage(channelId, { content: url });
    try { console.log("[GifRoulette] gif sendMessage (no token)", sentNow); } catch (_e3) {}
    return Promise.resolve(sentNow);
}


function unwrapDiscordProxy(url) {
    if (!url || typeof url !== "string") return url;
    var m = url.match(/\/external\/[^/]+\/(https?)\/([^?]+)/);
    if (m) return m[1] + "://" + decodeURIComponent(m[2]);
    if (url.indexOf("images-ext-") >= 0) {
        var q = url.indexOf("?");
        return q >= 0 ? url.slice(0, q) : url;
    }
    return url;
}

function isWeakGifUrl(u) {
    if (!u) return true;
    return u.indexOf("images-ext-") >= 0 || u.indexOf("format=webp") >= 0;
}

function gifUrlFrom(entry) {
    if (!entry) return null;
    if (typeof entry === "string") return /^https?:\/\//.test(entry) ? unwrapDiscordProxy(entry) : null;
    var raw = entry.url || entry.gif || entry.uri || entry.src || entry.video || entry.sourceURI || null;
    return raw ? unwrapDiscordProxy(raw) : null;
}

function favoriteGifsMapFrom(value) {
    if (!value) return null;
    if (Array.isArray(value)) return value;
    if (Array.isArray(value.favorites)) return value.favorites;
    if (value.favoriteGifs && value.favoriteGifs.gifs) return value.favoriteGifs.gifs;
    if (value.favorite_gifs && value.favorite_gifs.gifs) return value.favorite_gifs.gifs;
    if (value.gifs && typeof value.gifs === "object") return value.gifs;
    if (value.favoriteGifs && typeof value.favoriteGifs === "object") return value.favoriteGifs;
    if (value.favoriteGIFs && typeof value.favoriteGIFs === "object") return value.favoriteGIFs;
    return null;
}

function readFavoriteGifsFromModule(mod) {
    if (!mod) return null;
    const inner = mod.FrecencyUserSettingsActionCreators || mod.default || mod;
    if (typeof inner.loadIfNecessary === "function") {
        try { inner.loadIfNecessary(); } catch (_e) { /* ignore */ }
    }
    const getters = [
        "getCurrentValue", "getState", "getFavoriteGifs", "getFavoriteGIFs",
        "getSavedGifs", "getFavorites", "getFavoriteGIFsMobile"
    ];
    for (let i = 0; i < getters.length; i++) {
        const g = getters[i];
        if (typeof inner[g] !== "function") continue;
        try {
            const value = inner[g]();
            const map = favoriteGifsMapFrom(value)
                || favoriteGifsMapFrom(value && value.frecencyUserSettings)
                || favoriteGifsMapFrom(value && value.settings);
            if (map && collectGifUrls(map).length) return map;
        } catch (_e2) { /* next getter */ }
    }
    if (Array.isArray(inner.favorites) && inner.favorites.length) return inner.favorites;
    return favoriteGifsMapFrom(inner.favoriteGifs) || favoriteGifsMapFrom(inner);
}

function collectGifUrls(gifs) {
    const urls = [];
    function push(u) {
        if (u && urls.indexOf(u) < 0) urls.push(u);
    }
    if (!gifs) return urls;
    if (typeof gifs.forEach === "function" && typeof gifs.keys === "function" && !Array.isArray(gifs)) {
        gifs.forEach(function (val, key) {
            if (typeof key === "string" && /^https?:\/\//.test(key)) push(unwrapDiscordProxy(key));
            else push(gifUrlFrom(val));
        });
        return urls;
    }
    if (Array.isArray(gifs)) {
        for (let i = 0; i < gifs.length; i++) push(gifUrlFrom(gifs[i]));
        return urls;
    }
    const keys = Object.keys(gifs);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (/^https?:\/\//.test(key)) push(unwrapDiscordProxy(key));
        else push(gifUrlFrom(gifs[key]));
    }
    return urls;
}

function walkMetroExports(check) {
    const found = [];
    const buckets = [];
    const g = typeof globalThis !== "undefined" ? globalThis : {};
    const mod = getMod();
    buckets.push(mod.metro && mod.metro.modules);
    buckets.push(g.vendetta && g.vendetta.metro && g.vendetta.metro.modules);
    buckets.push(g.modules);
    for (let b = 0; b < buckets.length; b++) {
        const modules = buckets[b];
        if (!modules) continue;
        for (const k in modules) {
            try {
                const rec = modules[k];
                const exp = (rec && rec.publicModule && rec.publicModule.exports) || (rec && rec.exports) || rec;
                if (!exp) continue;
                if (check(exp)) found.push(exp);
                if (exp.default && check(exp.default)) found.push(exp.default);
            } catch (_e) { /* skip bad module */ }
        }
        if (found.length) return found;
    }
    return found;
}

function getFavoriteGif(_opts, _other) {
    const mod = getMod();
    const modules = [
        findByProps("addFavoriteGIF"),
        findByProps("useFavoriteGIFsMobile"),
        findByProps("FrecencyUserSettingsActionCreators"),
        findByStoreName("FrecencyUserSettingsStore"),
        findByStoreName("FavoriteGIFStore"),
        findByStoreName("UserSettingsProtoStore"),
        findByProps("favoriteGifs"),
        findByProps("getFavoriteGifs"),
        findByProps("getFavoriteGIFs"),
        findByProps("loadIfNecessary", "getCurrentValue"),
        findByProps("ProtoClass", "getCurrentValue"),
        findProtoSettings("FrecencyUserSettings"),
        mod._test && mod._test.UserSettingsActionCreators,
        mod._test && mod._test.FrecencyUserSettingsStore
    ];
    const walked = walkMetroExports(function (exp) {
        return !!(exp && (
            typeof exp.addFavoriteGIF === "function" ||
            typeof exp.useFavoriteGIFsMobile === "function" ||
            typeof exp.getFavoriteGIFs === "function" ||
            (exp.ProtoClass && String(exp.ProtoClass.typeName || "").indexOf("FrecencyUserSettings") >= 0)
        ));
    });
    for (let w = 0; w < walked.length; w++) modules.push(walked[w]);

    let urls = [];
    for (let i = 0; i < modules.length; i++) {
        const map = readFavoriteGifsFromModule(modules[i]);
        urls = collectGifUrls(map);
        if (urls.length) break;
    }
    if (!urls.length) return null;
    var strong = [];
    for (var s = 0; s < urls.length; s++) {
        if (!isWeakGifUrl(urls[s])) strong.push(urls[s]);
    }
    var pool = strong.length ? strong : urls;
    return pool[Math.floor(Math.random() * pool.length)];
}


const commands = [
    {
        name: "gifroulette",
        description: "Tempt fate and send a gif",
        execute: (opts, other) => {
            const ctx = resolveCtx(opts, other);
            const channelId = getChannelId(ctx);
            try { console.log("[GifRoulette] gifroulette run channel=", channelId, "ctxKeys=", ctx && Object.keys(ctx)); } catch (_e0) {}
            if (GUILD_IDS.includes((ctx && ctx.guild && ctx.guild.id) || (other && other.guild && other.guild.id) || "")) {
                sendBotMessage(channelId, {
                    content: "This command is restricted in this server."
                });
                return;
            }
            try {
                const url = unwrapDiscordProxy(getFavoriteGif(opts, ctx));
                try { console.log("[GifRoulette] gifroulette url=", url); } catch (_e1) {}
                if (!url) {
                    sendBotMessage(channelId, {
                        content: "No favorite GIFs found. Star a GIF in the GIF picker first."
                    });
                    return;
                }
                return sendGifToChannel(channelId, url).then(function (sent) {
                    try { console.log("[GifRoulette] gifroulette sent=", sent); } catch (_e2) {}
                    if (!sent) sendBotMessage(channelId, { content: "Could not send the GIF. Please try again." });
                });
            } catch (err) {
                try { console.error("[GifRoulette] gifroulette threw", err); } catch (_e3) {}
                sendBotMessage(channelId, {
                    content: "Couldn't pick a favorite GIF: " + (err && err.message ? err.message : String(err))
                });
            }
        }
    }
];

let unregisters = [];
let sendUnpatch = [];
let started = false;
let preparedCommands = [];

function wrapExecute(cmd) {
    var name = cmd.name;
    var orig = cmd.execute;
    if (typeof orig !== "function") return cmd;
    cmd.execute = function (args, ctx) {
        try { console.log("[GifRoulette] /" + name + " execute", "id=" + cmd.id, "channel", getChannelId(ctx) || getChannelId(args)); } catch (_log) {}
        try {
            var ret = orig.apply(this, arguments);
            return Promise.resolve(ret).then(function (value) {
                if (value && typeof value === "object" && typeof value.content === "string") {
                    var cid = getChannelId(ctx) || getChannelId(args);
                    if (sendUserMessage(cid, value)) return;
                }
                return value;
            });
        } catch (err) {
            try { console.error("[GifRoulette] /" + name + " threw", err); } catch (_e3) {}
            throw err;
        }
    };
    return cmd;
}

function injectBuiltInCommands() {
    var commandsModule = findByProps("getBuiltInCommands");
    var patcher = (getMod().api && getMod().api.patcher) || getMod().patcher;
    if (!commandsModule || !patcher || typeof patcher.after !== "function") {
        try { console.log("[GifRoulette] skip getBuiltInCommands patch"); } catch (_e) {}
        return;
    }
    var byName = {};
    for (var i = 0; i < preparedCommands.length; i++) byName[preparedCommands[i].name] = preparedCommands[i];
    sendUnpatch.push(patcher.after("getBuiltInCommands", commandsModule, function (_args, res) {
        var list = Array.isArray(res) ? res : [];
        var seen = {};
        var out = [];
        for (var j = 0; j < list.length; j++) {
            var c = list[j];
            var n = c && (c.name || c.untranslatedName);
            if (n && byName[n]) {
                if (seen[n]) continue;
                seen[n] = true;
                out.push(byName[n]);
            } else out.push(c);
        }
        for (var k = 0; k < preparedCommands.length; k++) {
            var pc = preparedCommands[k];
            if (!seen[pc.name]) {
                out.push(pc);
                seen[pc.name] = true;
            }
        }
        return out;
    }));
    try { console.log("[GifRoulette] patched getBuiltInCommands count=" + preparedCommands.length); } catch (_e2) {}
}


function start() {
    stop();
    started = true;
    preparedCommands = [];
    var nextId = -910000;
    var ci;
    for (ci = 0; ci < commands.length; ci++) {
        var prepared = wrapExecute(prepareCommand(commands[ci]));
        prepared.id = String(nextId - ci);
        prepared.applicationId = "-1";
        preparedCommands.push(prepared);
    }
    var register = getRegisterCommand();
    if (register) {
        for (ci = 0; ci < preparedCommands.length; ci++) {
            try {
                unregisters.push(register(preparedCommands[ci]));
            } catch (_e) { /* keep remaining */ }
            preparedCommands[ci].id = String(nextId - ci);
        }
    }
    try { injectBuiltInCommands(); } catch (eInj) {
        try { console.error("[GifRoulette] injectBuiltInCommands", eInj); } catch (_e2) {}
    }
}

function stop() {
    started = false;
    for (const u of unregisters) {
        try { if (typeof u === "function") u(); } catch (_e) { /* ignore */ }
    }
    unregisters = [];
    for (const u of sendUnpatch) {
        try { if (typeof u === "function") u(); } catch (_e) { /* ignore */ }
    }
    sendUnpatch = [];
}


const plugin = definePlugin({ start: start, stop: stop, onLoad: start, onUnload: stop });
