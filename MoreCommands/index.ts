/* MoreCommands — Snow spec-3. Snow SDK: capture bunny during eval. */
var B = (typeof bunny !== "undefined" && bunny) || (typeof snow !== "undefined" && snow) || null;
const ApplicationCommandOptionType = {
    SUB_COMMAND: 1,
    SUB_COMMAND_GROUP: 2,
    STRING: 3,
    INTEGER: 4,
    BOOLEAN: 5,
    USER: 6,
    CHANNEL: 7,
    ROLE: 8,
    MENTIONABLE: 9,
    NUMBER: 10,
    ATTACHMENT: 11
};

const ApplicationCommandInputType = {
    BUILT_IN: 0,
    BUILT_IN_TEXT: 1,
    BUILT_IN_INTEGRATION: 2,
    BOT: 3,
    PLACEHOLDER: 4
};

const GUILD_IDS = ["1173279886065029291", "1015060230222131221"];
const FRAMES = 1;

const OptionalMessageOption = {
    name: "message",
    description: "The message to send",
    type: ApplicationCommandOptionType.STRING,
    required: false
};
const RequiredMessageOption = {
    name: "message",
    description: "The message to send",
    type: ApplicationCommandOptionType.STRING,
    required: true
};

function findOption(args, name, fallback) {
    const found = (args || []).find(a => a && a.name === name);
    return (found && found.value !== undefined && found.value !== null) ? found.value : fallback;
}

function getMod() {
    if (B && (B.commands || B.metro || B.ui || B.api || B.plugin)) return B;
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
    if (mod.commands && typeof mod.commands.registerCommand === "function") {
        return function (cmd) { return mod.commands.registerCommand(cmd); };
    }
    if (mod.api && mod.api.commands && typeof mod.api.commands.registerCommand === "function") {
        return function (cmd) { return mod.api.commands.registerCommand(cmd); };
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

const SETTINGS_META = {
    addFreakyEnding: {
        type: "boolean",
        description: "Add 👅 or ❤️ at the end",
        default: false
    },
    uwuEveryMessage: {
        description: "Make every single message uwuified",
        type: "boolean",
        default: false,
        restartNeeded: false
    },
    uwuEverything: {
        description: "Makes *all* text uwuified - really bad idea",
        type: "boolean",
        default: false,
        restartNeeded: true
    }
};

let _storage;
function getStorage() {
    if (_storage) return _storage;
    try {
        _storage = getMod().plugin.createStorage();
    } catch (_e) {
        _storage = {};
    }
    for (const key of Object.keys(SETTINGS_META)) {
        if (_storage[key] === undefined) _storage[key] = SETTINGS_META[key].default;
    }
    return _storage;
}

const settings = {
    store: new Proxy({}, {
        get(_t, prop) {
            if (prop === "addFreakyEnding" || prop === "uwuEveryMessage" || prop === "uwuEverything") {
                const s = getStorage();
                return s[prop];
            }
            return undefined;
        },
        set(_t, prop, value) {
            getStorage()[prop] = value;
            return true;
        }
    })
};

function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function getCuteAnimeBoys(sub) {
    const res = await fetch("https://www.reddit.com/r/" + sub + "/top.json?limit=100&t=all");
    const { children } = (await res.json()).data;
    const r = rand(0, children.length - 1);
    return children[r].data.url ?? "";
}

async function getCuteNeko() {
    const res = await fetch("https://nekos.best/api/v2/neko");
    const url = (await res.json()).results[0].url;
    return url ?? "";
}

function mock(input) {
    let output = "";
    for (let i = 0; i < input.length; i++) {
        output += i % 2 ? input[i].toUpperCase() : input[i].toLowerCase();
    }
    return output;
}

const charMap = {
    q: "𝓺", w: "𝔀", e: "𝓮", r: "𝓻", t: "𝓽", y: "𝔂", u: "𝓾", i: "𝓲", o: "𝓸", p: "𝓹",
    a: "𝓪", s: "𝓼", d: "𝓭", f: "𝓯", g: "𝓰", h: "𝓱", j: "𝓳", k: "𝓴", l: "𝓵", z: "𝔃",
    x: "𝔁", c: "𝓬", v: "𝓿", b: "𝓫", n: "𝓷", m: "𝓶", Q: "𝓠", W: "𝓦", E: "𝓔", R: "𝓡",
    T: "𝓣", Y: "𝓨", U: "𝓤", I: "𝓘", O: "𝓞", P: "𝓟", A: "𝓐", S: "𝓢", D: "𝓓", F: "𝓕",
    G: "𝓖", H: "𝓗", J: "𝓙", K: "𝓚", L: "𝓛", Z: "𝓩", X: "𝓧", C: "𝓒", V: "𝓥", B: "𝓑",
    N: "𝓝", M: "𝓜"
};

const mapCharacters = (text, map) =>
    text.split("").map(char => map[char] || char).join("");

function makeFreaky(text) {
    text = mapCharacters(text.trim() || "freaky", charMap);
    if (settings.store.addFreakyEnding) text += Math.random() < 0.25 ? " 👅" : " ❤️";
    return text;
}

const morseMap = {
    A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.",
    G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..",
    M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.",
    S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
    Y: "-.--", Z: "--..",
    0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-",
    5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----.",
    " ": "/"
};

const toMorse = (text) => {
    return text.toUpperCase().split("").map(char => morseMap[char] ?? "").join(" ");
};

const fromMorse = (text) => {
    const reversedMap = Object.fromEntries(Object.entries(morseMap).map(([k, v]) => [v, k]));
    const raw = text.split(" ").map(code => reversedMap[code] ?? "").join("").toLowerCase();
    return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const isMorse = (text) => /^[.\-/ ]+$/.test(text);

const endings = [
    "rawr x3", "OwO", "UwU", "o.O", "-.-", ">w<", "(⑅˘꒳˘)", "(ꈍᴗꈍ)", "(˘ω˘)", "(U ᵕ U❁)",
    "σωσ", "òωó", "(///ˬ///✿)", "(U ﹏ U)", "( ͡o ω ͡o )", "ʘwʘ", ":3", ":3", ":3", "XD",
    "nyaa~~", "mya", ">_<", "😳", "🥺", "😳😳😳", "rawr", "^^", "^^;;", "(ˆ ﻌ ˆ)♡",
    "^•ﻌ•^", "/(^•ω•^)", "(✿oωo)"
];

const replacements = [
    ["small", "smol"],
    ["cute", "kawaii"],
    ["fluff", "floof"],
    ["love", "luv"],
    ["stupid", "baka"],
    ["what", "nani"],
    ["meow", "nya"],
    ["hello", "hewwo"]
];

function selectRandomElement(arr) {
    const randomIndex = Math.floor(Math.random() * arr.length);
    return arr[randomIndex];
}

const isOneCharacterString = (str) => {
    return str.split("").every((char) => char === str[0]);
};

function replaceString(inputString) {
    let replaced = false;
    for (const replacement of replacements) {
        const regex = new RegExp("\\b" + replacement[0] + "\\b", "gi");
        if (regex.test(inputString)) {
            inputString = inputString.replace(regex, replacement[1]);
            replaced = true;
        }
    }
    return replaced ? inputString : false;
}

function uwuify(message) {
    const rule = /\S+|\s+/g;
    const words = message.match(rule);
    let answer = "";

    if (words === null) return "";

    for (let i = 0; i < words.length; i++) {
        if (isOneCharacterString(words[i]) || words[i].startsWith("https://")) {
            answer += words[i];
            continue;
        }

        if (!replaceString(words[i])) {
            answer += words[i]
                .replace(/n(?=[aeo])/g, "ny")
                .replace(/l|r/g, "w");
        } else answer += replaceString(words[i]);
    }

    answer += " " + selectRandomElement(endings);
    return answer;
}

function uwuifyArray(arr) {
    const newArr = [...arr];
    newArr.forEach((item, index) => {
        if (Array.isArray(item)) {
            newArr[index] = uwuifyArray(item);
        } else if (typeof item === "string") {
            newArr[index] = uwuify(item);
        }
    });
    return newArr;
}

function uwuifyProps(props) {
    if (!props.children) return props;
    if (typeof props.children === "string") props.children = uwuify(props.children);
    else if (Array.isArray(props.children)) props.children = uwuifyArray(props.children);
    return props;
}

function onSend(msg) {
    if (settings.store.uwuEveryMessage) {
        msg.content = uwuify(msg.content);
    }
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
    try { console.log("[MoreCommands] API POST", url); } catch (_e0) {}
    return fetch(url, {
        method: "POST",
        headers: {
            Authorization: token,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ content: content })
    }).then(function (res) {
        try { console.log("[MoreCommands] API status", res.status); } catch (_e1) {}
        return res.status >= 200 && res.status < 300;
    }).catch(function (err) {
        try { console.log("[MoreCommands] API fetch failed", err && err.message); } catch (_e2) {}
        return false;
    });
}

function sendUserMessage(channelId, msg) {
    if (!channelId || !msg) {
        try { console.log("[MoreCommands] sendUserMessage skip, channelId=", channelId); } catch (_e0) {}
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
                try { console.log("[MoreCommands] sendMessage ok via", i, "channel", channelId, "content", body.content); } catch (_e1) {}
                return true;
            } catch (err) {
                try { console.log("[MoreCommands] sendMessage attempt", i, "failed", err && err.message); } catch (_e2) {}
            }
        }
    } else {
        try { console.log("[MoreCommands] no sendMessage module"); } catch (_e3) {}
    }
    const http = findByProps("getAPIBaseURL");
    if (http && typeof http.post === "function") {
        try {
            http.post({ url: "/channels/" + channelId + "/messages", body: { content: body.content } });
            try { console.log("[MoreCommands] HTTP post message ok", channelId); } catch (_e4) {}
            return true;
        } catch (err2) {
            try { console.log("[MoreCommands] HTTP post failed", err2 && err2.message); } catch (_e5) {}
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
                try { console.log("[MoreCommands] gif sent via API"); } catch (_e) {}
                return true;
            }
            var sent = sendUserMessage(channelId, { content: url });
            try { console.log("[MoreCommands] gif fallback sendMessage", sent); } catch (_e2) {}
            return sent;
        });
    }
    var sentNow = sendUserMessage(channelId, { content: url });
    try { console.log("[MoreCommands] gif sendMessage (no token)", sentNow); } catch (_e3) {}
    return Promise.resolve(sentNow);
}

