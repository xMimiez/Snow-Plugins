/*
  HighlightCode — Snow spec-3 port of m4fn3/HighlightCode (Enmity iOS).
  Original: mafu. Snow port: Mime | N0_.q3.
*/
var unpatches = [];
var _storage;

var THEME = {
    punctuation: "#959da5",
    "class-name": "#fb8532",
    keyword: "#ff7b72",
    boolean: "#ff7b72",
    parameter: "#f6f8fa",
    function: "#b392f0",
    property: "#b392f0",
    comment: "#8b949e",
    operator: "#79c0ff",
    constant: "#79c0ff",
    number: "#79c0ff",
    string: "#79b8ff",
    selector: "#79b8ff",
    builtin: "#79b8ff"
};
var DECORATOR = { bold: "strong", important: "strong", italic: "em" };

var LANG_LIST = {
    html: ["html", true],
    css: ["CSS", true],
    javascript: ["JavaScript", true],
    js: ["JavaScript", true],
    python: ["Python", true],
    py: ["Python", true],
    bash: ["bash", true],
    sh: ["bash", true],
    shell: ["bash", true],
    typescript: ["TypeScript", true],
    ts: ["TypeScript", true],
    tsx: ["React TSX", false],
    c: ["c", true],
    markdown: ["markdown", true],
    md: ["markdown", true],
    go: ["Go", true],
    json: ["JSON", true],
    swift: ["Swift", true],
    perl: ["Perl", false],
    ruby: ["Ruby", true],
    rb: ["Ruby", true],
    php: ["PHP", true],
    java: ["Java", true],
    jsx: ["React JSX", false],
    lua: ["Lua", true],
    kt: ["Kotlin", true],
    kts: ["Kotlin", true],
    objc: ["Objective-C", false],
    objectivec: ["Objective-C", false]
};

var KW = {
    javascript: "\\b(?:const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|this|true|false|null|undefined|try|catch|throw|typeof|instanceof|switch|case|break|default|of|in)\\b",
    python: "\\b(?:def|class|import|from|return|if|elif|else|for|while|True|False|None|and|or|not|in|as|with|try|except|lambda|yield|async|await|pass|raise)\\b",
    typescript: "\\b(?:const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|this|true|false|null|undefined|interface|type|extends|implements|public|private|readonly)\\b",
    bash: "\\b(?:if|then|else|fi|for|do|done|in|while|case|esac|function|echo|export|alias|cd|exit)\\b",
    go: "\\b(?:func|package|import|return|if|else|for|range|var|const|type|struct|interface|map|go|defer|chan)\\b",
    java: "\\b(?:public|private|protected|class|interface|void|int|new|return|if|else|for|while|static|final|import|package|try|catch|throw|this)\\b",
    swift: "\\b(?:func|let|var|class|struct|enum|if|else|for|while|return|import|guard|nil|true|false|self)\\b",
    ruby: "\\b(?:def|class|module|end|if|else|elsif|unless|while|do|return|require|nil|true|false|self)\\b",
    php: "\\b(?:function|class|return|if|else|foreach|for|while|echo|new|public|private|protected|namespace|use)\\b",
    lua: "\\b(?:function|local|return|if|then|else|end|for|while|do|nil|true|false)\\b",
    kotlin: "\\b(?:fun|val|var|class|if|else|for|when|return|import|null|true|false|override)\\b",
    c: "\\b(?:int|char|void|return|if|else|for|while|struct|typedef|const|static|sizeof)\\b",
    css: "\\b(?:color|background|display|flex|margin|padding|font|border|width|height|position)\\b",
    json: "\\b(?:true|false|null)\\b"
};

function langKey(lang) {
    var l = String(lang || "").toLowerCase();
    if (l === "js" || l === "jsx") return "javascript";
    if (l === "ts" || l === "tsx") return "typescript";
    if (l === "py") return "python";
    if (l === "sh" || l === "shell") return "bash";
    if (l === "rb") return "ruby";
    if (l === "kt" || l === "kts") return "kotlin";
    if (l === "md") return "markdown";
    if (l === "objc" || l === "objectivec") return "c";
    return l;
}