function getUserStore() {
    return findByStoreName("UserStore") || findByProps("getCurrentUser", "getUser") || (getMod()._test && getMod()._test.UserStore);
}

function getDraftType() {
    return findByProps("ChannelMessage", "SlashCommand")
        || findByProps("ChannelMessage", "ApplicationLauncherCommand")
        || { ChannelMessage: 0, SlashCommand: 3, ApplicationLauncherCommand: 3 };
}

function getUploadHandler() {
    return findByProps("promptToUpload") || (getMod()._test && getMod()._test.UploadHandler);
}

function getUploadManager() {
    return findByProps("clearAll") || (getMod()._test && getMod()._test.UploadManager);
}

function getUploadAttachmentStore() {
    return findByStoreName("UploadAttachmentStore") || findByProps("getUpload") || (getMod()._test && getMod()._test.UploadAttachmentStore);
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

function calculateAffinityScore(affinity) {
    const weights = {
        friend: 0.15,
        dm: 0.30,
        vc: 0.25,
        serverMsg: 0.20,
        communication: 0.10
    };
    let score = 0;
    if (affinity.isFriend) score += weights.friend * 100;
    score += affinity.dmProbability * weights.dm * 100;
    score += affinity.vcProbability * weights.vc * 100;
    score += affinity.serverMessageProbability * weights.serverMsg * 100;
    score += affinity.communicationProbability * weights.communication * 100;
    return Math.round(Math.min(100, Math.max(0, score)) * 100) / 100;
}

function loadFriendImage(source) {
    const isFile = (typeof File !== "undefined") && source instanceof File;
    const url = isFile ? URL.createObjectURL(source) : source;
    if (typeof Image === "undefined") {
        return Promise.resolve({ width: 256, height: 256, src: url, __placeholder: true });
    }
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            if (isFile) URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = (event, _source, _lineno, _colno, err) => {
            if (isFile) URL.revokeObjectURL(url);
            reject(err || event);
        };
        img.crossOrigin = "anonymous";
        img.src = url;
    });
}

function generatePoissonDiskPosition(existingPositions, canvasWidth, canvasHeight, size) {
    const edgePadding = 10;
    const minDist = size * 1.5;
    const textSpace = 60;
    const k = 30;

    function isValid(x, y) {
        if (
            x < edgePadding ||
            x + size > canvasWidth - edgePadding ||
            y < edgePadding ||
            y + size > canvasHeight - textSpace - edgePadding
        ) return false;

        return !existingPositions.some(pos => {
            const dx = pos.x - x;
            const dy = pos.y - y;
            const dist = Math.hypot(dx, dy);
            const minAllowed = (pos.size + size) / 2 + (minDist - size);
            return dist < minAllowed;
        });
    }

    if (existingPositions.length === 0) {
        return {
            x: canvasWidth / 2 - size / 2,
            y: canvasHeight / 2 - size / 2
        };
    }

    for (let tries = 0; tries < 100; tries++) {
        const base = existingPositions[Math.floor(Math.random() * existingPositions.length)];
        for (let i = 0; i < k; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = minDist + Math.random() * minDist;
            const x = base.x + Math.cos(angle) * radius;
            const y = base.y + Math.sin(angle) * radius;
            if (isValid(x, y)) {
                return {
                    x: Math.max(edgePadding, Math.min(x, canvasWidth - size - edgePadding)),
                    y: Math.max(edgePadding, Math.min(y, canvasHeight - size - textSpace - edgePadding))
                };
            }
        }
    }

    for (let tries = 0; tries < 100; tries++) {
        const x = Math.random() * (canvasWidth - size - edgePadding * 2) + edgePadding;
        const y = Math.random() * (canvasHeight - size - textSpace - edgePadding * 2) + edgePadding;
        if (isValid(x, y)) {
            return {
                x: Math.max(edgePadding, Math.min(x, canvasWidth - size - edgePadding)),
                y: Math.max(edgePadding, Math.min(y, canvasHeight - size - textSpace - edgePadding))
            };
        }
    }

    return { x: edgePadding, y: edgePadding };
}

function calculateCanvasSize(userCount, avatarSize) {
    const padding = 50;
    const textSpace = 60;
    const itemWidth = avatarSize + padding;
    const itemHeight = avatarSize + textSpace + padding;
    const aspectRatio = 16 / 9;
    const cols = Math.ceil(Math.sqrt(userCount * aspectRatio));
    const rows = Math.ceil(userCount / cols);
    return {
        width: Math.max(1000, cols * itemWidth + padding),
        height: Math.max(700, rows * itemHeight + padding)
    };
}

function crc32(buf) {
    let c = ~0 >>> 0;
    for (let i = 0; i < buf.length; i++) {
        c ^= buf[i];
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
    return (~c) >>> 0;
}

function adler32(buf) {
    let a = 1, b = 0;
    for (let i = 0; i < buf.length; i++) {
        a = (a + buf[i]) % 65521;
        b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
}

function u32be(n) {
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

function u16le(n) {
    return [n & 255, (n >>> 8) & 255];
}

function concatBytes(parts) {
    let len = 0;
    for (const p of parts) len += p.length;
    const out = new Uint8Array(len);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
}

function zlibUncompressed(data) {
    const chunks = [];
    chunks.push(new Uint8Array([0x78, 0x01]));
    let offset = 0;
    while (offset < data.length) {
        const n = Math.min(65535, data.length - offset);
        const last = offset + n >= data.length ? 1 : 0;
        const block = new Uint8Array(5 + n);
        block[0] = last;
        block[1] = n & 255;
        block[2] = (n >>> 8) & 255;
        const nlen = (~n) & 0xffff;
        block[3] = nlen & 255;
        block[4] = (nlen >>> 8) & 255;
        block.set(data.subarray(offset, offset + n), 5);
        chunks.push(block);
        offset += n;
    }
    const sum = adler32(data);
    chunks.push(new Uint8Array(u32be(sum)));
    return concatBytes(chunks);
}

function pngChunk(type, data) {
    const td = new Uint8Array(4 + data.length);
    td[0] = type.charCodeAt(0); td[1] = type.charCodeAt(1);
    td[2] = type.charCodeAt(2); td[3] = type.charCodeAt(3);
    td.set(data, 4);
    return concatBytes([
        new Uint8Array(u32be(data.length)),
        td,
        new Uint8Array(u32be(crc32(td)))
    ]);
}

function encodePNG(width, height, rgba) {
    const raw = new Uint8Array((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        const row = y * (width * 4 + 1);
        raw[row] = 0;
        raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), row + 1);
    }
    const ihdr = new Uint8Array([
        ...u32be(width), ...u32be(height), 8, 6, 0, 0, 0
    ]);
    const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    return concatBytes([
        sig,
        pngChunk("IHDR", ihdr),
        pngChunk("IDAT", zlibUncompressed(raw)),
        pngChunk("IEND", new Uint8Array(0))
    ]);
}

function makeFile(bytes, name, type) {
    const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (typeof File !== "undefined") {
        try { return new File([buf], name, { type }); } catch (_e) { /* RN */ }
    }
    if (typeof Blob !== "undefined") {
        try {
            const blob = new Blob([buf], { type });
            blob.name = name;
            return blob;
        } catch (_e) { /* ignore */ }
    }
    return { name, type, data: buf };
}

function softwareCanvas(width, height) {
    const rgba = new Uint8Array(width * height * 4);
    rgba.fill(255);
    const ctx = {
        _clip: null,
        strokeStyle: "#808080",
        lineWidth: 3,
        save() { this._saved = this._clip; },
        restore() { this._clip = this._saved; },
        beginPath() { this._path = null; },
        arc(cx, cy, r) { this._path = { cx, cy, r }; },
        clip() { this._clip = this._path; },
        stroke() {
            const p = this._path;
            if (!p) return;
            const lw = this.lineWidth || 3;
            let r = 128, g = 128, b = 128;
            const ss = this.strokeStyle;
            if (typeof ss === "string" && ss[0] === "#") {
                const n = parseInt(ss.slice(1), 16);
                r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
            }
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const d = Math.hypot(x + 0.5 - p.cx, y + 0.5 - p.cy);
                    if (Math.abs(d - p.r) <= lw / 2 + 0.5) {
                        const i = (y * width + x) * 4;
                        rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
                    }
                }
            }
        },
        clearRect(x, y, w, h) {
            for (let py = y; py < y + h; py++) {
                for (let px = x; px < x + w; px++) {
                    if (px < 0 || py < 0 || px >= width || py >= height) continue;
                    const i = (py * width + px) * 4;
                    rgba[i] = 0; rgba[i + 1] = 0; rgba[i + 2] = 0; rgba[i + 3] = 0;
                }
            }
        },
        drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) {
            if (dx === undefined) { dx = sx; dy = sy; dw = sw; dh = sh; sx = 0; sy = 0; sw = img.width; sh = img.height; }
            const clip = this._clip;
            const src = img.__rgba;
            for (let y = 0; y < dh; y++) {
                for (let x = 0; x < dw; x++) {
                    const px = Math.floor(dx + x);
                    const py = Math.floor(dy + y);
                    if (px < 0 || py < 0 || px >= width || py >= height) continue;
                    if (clip) {
                        if (Math.hypot(px + 0.5 - clip.cx, py + 0.5 - clip.cy) > clip.r) continue;
                    }
                    const i = (py * width + px) * 4;
                    if (src) {
                        const ix = Math.min(img.width - 1, Math.floor(sx + (x / dw) * sw));
                        const iy = Math.min(img.height - 1, Math.floor(sy + (y / dh) * sh));
                        const si = (iy * img.width + ix) * 4;
                        rgba[i] = src[si]; rgba[i + 1] = src[si + 1]; rgba[i + 2] = src[si + 2]; rgba[i + 3] = src[si + 3];
                    } else {
                        rgba[i] = 180; rgba[i + 1] = 180; rgba[i + 2] = 200; rgba[i + 3] = 255;
                    }
                }
            }
        },
        getImageData(_x, _y, w, h) {
            return { data: rgba, width: w, height: h };
        }
    };
    return {
        width, height,
        getContext() { return ctx; },
        toBlob(cb, _type) {
            const bytes = encodePNG(width, height, rgba);
            if (typeof Blob !== "undefined") cb(new Blob([bytes], { type: "image/png" }));
            else cb({ type: "image/png", data: bytes, arrayBuffer: () => Promise.resolve(bytes.buffer) });
        }
    };
}