function isSupportedLang(lang) {
    var k = langKey(lang);
    return !!(LANG_LIST[lang] || LANG_LIST[k] || KW[k]);
}

function getMod() {
    var list = [];
    try { if (typeof snow !== "undefined" && snow) list.push(snow); } catch (_e) {}
    try { if (typeof bunny !== "undefined" && bunny) list.push(bunny); } catch (_e2) {}
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    if (g.snow) list.push(g.snow);
    if (g.bunny) list.push(g.bunny);
    if (g.vendetta) list.push(g.vendetta);
    var i;
    function ok(m) {
        return m && ((m.api && m.api.patcher) || m.plugin || m.metro);
    }
    for (i = 0; i < list.length; i++) if (ok(list[i]) && list[i].api && list[i].api.patcher) return list[i];
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

function getRN() {
    return findByProps("View", "Text", "NativeModules")
        || findByProps("View", "Text")
        || (getMod().metro && getMod().metro.common && getMod().metro.common.ReactNative);
}

function getStorage() {
    if (_storage) return _storage;
    try { _storage = getMod().plugin.createStorage(); } catch (_e) { _storage = {}; }
    if (_storage.show_line_num === undefined) _storage.show_line_num = false;
    return _storage;
}

function processColor(color) {
    var RN = getRN();
    if (RN && typeof RN.processColor === "function") {
        try { return RN.processColor(color); } catch (_e) {}
    }
    return color;
}

function highlight(text, lang) {
    var rules = [
        { type: "comment", re: /\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*/ },
        { type: "string", re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/ },
        { type: "number", re: /\b\d+(?:\.\d+)?\b/ },
        { type: "punctuation", re: /[{}[\]();,.]/ },
        { type: "operator", re: /===|!==|==|!=|<=|>=|=>|\+\+|--|&&|\|\||[+\-*/%=<>!&|]/ }
    ];
    var key = langKey(lang);
    if (KW[key]) rules.splice(2, 0, { type: "keyword", re: new RegExp(KW[key]) });
    if (key === "javascript" || key === "typescript") {
        rules.splice(2, 0, { type: "boolean", re: /\b(?:true|false|null|undefined)\b/ });
        rules.splice(2, 0, { type: "function", re: /\b[A-Za-z_][A-Za-z0-9_]*(?=\s*\()/ });
    }
    var out = [];
    var remaining = String(text);
    while (remaining.length) {
        var best = null;
        for (var i = 0; i < rules.length; i++) {
            var m = remaining.match(rules[i].re);
            if (m && m.index != null && (!best || m.index < best.index)) {
                best = { type: rules[i].type, index: m.index, text: m[0] };
            }
        }
        if (!best) {
            out.push(remaining);
            break;
        }
        if (best.index > 0) out.push(remaining.slice(0, best.index));
        out.push({ type: best.type, content: best.text });
        remaining = remaining.slice(best.index + best.text.length);
    }
    return out;
}

function colorNode(text, color) {
    return {
        content: [{ type: "text", content: text }],
        target: "usernameOnClick",
        context: {
            username: 1,
            usernameOnClick: { linkColor: processColor(color) },
            medium: true
        },
        type: "link"
    };
}

function highlightText(text, lang) {
    if (getStorage().show_line_num) {
        text = String(text).split("\n").map(function (code, idx) {
            return String(idx + 1).padStart(3) + "  " + code;
        }).join("\n");
    }
    var res = highlight(text, lang);
    var contents = [];
    for (var i = 0; i < res.length; i++) {
        var part = res[i];
        if (typeof part === "object") {
            var style = part.alias || part.type;
            if (THEME[style]) {
                contents.push(colorNode(part.content, THEME[style]));
            } else if (DECORATOR[style]) {
                contents.push({ type: DECORATOR[style], content: part.content });
            } else {
                contents.push({ type: "text", content: part.content });
            }
        } else {
            contents.push({ type: "text", content: part });
        }
    }
    return contents;
}

function walkContent(content) {
    var embeds = [];
    if (!Array.isArray(content)) return [content, embeds];
    content = content.map(function (obj) {
        if (!obj) return obj;
        if (typeof obj.content === "object") {
            var nested = walkContent(obj.content);
            obj.content = nested[0];
            embeds.push.apply(embeds, nested[1]);
        }
        if (obj.type === "codeBlock" && obj.lang && isSupportedLang(obj.lang)) {
            var known = Object.keys(LANG_LIST).indexOf(obj.lang) >= 0;
            var meta = known && LANG_LIST[obj.lang][1] ? LANG_LIST[obj.lang][0] : "Code";
            var iconURL = "https://raw.githubusercontent.com/m4fn3/HighlightCode/master/logos/" + meta + ".png";
            var rawContent = [
                { content: highlightText(obj.content, obj.lang), type: "paragraph" },
                { content: "-- By CodeHighlight", type: "text" }
            ];
            embeds.push({
                type: "rich",
                description: rawContent,
                author: {
                    name: known ? LANG_LIST[obj.lang][0] : obj.lang,
                    iconURL: iconURL,
                    iconProxyURL: iconURL
                },
                borderLeftColor: processColor("#e0e0ff"),
                providerColor: processColor("#e0e0ff"),
                headerTextColor: 4294967295,
                bodyTextColor: 4292599521
            });
            obj.type = "text";
            obj.content = "";
        }
        return obj;
    });
    return [content, embeds];
}

function transformRowsJson(json) {
    var rows = typeof json === "string" ? JSON.parse(json) : json;
    if (!Array.isArray(rows)) return json;
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (row && row.message && row.message.content) {
            var res = walkContent(row.message.content);
            row.message.content = res[0];
            row.message.embeds = row.message.embeds ? row.message.embeds.concat(res[1]) : res[1];
        }
    }
    return typeof json === "string" ? JSON.stringify(rows) : rows;
}

function start() {
    stop();
    var patcher = getMod().api && getMod().api.patcher;
    if (!patcher || typeof patcher.before !== "function") {
        try { console.log("[HighlightCode] no patcher"); } catch (_e) {}
        return;
    }
    var RN = getRN();
    var DCD = RN && RN.NativeModules && RN.NativeModules.DCDChatManager;
    if (DCD && typeof DCD.updateRows === "function") {
        unpatches.push(patcher.before("updateRows", DCD, function (args) {
            try {
                if (args && args[1]) args[1] = transformRowsJson(args[1]);
            } catch (err) {
                try { console.error("[HighlightCode] updateRows", err); } catch (_e2) {}
            }
        }));
        try { console.log("[HighlightCode] patched DCDChatManager.updateRows"); } catch (_e3) {}
    } else {
        try { console.log("[HighlightCode] DCDChatManager.updateRows not found (Android or new iOS)"); } catch (_e4) {}
    }
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
    var store = getStorage();
    var comps = (getMod().metro && getMod().metro.common && getMod().metro.common.components) || {};
    var TableSwitchRow = comps.TableSwitchRow;
    var TableRowGroup = comps.TableRowGroup;
    var [, bump] = React.useState(0);
    var row = TableSwitchRow
        ? React.createElement(TableSwitchRow, {
            label: "Show line numbers",
            value: !!store.show_line_num,
            onValueChange: function (v) { store.show_line_num = v; bump(function (n) { return n + 1; }); }
        })
        : null;
    if (TableRowGroup) return React.createElement(TableRowGroup, { title: "HighlightCode" }, row);
    var RN = getRN();
    if (RN && RN.View) return React.createElement(RN.View, { style: { padding: 12 } }, row);
    return row;
}

const plugin = definePlugin({
    start: start,
    stop: stop,
    onLoad: start,
    onUnload: stop,
    SettingsComponent: SettingsComponent,
    settings: SettingsComponent,
    highlight: highlight,
    highlightText: highlightText,
    walkContent: walkContent,
    transformRowsJson: transformRowsJson,
    isSupportedLang: isSupportedLang,
    langKey: langKey,
    getStorage: getStorage
});