function createCanvas(w, h) {
    if (typeof document !== "undefined" && document.createElement) {
        try {
            const c = document.createElement("canvas");
            c.width = w; c.height = h;
            if (c.getContext && c.getContext("2d")) return c;
        } catch (_e) { /* RN */ }
    }
    return softwareCanvas(w, h);
}

function loadImage(source) {
    const isFile = (typeof File !== "undefined") && source instanceof File;
    const url = isFile ? URL.createObjectURL(source) : source;
    if (typeof Image !== "undefined") {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                if (isFile) URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = (event, _s, _l, _c, err) => {
                if (isFile) URL.revokeObjectURL(url);
                reject(err || event);
            };
            img.crossOrigin = "Anonymous";
            img.src = url;
        });
    }
    return Promise.resolve({
        width: 64,
        height: 64,
        __rgba: new Uint8Array(64 * 64 * 4).fill(255),
        name: source && source.name
    });
}

async function resolveImage(options, ctx) {
    let image = null;
    let width = null;
    let height = null;
    const DraftType = getDraftType();
    const slash = DraftType.SlashCommand != null ? DraftType.SlashCommand : DraftType.ApplicationLauncherCommand;
    const store = getUploadAttachmentStore();
    const manager = getUploadManager();

    for (const opt of options || []) {
        switch (opt.name) {
            case "image": {
                const upload = store && store.getUpload && store.getUpload(ctx.channel.id, opt.name, slash);
                if (upload) {
                    if (!upload.isImage) {
                        if (manager && manager.clearAll) manager.clearAll(ctx.channel.id, slash);
                        throw "Upload is not an image";
                    }
                    image = upload.item.file;
                }
                break;
            }
            case "width":
                width = Number(opt.value);
                break;
            case "height":
                height = Number(opt.value);
                break;
        }
    }
    if (manager && manager.clearAll) manager.clearAll(ctx.channel.id, slash);
    return { image, width, height };
}

function quantize(data, ncolors) {
    const palette = [];
    const seen = {};
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i] & 0xfc, g = data[i + 1] & 0xfc, b = data[i + 2] & 0xfc;
        const key = (r << 16) | (g << 8) | b;
        if (!seen[key]) {
            seen[key] = true;
            palette.push([data[i], data[i + 1], data[i + 2]]);
            if (palette.length >= ncolors) break;
        }
    }
    while (palette.length < 2) palette.push([0, 0, 0]);
    return palette;
}

function applyPalette(data, palette) {
    const index = new Uint8Array(data.length / 4);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        let best = 0, bestD = 1e9;
        for (let k = 0; k < palette.length; k++) {
            const dr = data[i] - palette[k][0];
            const dg = data[i + 1] - palette[k][1];
            const db = data[i + 2] - palette[k][2];
            const d = dr * dr + dg * dg + db * db;
            if (d < bestD) { bestD = d; best = k; }
        }
        index[p] = best;
    }
    return index;
}

function lzwEncode(index, minCodeSize) {
    const clear = 1 << minCodeSize;
    const eoi = clear + 1;
    let codeSize = minCodeSize + 1;
    let nextCode = eoi + 1;
    const dict = Object.create(null);
    for (let i = 0; i < clear; i++) dict[String.fromCharCode(i)] = i;
    const outBits = [];
    let acc = 0, nbits = 0;
    function write(code, size) {
        acc |= code << nbits;
        nbits += size;
        while (nbits >= 8) {
            outBits.push(acc & 255);
            acc >>= 8;
            nbits -= 8;
        }
    }
    write(clear, codeSize);
    let w = String.fromCharCode(index[0]);
    for (let i = 1; i < index.length; i++) {
        const c = String.fromCharCode(index[i]);
        const wc = w + c;
        if (dict[wc] !== undefined) w = wc;
        else {
            write(dict[w], codeSize);
            dict[wc] = nextCode++;
            if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
            if (nextCode === 4096) {
                write(clear, codeSize);
                for (const k in dict) delete dict[k];
                for (let j = 0; j < clear; j++) dict[String.fromCharCode(j)] = j;
                codeSize = minCodeSize + 1;
                nextCode = eoi + 1;
            }
            w = c;
        }
    }
    write(dict[w], codeSize);
    write(eoi, codeSize);
    if (nbits > 0) outBits.push(acc & 255);
    return new Uint8Array(outBits);
}

function GIFEncoder() {
    const parts = [];
    let started = false;
    return {
        writeFrame(index, width, height, opts) {
            opts = opts || {};
            const palette = opts.palette || [[0, 0, 0], [255, 255, 255]];
            let psize = 2;
            while (psize < palette.length) psize *= 2;
            if (psize > 256) psize = 256;
            const gctSize = Math.log2(psize) - 1;
            if (!started) {
                parts.push(new Uint8Array([71, 73, 70, 56, 57, 97]));
                parts.push(new Uint8Array(u16le(width)));
                parts.push(new Uint8Array(u16le(height)));
                parts.push(new Uint8Array([0x80 | (gctSize & 7), 0, 0]));
                const gct = new Uint8Array(psize * 3);
                for (let i = 0; i < psize; i++) {
                    const col = palette[i] || [0, 0, 0];
                    gct[i * 3] = col[0]; gct[i * 3 + 1] = col[1]; gct[i * 3 + 2] = col[2];
                }
                parts.push(gct);
                parts.push(new Uint8Array([0x21, 0xFF, 0x0B, 78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48, 0x03, 0x01, 0, 0, 0]));
                started = true;
            }
            if (opts.transparent) {
                parts.push(new Uint8Array([0x21, 0xF9, 0x04, 0x01, 0, 0, 0, 0]));
            }
            parts.push(new Uint8Array([0x2C, ...u16le(0), ...u16le(0), ...u16le(width), ...u16le(height), 0]));
            const minCode = Math.max(2, (gctSize + 1) | 0);
            parts.push(new Uint8Array([minCode]));
            const packed = lzwEncode(index, minCode);
            for (let i = 0; i < packed.length; i += 255) {
                const n = Math.min(255, packed.length - i);
                parts.push(new Uint8Array([n]));
                parts.push(packed.subarray(i, i + n));
            }
            parts.push(new Uint8Array([0]));
        },
        finish() { parts.push(new Uint8Array([0x3B])); },
        bytesView() { return concatBytes(parts); }
    };
}

function promptUpload(file, channel) {
    const handler = getUploadHandler();
    const DraftType = getDraftType();
    if (handler && handler.promptToUpload) {
        handler.promptToUpload([file], channel, DraftType.ChannelMessage);
        return;
    }
    if (getMod()._test && getMod()._test.promptToUpload) getMod()._test.promptToUpload([file], channel);
}

const commands = [
    {
        name: "systeminfo",
        description: "Shows system information",
        options: [],
        execute: async (opts, ctx) => {
            try {
                const { userAgent, hardwareConcurrency, onLine, languages } = navigator;
                const { width, height, colorDepth } = window.screen;
                const { deviceMemory, connection } = navigator;
                const platform = userAgent.includes("Windows") ? "Windows" :
                    userAgent.includes("Mac") ? "MacOS" :
                        userAgent.includes("Linux") ? "Linux" : "Unknown";
                const isMobile = /Mobile|Android|iPhone/i.test(userAgent);
                const deviceType = isMobile ? "Mobile" : "Desktop";
                const browserInfo = (userAgent.match(/(?:chrome|firefox|safari|edge|opr)\/?\s*(\d+)/i) || [])[0] || "Unknown";
                const networkInfo = connection ? (connection.effectiveType || "Unknown") : "Unknown";
                const info = [
                    "> **Platform**: " + platform,
                    "> **Device Type**: " + deviceType,
                    "> **Browser**: " + browserInfo,
                    "> **CPU Cores**: " + (hardwareConcurrency || "N/A"),
                    "> **Memory**: " + (deviceMemory ? deviceMemory + "GB" : "N/A"),
                    "> **Screen**: " + width + "x" + height + " (" + colorDepth + "bit)",
                    "> **Languages**: " + (languages && languages.join(", ")),
                    "> **Network**: " + networkInfo + " (" + (onLine ? "Online" : "Offline") + ")"
                ].join("\n");
                return { content: info };
            } catch (_err) {
                sendBotMessage(ctx.channel.id, { content: "Failed to fetch system information" });
            }
        }
    },
    {
        name: "getuptime",
        description: "Returns the system uptime",
        execute: async () => {
            const uptime = performance.now() / 1000;
            const uptimeInfo = "> **System Uptime**: " + Math.floor(uptime / 60) + " minutes";
            return { content: uptimeInfo };
        }
    },
    {
        name: "gettime",
        description: "Returns the current server time",
        execute: async () => {
            const currentTime = new Date().toLocaleString();
            return { content: "> **Current Time**: " + currentTime };
        }
    },
    {
        name: "choose",
        description: "Randomly chooses from provided options",
        options: [
            {
                name: "choices",
                description: "Comma-separated list of choices",
                type: ApplicationCommandOptionType.STRING,
                required: true
            }
        ],
        execute: opts => {
            const choices = findOption(opts, "choices", "").split(",").map(c => c.trim());
            const choice = choices[Math.floor(Math.random() * choices.length)];
            return { content: "I choose: " + choice };
        }
    },
    {
        name: "rolldice",
        description: "Roll a die with the specified number of sides",
        options: [RequiredMessageOption],
        execute: opts => {
            const sides = parseInt(findOption(opts, "message", "6"));
            const roll = Math.floor(Math.random() * sides) + 1;
            return { content: "You rolled a " + roll + "!" };
        }
    },
    {
        name: "flipcoin",
        description: "Flips a coin and returns heads or tails",
        options: [],
        execute: () => {
            const flip = Math.random() < 0.5 ? "Heads" : "Tails";
            return { content: "The coin landed on: " + flip };
        }
    },
    {
        name: "ask",
        description: "Ask a yes/no question and get an answer",
        options: [RequiredMessageOption],
        execute: opts => {
            const question = findOption(opts, "message", "");
            const responses = ["Yes", "No", "Maybe", "Ask again later", "Definitely not", "It is certain"];
            const response = responses[Math.floor(Math.random() * responses.length)];
            return { content: question + " - " + response };
        }
    },
    {
        name: "randomanimal",
        description: "Get a random cat picture",
        options: [
            {
                name: "animal",
                description: "pick your animal",
                type: ApplicationCommandOptionType.STRING,
                required: true,
                choices: [
                    { name: "cat", value: "cat", label: "cat" },
                    { name: "dog", value: "dog", label: "dog" }
                ]
            }
        ],
        execute: (opts, ctx) => {
            return (async () => {
                const animal = findOption(opts, "animal");
                let url;
                if (animal === "cat") {
                    url = "https://api.thecatapi.com/v1/images/search";
                } else if (animal === "dog") {
                    url = "https://api.thedogapi.com/v1/images/search";
                }
                try {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error("Failed to fetch " + animal + " image");
                    const data = await response.json();
                    return { content: data[0].url };
                } catch (_err) {
                    sendBotMessage(ctx.channel.id, {
                        content: "Sorry, couldn't fetch a cat picture right now 😿"
                    });
                }
            })();
        }
    },
    {
        name: "randomnumber",
        description: "Generates a random number between two values",
        options: [
            {
                name: "min",
                description: "Minimum value",
                type: ApplicationCommandOptionType.INTEGER,
                required: true
            },
            {
                name: "max",
                description: "Maximum value",
                type: ApplicationCommandOptionType.INTEGER,
                required: true
            }
        ],
        execute: opts => {
            const min = parseInt(findOption(opts, "min", "0"));
            const max = parseInt(findOption(opts, "max", "100"));
            const number = Math.floor(Math.random() * (max - min + 1)) + min;
            return { content: "Random number between " + min + " and " + max + ": " + number };
        }
    },
    {
        name: "transform",
        description: "Transform your text with the specified option",
        options: [
            {
                name: "text",
                description: "TEXT TO UPPERCASE",
                type: ApplicationCommandOptionType.STRING,
                required: true
            },
            {
                name: "transformation",
                description: "transformation to apply to your text",
                type: ApplicationCommandOptionType.STRING,
                required: true,
                choices: [
                    { name: "toLowerCase", value: "toLowerCase", label: "toLowerCase" },
                    { name: "toUpperCase", value: "toUpperCase", label: "toUpperCase" },
                    { name: "toLocaleLowerCase", value: "toLocaleLowerCase", label: "toLocaleLowerCase" },
                    { name: "toLocaleUpperCase", value: "toLocaleUpperCase", label: "toLocaleUpperCase" },
                    { name: "stay the same", value: "same", label: "stay the same" }
                ]
            },
            {
                name: "repeat",
                description: "how many times to repeat",
                type: ApplicationCommandOptionType.INTEGER,
                required: false
            },
            {
                name: "reverse",
                description: "reverse your text",
                type: ApplicationCommandOptionType.BOOLEAN,
                required: false
            },
            {
                name: "normalize",
                description: "which normailze option to use",
                type: ApplicationCommandOptionType.STRING,
                required: false,
                choices: [
                    { name: "NFC", value: "NFC", label: "NFC" },
                    { name: "NFD", value: "NFD", label: "NFD" },
                    { name: "NFKC", value: "NFKC", label: "NFKC" },
                    { name: "NFKD", value: "NFKD", label: "NFKD" }
                ]
            }
        ],
        execute: opts => {
            let text = findOption(opts, "text");
            const transform = findOption(opts, "transformation");
            const repeat = findOption(opts, "repeat") ?? 1;
            const normalize = findOption(opts, "normalize");
            const reverse = findOption(opts, "reverse");

            if (transform !== "same") {
                text = (text && text[transform] && text[transform].call(text)) ?? text;
            }

            if (normalize) text = text.normalize(normalize);
            if (reverse) text = text.split("").reverse().join("");

            return { content: text.repeat(repeat) };
        }
    },
    {
        name: "wordcount",
        description: "Counts the number of words in a message",
        options: [RequiredMessageOption],
        inputType: ApplicationCommandInputType.BOT,
        execute: (opts, ctx) => {
            const message = findOption(opts, "message", "");
            const wordCount = message.trim().split(/\s+/).length;
            sendBotMessage(ctx.channel.id, {
                content: "The message contains " + wordCount + " words."
            });
        }
    },
    {
        name: "countdown",
        description: "Starts a countdown from a specified number",
        options: [
            {
                name: "number",
                description: "Number to countdown from (max 10)",
                type: ApplicationCommandOptionType.INTEGER,
                required: true
            }
        ],
        inputType: ApplicationCommandInputType.BOT,
        execute: async (opts, ctx) => {
            const number = Math.min(parseInt(findOption(opts, "number", "5")), 10);
            if (isNaN(number) || number < 1) {
                sendBotMessage(ctx.channel.id, {
                    content: "Please provide a valid number between 1 and 10!"
                });
                return;
            }
            sendBotMessage(ctx.channel.id, {
                content: "Starting countdown from " + number + "..."
            });
            for (let i = number; i >= 0; i--) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                sendBotMessage(ctx.channel.id, {
                    content: i === 0 ? "🎉 Go! 🎉" : i + "..."
                });
            }
        }
    },
    {
        name: "nekos",
        description: "Send Neko",
        execute: async () => ({
            content: await getCuteNeko()
        })
    },
    {
        name: "anime-boys",
        description: "Send cute anime boys",
        options: [
            {
                name: "cat",
                description: "If set, this will send exclusively cute anime cat boys",
                type: ApplicationCommandOptionType.BOOLEAN,
                required: false
            }
        ],
        execute: async opts => {
            let sub = "cuteanimeboys";
            const cat = findOption(opts, "cat");
            if (cat) sub = "animecatboys";
            return { content: await getCuteAnimeBoys(sub) };
        }
    },
    {
        name: "ping",
        description: "Pings the bot to check if it's responding",
        options: [],
        inputType: ApplicationCommandInputType.BOT,
        execute: (_opts, ctx) => {
            sendBotMessage(ctx.channel.id, { content: "Pong!" });
        }
    },
    {
        name: "echo",
        description: "Sends a message as Clyde (locally)",
        options: [OptionalMessageOption],
        inputType: ApplicationCommandInputType.BOT,
        execute: (opts, ctx) => {
            const content = findOption(opts, "message", "");
            sendBotMessage(ctx.channel.id, { content });
        }
    },
    {
        name: "lenny",
        description: "Sends a lenny face",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " ( ͡° ͜ʖ ͡°)"
        })
    },
    {
        name: "mock",
        description: "mOcK PeOpLe",
        options: [RequiredMessageOption],
        execute: opts => ({
            content: mock(findOption(opts, "message", ""))
        })
    },
    {
        inputType: ApplicationCommandInputType.BUILT_IN_TEXT,
        name: "slap",
        description: "Slap someone/something.",
        options: [{
            name: "victim",
            description: "Thing to slap",
            required: true,
            type: ApplicationCommandOptionType.STRING
        }],
        execute: opts => {
            const victim = findOption(opts, "victim");
            const user = getUserStore() && getUserStore().getCurrentUser();
            return { content: "<@" + (user && user.id) + "> slaps " + victim + " around a bit with a large trout" };
        }
    },
    {
        name: "freaky",
        description: "it's freaky.",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [{
            name: "message",
            description: "yoooo freaky",
            type: ApplicationCommandOptionType.STRING,
            required: true
        }],
        execute: (opts, ctx) => {
            sendUserMessage(ctx.channel.id, { content: makeFreaky(findOption(opts, "message", "")) });
        }
    },
    {
        inputType: ApplicationCommandInputType.BUILT_IN_TEXT,
        name: "morse",
        description: "Translate to or from Morse code",
        options: [
            {
                name: "text",
                description: "Text to convert",
                type: ApplicationCommandOptionType.STRING,
                required: true
            }
        ],
        execute: opts => {
            const input = opts.find(o => o.name === "text") && opts.find(o => o.name === "text").value;
            const output = isMorse(input) ? fromMorse(input) : toMorse(input);
            return { content: "" + output };
        }
    },
    {
        name: "uwuify",
        description: "uwuifies your messages",
        options: [RequiredMessageOption],
        execute: opts => ({
            content: uwuify(findOption(opts, "message", ""))
        })
    },
    {
        name: "gifroulette",
        description: "Tempt fate and send a gif",
        execute: (opts, other) => {
            const ctx = resolveCtx(opts, other);
            const channelId = getChannelId(ctx);
            try { console.log("[MoreCommands] gifroulette run channel=", channelId, "ctxKeys=", ctx && Object.keys(ctx)); } catch (_e0) {}
            if (GUILD_IDS.includes((ctx && ctx.guild && ctx.guild.id) || (other && other.guild && other.guild.id) || "")) {
                sendBotMessage(channelId, {
                    content: "This command is restricted in this server."
                });
                return;
            }
            try {
                const url = unwrapDiscordProxy(getFavoriteGif(opts, ctx));
                try { console.log("[MoreCommands] gifroulette url=", url); } catch (_e1) {}
                if (!url) {
                    sendBotMessage(channelId, {
                        content: "No favorite GIFs found. Star a GIF in the GIF picker first."
                    });
                    return;
                }
                return sendGifToChannel(channelId, url).then(function (sent) {
                    try { console.log("[MoreCommands] gifroulette sent=", sent); } catch (_e2) {}
                    if (!sent) return { content: url };
                });
            } catch (err) {
                try { console.error("[MoreCommands] gifroulette threw", err); } catch (_e3) {}
                sendBotMessage(channelId, {
                    content: "Couldn't pick a favorite GIF: " + (err && err.message ? err.message : String(err))
                });
            }
        }
    },
    {
        inputType: ApplicationCommandInputType.BUILT_IN,
        name: "friendcloud",
        description: "Display user you most interact with in a cloud",
        options: [
            {
                name: "count",
                description: "Number of users to display",
                type: ApplicationCommandOptionType.NUMBER,
                required: false
            }
        ],
        execute: async (opts, cmdCtx) => {
            const count = findOption(opts, "count", 25);
            if (!count) return sendBotMessage(cmdCtx.channel.id, { content: "The count must be 1 or higher!" });
            try {
                const AffStore = findByStoreName("UserAffinitiesStore")
                    || findByProps("getUserAffinities")
                    || (getMod()._test && getMod()._test.UserAffinitiesStore);
                const affinities = AffStore && AffStore.getUserAffinities && AffStore.getUserAffinities();
                if (!(affinities && affinities.length)) {
                    return sendBotMessage(cmdCtx.channel.id, {
                        content: "No affinities found. Check your [privacy settings](<https://support.discord.com/hc/en-us/articles/21864805694999-Data-Used-to-Improve-Discord>)."
                    });
                }
                const UserStore = getUserStore();
                const users = affinities
                    .map(e => ({
                        member: UserStore && UserStore.getUser(e.otherUserId),
                        affinity: calculateAffinityScore(e)
                    }))
                    .filter(x => x.member && x.member.id)
                    .sort((a, b) => b.affinity - a.affinity)
                    .slice(0, count);
                if (!users.length) {
                    return sendBotMessage(cmdCtx.channel.id, {
                        content: "No valid users found in affinities. Check your [privacy settings](<https://support.discord.com/hc/en-us/articles/21864805694999-Data-Used-to-Improve-Discord>)."
                    });
                }
                const minAffinity = Math.min(...users.map(u => u.affinity));
                const maxAffinity = Math.max(...users.map(u => u.affinity));
                const minSize = 120;
                const maxSize = 240;
                const getSize = (affinity) => {
                    if (maxAffinity === minAffinity) return (minSize + maxSize) / 2;
                    return minSize + ((affinity - minAffinity) / (maxAffinity - minAffinity)) * (maxSize - minSize);
                };
                const avgSize = (minSize + maxSize) / 2;
                const { width: canvasWidth, height: canvasHeight } = calculateCanvasSize(users.length, avgSize);
                const canvas = createCanvas(canvasWidth, canvasHeight);
                const ctx = canvas.getContext("2d");
                const positions = [];
                const userPositions = users.map(user => {
                    const size = getSize(user.affinity);
                    const pos = generatePoissonDiskPosition(positions, canvasWidth, canvasHeight, size);
                    positions.push({ x: pos.x, y: pos.y, size });
                    return Object.assign({}, user, { x: pos.x, y: pos.y, size });
                });
                let loadedImages = 0;
                const totalImages = userPositions.length;
                const drawImage = async user => {
                    try {
                        const avatarUrl = user.member && user.member.avatar
                            ? "https://cdn.discordapp.com/avatars/" + user.member.id + "/" + user.member.avatar + ".webp?size=256"
                            : "https://cdn.discordapp.com/embed/avatars/" + ((user.member.id % 5)) + ".png";
                        const img = await loadFriendImage(avatarUrl);
                        const centerX = user.x + user.size / 2;
                        const centerY = user.y + user.size / 2;
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(centerX, centerY, user.size / 2, 0, Math.PI * 2);
                        ctx.clip();
                        ctx.drawImage(img, user.x, user.y, user.size, user.size);
                        ctx.restore();
                        ctx.strokeStyle = "#808080";
                        ctx.lineWidth = 3;
                        ctx.beginPath();
                        ctx.arc(centerX, centerY, user.size / 2 + 1, 0, Math.PI * 2);
                        ctx.stroke();
                    } catch (_e) {
                        /* ignore */
                    } finally {
                        loadedImages++;
                        if (loadedImages === totalImages) {
                            canvas.toBlob(blob => {
                                if (!blob) {
                                    sendBotMessage(cmdCtx.channel.id, { content: "Couldn't generate the image :c" });
                                    return;
                                }
                                const file = makeFile(blob, "affinities-cloud.png", "image/png");
                                promptUpload(file, cmdCtx.channel);
                            }, "image/png");
                        }
                    }
                };
                userPositions.forEach(drawImage);
            } catch (e) {
                if (e instanceof Error) sendBotMessage(cmdCtx.channel.id, { content: e.message });
            }
        }
    },
    {
        inputType: ApplicationCommandInputType.BUILT_IN,
        name: "imgtogif",
        description: "Allows you to turn an image to a gif",
        options: [
            {
                name: "image",
                description: "Image attachment to use",
                type: ApplicationCommandOptionType.ATTACHMENT
            },
            {
                name: "width",
                description: "Width of the gif",
                type: ApplicationCommandOptionType.INTEGER
            },
            {
                name: "height",
                description: "Height of the gif",
                type: ApplicationCommandOptionType.INTEGER
            }
        ],
        execute: async (opts, cmdCtx) => {
            const DraftType = getDraftType();
            const slash = DraftType.SlashCommand != null ? DraftType.SlashCommand : DraftType.ApplicationLauncherCommand;
            const manager = getUploadManager();
            try {
                const resolved = await resolveImage(opts, cmdCtx);
                const image = resolved.image;
                const width = resolved.width;
                const height = resolved.height;
                if (!image) throw "No Image specified!";
                const avatar = await loadImage(image);
                let gifWidth, gifHeight;
                if (width && height) {
                    gifWidth = width;
                    gifHeight = height;
                } else if (width) {
                    gifWidth = width;
                    gifHeight = Math.round((avatar.height / avatar.width) * width);
                } else if (height) {
                    gifHeight = height;
                    gifWidth = Math.round((avatar.width / avatar.height) * height);
                } else {
                    gifWidth = avatar.width;
                    gifHeight = avatar.height;
                }
                const gif = GIFEncoder();
                const canvas = createCanvas(gifWidth, gifHeight);
                const ctx = canvas.getContext("2d");
                if (manager && manager.clearAll) manager.clearAll(cmdCtx.channel.id, slash);
                for (let i = 0; i < FRAMES; i++) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(avatar, 0, 0, avatar.width, avatar.height, 0, 0, canvas.width, canvas.height);
                    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const palette = quantize(data, 256);
                    const index = applyPalette(data, palette);
                    gif.writeFrame(index, canvas.width, canvas.height, {
                        transparent: true,
                        palette
                    });
                }
                gif.finish();
                const originalName = image.name ? image.name.replace(/\.[^/.]+$/, "") : "converted";
                const file = makeFile(gif.bytesView(), originalName + ".gif", "image/gif");
                setTimeout(() => promptUpload(file, cmdCtx.channel), 10);
            } catch (err) {
                if (manager && manager.clearAll) manager.clearAll(cmdCtx.channel.id, slash);
                sendBotMessage(cmdCtx.channel.id, { content: String(err) });
            }
        }
    },
    {
        name: "dissatisfaction",
        description: " ＞﹏＜",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + " ＞﹏＜"
        })
    },
    {
        name: "smug",
        description: "ಠ_ಠ",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + "ಠ_ಠ"
        })
    },
    {
        name: "happy",
        description: "ヽ(´▽`)/",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + "ヽ(´▽`)/"
        })
    },
    {
        name: "crying",
        description: "ಥ_ಥ",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + "ಥ_ಥ"
        })
    },
    {
        name: "angry",
        description: "ヽ(｀Д´)ﾉ",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + "ヽ(｀Д´)ﾉ"
        })
    },
    {
        name: "anger",
        description: "ヽ(ｏ`皿′ｏ)ﾉ",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + "ヽ(ｏ`皿′ｏ)ﾉ"
        })
    },
    {
        name: "joy",
        description: "<(￣︶￣)>",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + "<(￣︶￣)>"
        })
    },
    {
        name: "blush",
        description: "૮ ˶ᵔ ᵕ ᵔ˶ ა",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + "૮ ˶ᵔ ᵕ ᵔ˶ ა"
        })
    },
    {
        name: "confused",
        description: "(•ิ_•ิ)?",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + "(•ิ_•ิ)?"
        })
    },
    {
        name: "sleeping",
        description: "(ᴗ_ᴗ)",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + "(ᴗ_ᴗ)"
        })
    },
    {
        name: "laughing",
        description: "o(≧▽≦)o",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + "o(≧▽≦)o"
        })
    },
    {
        name: "giving",
        description: "(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + "(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧"
        })
    },
    {
        name: "peace",
        description: "✌(◕‿-)✌",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + "✌(◕‿-)✌"
        })
    },
    {
        name: "ending1",
        description: "Ꮺ ָ࣪ ۰ ͙⊹",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + "Ꮺ ָ࣪ ۰ ͙⊹"
        })
    },
    {
        name: "uwu",
        description: "(>⩊<)",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + "(>⩊<)"
        })
    },
    {
        name: "comfy",
        description: "(─‿‿─)♡",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + "(─‿‿─)♡"
        })
    },
    {
        name: "lovehappy",
        description: "(*≧ω≦*)",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + "(*≧ω≦*)"
        })
    },
    {
        name: "loveee",
        description: "(⁄ ⁄>⁄ ▽ ⁄<⁄ ⁄)",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + "(⁄ ⁄>⁄ ▽ ⁄<⁄ ⁄)"
        })
    },
    {
        name: "give",
        description: "(ノ= ⩊ = )ノ",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + "(ノ= ⩊ = )ノ"
        })
    },
    {
        name: "lovegive",
        description: "ღゝ◡╹)ノ♡",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + "ღゝ◡╹)ノ♡"
        })
    },
    {
        name: "music",
        description: "(￣▽￣)/♫•¨•.¸¸♪",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + "(￣▽￣)/♫•¨•.¸¸♪"
        })
    },
    {
        name: "stars",
        description: ".𖥔 ݁ ˖๋ ࣭ ⭑",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + ".𖥔 ݁ ˖๋ ࣭ ⭑"
        })
    },
    {
        name: "lovegiving",
        description: "⸜(｡˃ ᵕ ˂ )⸝♡",
        options: [OptionalMessageOption],
        execute: opts => ({
            content: findOption(opts, "message", "") + " " + "⸜(｡˃ ᵕ ˂ )⸝♡"
        })
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
        try { console.log("[MoreCommands] /" + name + " execute", "id=" + cmd.id, "channel", getChannelId(ctx) || getChannelId(args)); } catch (_log) {}
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
            try { console.error("[MoreCommands] /" + name + " threw", err); } catch (_e3) {}
            throw err;
        }
    };
    return cmd;
}

function injectBuiltInCommands() {
    var commandsModule = findByProps("getBuiltInCommands");
    var patcher = getMod().api && getMod().api.patcher;
    if (!commandsModule || !patcher || typeof patcher.after !== "function") {
        try { console.log("[MoreCommands] skip getBuiltInCommands patch"); } catch (_e) {}
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
    try { console.log("[MoreCommands] patched getBuiltInCommands count=" + preparedCommands.length); } catch (_e2) {}
}

function getReact() {
    const mod = getMod();
    return (mod.metro && mod.metro.common && mod.metro.common.React)
        || (typeof window !== "undefined" && window.React)
        || (typeof globalThis !== "undefined" && globalThis.React);
}

function patchSendEdit() {
    const patcher = getMod().api && getMod().api.patcher;
    const msgUtil = findByProps("sendMessage", "sendBotMessage")
        || findByProps("sendMessage")
        || (getMod().metro && getMod().metro.common && getMod().metro.common.messageUtil);
    if (patcher && msgUtil && msgUtil.sendMessage) {
        sendUnpatch.push(patcher.before("sendMessage", msgUtil, function (args) {
            const msg = args[1];
            if (msg && typeof msg === "object") onSend(msg);
        }));
    } else if (getMod()._test) {
        getMod()._test.onSend = onSend;
    }
    const editMod = findByProps("editMessage") || msgUtil;
    if (patcher && editMod && editMod.editMessage) {
        sendUnpatch.push(patcher.before("editMessage", editMod, function (args) {
            const msg = args[2] || args[1];
            if (msg && typeof msg === "object" && typeof msg.content === "string") onSend(msg);
        }));
    }
    const React = getReact();
    if (patcher && React && React.createElement) {
        sendUnpatch.push(patcher.before("createElement", React, function (args) {
            if (!settings.store.uwuEverything) return;
            const props = args[1];
            if (props && props.children) uwuifyProps(props);
        }));
    }
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
        try { console.error("[MoreCommands] injectBuiltInCommands", eInj); } catch (_e2) {}
    }
    try { patchSendEdit(); } catch (_e3) { /* commands still stay registered */ }
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

function SettingsComponent() {
    const React = getReact();
    if (!React) return null;
    const [, bump] = React.useState(0);
    const store = getStorage();
    const comps = (getMod().metro && getMod().metro.common && getMod().metro.common.components) || {};
    const TableSwitchRow = comps.TableSwitchRow || comps.FormSwitchRow;
    const TableRowGroup = comps.TableRowGroup || comps.FormSection;
    const rows = [
        ["addFreakyEnding", SETTINGS_META.addFreakyEnding.description],
        ["uwuEveryMessage", SETTINGS_META.uwuEveryMessage.description],
        ["uwuEverything", SETTINGS_META.uwuEverything.description]
    ].map(function (pair) {
        const key = pair[0], desc = pair[1];
        const props = {
            key: key,
            label: key,
            subLabel: desc,
            value: !!store[key],
            onValueChange: function (v) {
                store[key] = v;
                bump(function (n) { return n + 1; });
            }
        };
        return React.createElement(TableSwitchRow || "div", props);
    });
    return React.createElement(TableRowGroup || "div", { title: "MoreCommands" }, rows);
}

const plugin = definePlugin({
    start: start,
    stop: stop,
    onLoad: start,
    onUnload: stop,
    SettingsComponent: SettingsComponent,
    settings: SettingsComponent,
    mock: mock,
    uwuify: uwuify,
    uwuifyArray: uwuifyArray,
    uwuifyProps: uwuifyProps,
    toMorse: toMorse,
    fromMorse: fromMorse,
    isMorse: isMorse,
    makeFreaky: makeFreaky,
    endings: endings,
    replacements: replacements,
    charMap: charMap,
    settingsStore: settings,
    settingsMeta: SETTINGS_META,
    commands: commands,
    onSend: onSend,
    ApplicationCommandOptionType: ApplicationCommandOptionType,
    findOption: findOption,
    getCuteNeko: getCuteNeko,
    getCuteAnimeBoys: getCuteAnimeBoys,
    getFavoriteGif: getFavoriteGif,
    calculateAffinityScore: calculateAffinityScore,
    generatePoissonDiskPosition: generatePoissonDiskPosition,
    calculateCanvasSize: calculateCanvasSize,
    encodePNG: encodePNG,
    GIFEncoder: GIFEncoder,
    quantize: quantize,
    applyPalette: applyPalette,
    FRAMES: FRAMES,
    GUILD_IDS: GUILD_IDS
});
