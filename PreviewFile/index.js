var plugin = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // PreviewFile.entry.js
  var PreviewFile_entry_exports = {};
  __export(PreviewFile_entry_exports, {
    default: () => PreviewFile_entry_default
  });

  // project:src/runtime.js
  function createRuntime(B, meta, defaults = {}) {
    const React = B.React;
    const RN = B.ReactNative;
    if (!React?.createElement || !RN?.View) throw new Error(`${meta.name}: host React/React Native unavailable`);
    const D = B.metro?.common?.components || {};
    const C = B.ui?.components || D;
    const cleanups = [];
    const listeners = /* @__PURE__ */ new Set();
    const requests = /* @__PURE__ */ new Set();
    const openSheets = /* @__PURE__ */ new Map();
    const control = new AbortController();
    let active = true;
    const store = B.plugin?.createStorage ? B.plugin.createStorage(defaults) : { ...defaults };
    for (const [key, value] of Object.entries(defaults)) if (store[key] === void 0) store[key] = value;
    const r = {
      B,
      meta,
      React,
      RN,
      C,
      D,
      h: React.createElement,
      store,
      metro: B.metro,
      common: B.metro?.common || {},
      host: B,
      context: { signal: control.signal },
      get active() {
        return active && !control.signal.aborted;
      },
      status: {},
      api: {
        commands: B.commands || B.api?.commands,
        flux: B.flux || B.api?.flux,
        patcher: B.patcher || B.api?.patcher,
        storage: {
          createStorage: () => store,
          get value() {
            return store;
          },
          flush: () => B.plugin?.flushStorage?.() || Promise.resolve()
        },
        ui: B.ui
      },
      own(fn) {
        if (typeof fn === "function") cleanups.push(fn);
        return fn;
      },
      changed() {
        for (const fn of listeners) fn();
      },
      useRefresh() {
        const [, bump] = React.useState(0);
        React.useEffect(() => {
          const fn = () => bump((n) => n + 1);
          listeners.add(fn);
          return () => listeners.delete(fn);
        }, []);
        return () => r.changed();
      },
      set(key, value) {
        store[key] = value;
        r.changed();
        Promise.resolve(B.plugin?.flushStorage?.()).catch((e) => r.error("Save settings", e));
      },
      find(...props) {
        try {
          return B.metro.findByProps?.(...props);
        } catch {
          return void 0;
        }
      },
      byName(name, raw = false) {
        try {
          return B.metro.findByName?.(name, !raw) || B.metro.findByDisplayName?.(name, !raw);
        } catch {
          return void 0;
        }
      },
      byStore(name) {
        try {
          return B.metro.findByStoreName?.(name);
        } catch {
          return void 0;
        }
      },
      toast(message, icon) {
        if (!r.active) return;
        const text = String(message);
        const show = B.ui?.showToast || B.ui?.toasts?.showToast;
        if (typeof show !== "function") return;
        if (icon) {
          try {
            show(text, icon);
            return;
          } catch {
          }
          try {
            show({ content: text, icon });
            return;
          } catch {
          }
        }
        show(text);
      },
      error(label, error) {
        const text = `${label}: ${error?.message || error}`;
        console.error(`[${meta.name}]`, text);
        r.status.lastError = text;
        r.changed();
        r.toast(text);
      },
      patch(kind, parent, key, callback) {
        const patcher = r.api.patcher;
        if (typeof parent?.[key] !== "function" || typeof patcher?.[kind] !== "function") return false;
        r.own(patcher[kind](key, parent, callback));
        return true;
      },
      subscribe(type, callback) {
        const flux = r.api.flux;
        if (typeof flux?.subscribe !== "function") throw new Error(`${meta.name}: flux.subscribe unavailable`);
        return r.own(flux.subscribe(type, (payload) => {
          if (r.active) callback(payload);
        }));
      },
      channelId(ctx) {
        if (typeof ctx === "string" && /^\d{5,}$/.test(ctx)) return ctx;
        if (ctx && !Array.isArray(ctx)) {
          const id = ctx.channel?.id || ctx.channel?.channelId || ctx.channelId || ctx.channel_id;
          if (id) return id;
        }
        const selected = r.byStore("SelectedChannelStore");
        return selected?.getChannelId?.() || selected?.getCurrentlySelectedChannelId?.() || selected?.getLastSelectedChannelId?.() || null;
      },
      async send(channelId, content) {
        if (!channelId || content == null || content === "") return false;
        const text = String(content);
        try {
          await r.discord(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ content: text }) });
          return true;
        } catch (error) {
          r.status.lastSendError = error?.message || String(error);
        }
        const util = r.find("sendMessage", "receiveMessage") || r.find("sendMessage", "sendBotMessage") || r.find("sendMessage");
        const snowflake = r.find("fromTimestamp");
        const nonce = typeof snowflake?.fromTimestamp === "function" ? String(snowflake.fromTimestamp(Date.now())) : String(Date.now());
        const body = { content: text, tts: false, nonce, invalidEmojis: [], validNonShortcutEmojis: [] };
        if (typeof util?.sendMessage === "function") {
          try {
            util.sendMessage(channelId, body);
            return true;
          } catch {
          }
          try {
            util.sendMessage(channelId, body, true);
            return true;
          } catch {
          }
          try {
            util.sendMessage(channelId, text);
            return true;
          } catch {
          }
        }
        return false;
      },
      local(channelId, content) {
        const util = r.find("sendBotMessage");
        if (typeof util?.sendBotMessage === "function") {
          try {
            util.sendBotMessage(channelId, content);
            return true;
          } catch {
          }
        }
        r.toast(String(content));
        return false;
      },
      command(command) {
        const register2 = r.api.commands?.registerCommand;
        if (typeof register2 !== "function") throw new Error(`${meta.name}: commands.registerCommand unavailable`);
        if (!r._commands) r._commands = [];
        if (r._nextCommandId == null) r._nextCommandId = -91e4 - Math.abs(hashId(meta.id)) % 9e3;
        const name = command.name;
        const execute = command.execute;
        const prepared = {
          ...command,
          name,
          displayName: command.displayName || name,
          displayDescription: command.displayDescription || command.description,
          untranslatedName: command.untranslatedName || name,
          untranslatedDescription: command.untranslatedDescription || command.description,
          applicationId: "-1",
          type: command.type ?? 1,
          inputType: 0,
          options: (command.options || []).map((opt) => ({
            ...opt,
            displayName: opt.displayName || opt.name,
            displayDescription: opt.displayDescription || opt.description || opt.name
          })),
          async execute(args, ctx) {
            if (!r.active) return;
            try {
              const result = await execute(args, ctx);
              if (!r.active) return;
              if (result && typeof result === "object" && typeof result.content === "string") {
                const cid = r.channelId(ctx) || r.channelId(args);
                if (cid && await r.send(cid, result.content)) return;
              }
              return result;
            } catch (error) {
              if (r.active) r.error(`/${name}`, error);
            }
          }
        };
        const remove = register2(prepared);
        prepared.id = String(r._nextCommandId--);
        r._commands.push(prepared);
        patchCommandList(r);
        return r.own(() => {
          try {
            remove?.();
          } catch {
          }
          r._commands = r._commands.filter((item) => item !== prepared);
        });
      },
      async request(url, options = {}, timeout = 15e3, maxBytes = Infinity) {
        if (!r.active) throw new Error("Plugin stopped");
        const controller = new AbortController();
        let rejectDeadline;
        const deadline = new Promise((_, reject) => {
          rejectDeadline = reject;
        });
        const abort = () => {
          controller.abort();
          rejectDeadline(new Error(r.active ? "Request timed out" : "Plugin stopped"));
        };
        requests.add(abort);
        control.signal.addEventListener("abort", abort, { once: true });
        const timer = setTimeout(abort, timeout);
        try {
          const response = await Promise.race([fetch(url, { ...options, signal: controller.signal }), deadline]);
          if (Number(response.headers?.get("content-length")) > maxBytes) {
            controller.abort();
            throw new Error("Response exceeds the preview size limit");
          }
          const text = await Promise.race([response.text(), deadline]);
          if (text.length > maxBytes) throw new Error("Response exceeds the preview size limit");
          if (!r.active) throw new Error("Plugin stopped");
          if (!response.ok) {
            let body;
            try {
              body = JSON.parse(text);
            } catch {
              body = {};
            }
            const error = new Error(body.message || `HTTP ${response.status}`);
            error.status = response.status;
            error.retryAfter = Number(body.retry_after) || 0;
            throw error;
          }
          return { response, text, json() {
            return text ? JSON.parse(text) : null;
          } };
        } finally {
          clearTimeout(timer);
          requests.delete(abort);
          control.signal.removeEventListener("abort", abort);
        }
      },
      async discord(path, options = {}) {
        if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid Discord API path");
        const token = r.find("getToken")?.getToken();
        if (!token) throw new Error("Discord session unavailable");
        return r.request("https://discord.com/api/v9" + path, { ...options, headers: { "Content-Type": "application/json", ...options.headers, Authorization: token } });
      },
      hook(names, transform) {
        const set = new Set(names);
        const jsx = B.api?.react?.jsx;
        if (jsx?.onJsxCreate && jsx?.deleteJsxCreate) {
          for (const name of names) {
            const callback = (_Component, element) => {
              if (!r.active) return;
              r.status[name] = (r.status[name] || 0) + 1;
              try {
                return transform(element, name);
              } catch (error) {
                r.error(`JSX ${name}`, error);
              }
            };
            jsx.onJsxCreate(name, callback);
            r.own(() => jsx.deleteJsxCreate(name, callback));
          }
        }
        r.patch("after", React, "createElement", (args, result) => {
          if (!r.active || !result) return;
          const type = args[0];
          const name = typeof type === "string" ? type : type?.displayName || type?.name || type?.type?.name;
          if (!name || !set.has(name)) return;
          r.status[name] = (r.status[name] || 0) + 1;
          try {
            return transform(result, name) ?? result;
          } catch (error) {
            r.error(`createElement ${name}`, error);
          }
        });
      },
      patchRows(transform) {
        const apply = (value) => {
          try {
            const wasString = typeof value === "string";
            const rows = wasString ? JSON.parse(value) : value;
            const next = transform(rows);
            if (next == null) return value;
            return wasString ? typeof next === "string" ? next : JSON.stringify(next) : next;
          } catch {
            return value;
          }
        };
        const modules = r.RN.NativeModules || {};
        for (const key of Object.keys(modules)) {
          if (typeof modules[key]?.updateRows === "function") {
            r.patch("before", modules[key], "updateRows", (args) => {
              if (args && args[1] != null) args[1] = apply(args[1]);
            });
          }
        }
        const manager = r.byName("RowManager");
        const proto = manager?.prototype || manager;
        if (typeof proto?.generate === "function") {
          r.patch("after", proto, "generate", (_args, row) => apply(row));
        }
      },
      hideSheets() {
        for (const close of [...openSheets.values()]) {
          try {
            close();
          } catch {
          }
        }
        openSheets.clear();
      },
      open(key, Component, props = {}) {
        const sheets = B.ui?.sheets;
        const ActionSheet = D.ActionSheet || C.ActionSheet;
        if (!sheets?.showSheet || !sheets?.hideSheet || !ActionSheet) throw new Error("Snow bottom-sheet components unavailable");
        const id = `${meta.id}.${key}`;
        openSheets.get(id)?.();
        let closed = false;
        const close = () => {
          if (closed) return;
          closed = true;
          if (openSheets.get(id) === close) openSheets.delete(id);
          sheets.hideSheet(id);
        };
        class Boundary extends React.Component {
          state = { error: null };
          static getDerivedStateFromError(error) {
            return { error };
          }
          componentDidCatch(error) {
            r.error("Sheet rendering", error);
          }
          render() {
            if (!this.state.error) return this.props.children;
            const U = ui(r);
            return r.h(U.Page, { title: "Could not display this page", close }, r.h(U.Text, null, this.state.error.message));
          }
        }
        function Page() {
          React.useEffect(() => () => {
            if (openSheets.get(id) === close) openSheets.delete(id);
            closed = true;
          }, []);
          return r.h(ActionSheet, { scrollable: true }, r.h(Boundary, null, r.h(Component, { ...props, close })));
        }
        openSheets.set(id, close);
        try {
          sheets.showSheet(id, Page);
        } catch (error) {
          close();
          throw error;
        }
        return close;
      },
      copy(text) {
        const clip = r.common.clipboard || r.find("setString");
        if (!clip?.setString) throw new Error("Clipboard unavailable");
        clip.setString(String(text));
        r.toast("Copied");
      },
      dispose() {
        active = false;
        control.abort();
        for (const abort of requests) abort();
        requests.clear();
        for (const close of [...openSheets.values()]) {
          try {
            close();
          } catch {
          }
        }
        openSheets.clear();
        while (cleanups.length) {
          try {
            cleanups.pop()();
          } catch (e) {
            console.error(`[${meta.name}] cleanup`, e?.message);
          }
        }
        listeners.clear();
        return r.api.storage.flush();
      }
    };
    return r;
  }
  function hashId(value) {
    let hash = 0;
    for (const char of String(value || "")) hash = hash * 31 + char.charCodeAt(0) | 0;
    return hash;
  }
  function patchCommandList(r) {
    if (r._commandListPatched) return;
    const module = r.find("getBuiltInCommands");
    if (typeof module?.getBuiltInCommands !== "function") return;
    r._commandListPatched = true;
    r.patch("after", module, "getBuiltInCommands", (_args, result) => {
      const list = Array.isArray(result) ? result : [];
      const byName = Object.fromEntries((r._commands || []).map((command) => [command.name, command]));
      if (!Object.keys(byName).length) return;
      const seen = {};
      const out = [];
      for (const command of list) {
        const name = command?.name || command?.untranslatedName;
        if (name && byName[name]) {
          if (seen[name]) continue;
          seen[name] = true;
          out.push(byName[name]);
        } else out.push(command);
      }
      for (const command of r._commands || []) {
        if (!seen[command.name]) {
          out.push(command);
          seen[command.name] = true;
        }
      }
      return out;
    });
  }
  function ui(r) {
    const { h, C, D, RN, store } = r;
    function Text({ children, muted = false, heading = false, color, ...props }) {
      const Comp = D.Text || C.Text;
      if (Comp) return h(Comp, { variant: heading ? "heading-md/semibold" : "text-md/normal", color: color || (muted ? "text-muted" : "text-normal"), ...props }, children);
      return h(RN.Text, props, children);
    }
    function Button({ text, onPress, disabled, variant = "primary", ...props }) {
      const Comp = D.Button || C.Button;
      if (Comp) return h(Comp, { text, onPress, disabled, variant, size: "md", ...props });
      return h(RN.Pressable || RN.TouchableOpacity, { onPress, disabled, accessibilityRole: "button", style: { padding: 12 } }, h(Text, null, text));
    }
    function Page({ title, children, close }) {
      const body = [
        title ? h(Text, { key: "title", heading: true, accessibilityRole: "header" }, title) : null,
        children,
        close ? h(Button, { key: "close", text: "Close", variant: "secondary", onPress: close }) : null
      ];
      if (C.SettingsPage) return h(C.SettingsPage, null, ...body);
      return h(RN.View, { style: { padding: 16, gap: 12 } }, ...body);
    }
    function Input({ value, onChange, ...props }) {
      if (D.TextInput) return h(D.TextInput, { value, onChange, ...props });
      if (C.TextInput) return h(C.TextInput, { value, onChange, ...props });
      return h(RN.TextInput, { value, onChangeText: onChange, ...props });
    }
    function Toggle({ setting, label, subLabel, icon }) {
      r.useRefresh();
      const Row = D.TableSwitchRow || C.TableSwitchRow;
      if (!Row) return null;
      return h(Row, {
        label,
        subLabel,
        icon: icon || (C.RowIcon ? h(C.RowIcon, { name: "SettingsIcon" }) : void 0),
        value: !!store[setting],
        onValueChange: (v) => r.set(setting, v)
      });
    }
    function Slider({ value, onValueChange, minimumValue = 0, maximumValue = 1, step, ...props }) {
      const Comp = D.Slider || C.Slider;
      if (Comp) return h(Comp, { value, onValueChange, minimumValue, maximumValue, step, ...props });
      return h(Input, { value: String(value), onChange: (text) => onValueChange(Number(text) || 0), keyboardType: "numeric" });
    }
    return { Text, Button, Page, Input, Toggle, Slider };
  }
  function register(meta, factory) {
    const B = bunny;
    let runtime;
    let instance;
    return definePlugin({
      async start() {
        if (runtime) {
          try {
            await instance?.stop?.();
          } finally {
            await runtime.dispose();
          }
        }
        runtime = createRuntime(B, meta, factory.defaults || {});
        try {
          instance = factory(runtime);
          await instance.start?.();
        } catch (error) {
          runtime.error("Start failed", error);
          await runtime.dispose();
          throw error;
        }
      },
      async stop() {
        try {
          await instance?.stop?.();
        } finally {
          await runtime?.dispose();
          instance = null;
          runtime = null;
        }
      },
      SettingsComponent() {
        return instance?.Settings ? runtime.h(instance.Settings) : null;
      }
    });
  }

  // project:src/plugins/preview-file.js
  var MAX_BYTES = 256 * 1024;
  var HOSTS = ["cdn.discordapp.com", "media.discordapp.net", "cdn.discord.com", "media.discord.com"];
  var TEXT = /\.(txt|md|json|js|jsx|ts|tsx|py|css|html|xml|yml|yaml|csv|log|ini|sh|c|cpp|h|java|rs|go)$/i;
  function previewable(a) {
    if (!a || a.failed || a.error || a.state === "FAILED" || a.status === "FAILED" || a.uploadFailed) return false;
    const name = a.filename || a.name || a.filename_ || "";
    const type = a.content_type || a.contentType || "";
    const url = a.url || a.proxy_url || a.proxyUrl;
    if (!url || typeof url !== "string") return false;
    const textType = /^text\//i.test(type) || type === "application/json";
    return (TEXT.test(name) || textType) && Number(a.size || 0) <= MAX_BYTES;
  }
  function attachmentUrl(value) {
    const u = new URL(value);
    if (u.protocol !== "https:" || !HOSTS.includes(u.hostname) || !u.pathname.includes("/attachments/") || u.username || u.password) {
      throw new Error("Only Discord attachment URLs are supported");
    }
    return u.href;
  }
  function PreviewFile(r) {
    const { h, React, RN } = r, { Page, Text, Button } = ui(r), cache = /* @__PURE__ */ new Map(), Gate = React.createContext(false);
    function attachmentFrom(props) {
      if (!props) return null;
      return props.attachment || props.file || props.upload || props.item || (Array.isArray(props.attachments) ? props.attachments[0] : null);
    }
    async function load(a) {
      if (!previewable(a)) throw new Error("Unsupported file or file exceeds 256 KB");
      const url = attachmentUrl(a.url || a.proxy_url || a.proxyUrl);
      if (cache.has(url)) return cache.get(url);
      const result = await r.request(url, { headers: { Range: `bytes=0-${MAX_BYTES}` } }, 15e3, MAX_BYTES);
      if (result.text.includes("\0")) throw new Error("Binary files cannot be previewed");
      cache.set(url, result.text);
      if (cache.size > 16) cache.delete(cache.keys().next().value);
      return result.text;
    }
    function Full({ a, text, close }) {
      return h(
        Page,
        { title: a.filename || a.name, close },
        h(Text, { muted: true }, `${text.split("\n").length} lines \xB7 ${a.size || text.length} bytes`),
        h(
          RN.ScrollView,
          { horizontal: true, style: { maxHeight: 500 } },
          h(Text, { selectable: true, style: { fontFamily: RN.Platform?.OS === "ios" ? "Menlo" : "monospace" } }, text)
        ),
        h(Button, { text: "Copy text", onPress: () => r.copy(text) })
      );
    }
    function Card({ original, a }) {
      const nested = React.useContext(Gate), [text, setText] = React.useState(null), [error, setError] = React.useState(""), [busy, setBusy] = React.useState(false), mounted = React.useRef(true);
      React.useEffect(() => {
        mounted.current = true;
        return () => {
          mounted.current = false;
        };
      }, []);
      React.useEffect(() => {
        if (nested || text != null || busy) return;
        setBusy(true);
        load(a).then((t) => mounted.current && setText(t)).catch((e) => mounted.current && setError(e.message)).finally(() => mounted.current && setBusy(false));
      }, []);
      if (nested) return original;
      const preview = text == null ? h(Text, { muted: true }, busy ? "Loading preview\u2026" : error || "No preview") : h(
        RN.View,
        { style: { padding: 12, gap: 8, borderWidth: 1, borderColor: "#80808060", borderRadius: 8, marginBottom: 8 } },
        h(Text, { selectable: true, numberOfLines: 12, style: { fontFamily: RN.Platform?.OS === "ios" ? "Menlo" : "monospace" } }, text.split("\n").slice(0, 12).join("\n").slice(0, 4e3)),
        h(Button, { text: "Expand file", variant: "secondary", onPress: () => {
          try {
            r.open("file", Full, { a, text });
          } catch (e) {
            r.error("Preview file", e);
          }
        } })
      );
      return h(Gate.Provider, { value: true }, h(RN.View, { style: { gap: 8, paddingVertical: 6 } }, preview, original, error && text == null ? h(Button, { text: "Retry preview", variant: "secondary", onPress: () => {
        setError("");
        setBusy(true);
        load(a).then((t) => setText(t)).catch((e) => setError(e.message)).finally(() => setBusy(false));
      } }) : null));
    }
    function wrap(element) {
      try {
        const a = attachmentFrom(element?.props);
        if (previewable(a) && !element.props?.__mimePreview) return h(Card, { original: r.React.cloneElement(element, { __mimePreview: true }), a });
      } catch {
        return;
      }
    }
    return {
      start() {
        const fetching = /* @__PURE__ */ new Set();
        function snippet(text) {
          return String(text).split("\n").slice(0, 10).join("\n").slice(0, 2e3);
        }
        function consider(message) {
          if (!message) return;
          for (const a of message.attachments || []) {
            const url = a.url || a.proxy_url || a.proxyUrl;
            if (!previewable(a) || !url || cache.has(url) || fetching.has(url)) continue;
            fetching.add(url);
            load(a).then((text) => {
              cache.set(url, text);
              r.common.FluxDispatcher?.dispatch?.({ type: "MESSAGE_UPDATE", message });
            }).catch(() => {
            }).finally(() => fetching.delete(url));
          }
        }
        function inject(node) {
          if (!node || typeof node !== "object") return;
          const attachments = node.attachments || node.message?.attachments;
          if (Array.isArray(attachments)) {
            const blocks = [];
            for (const a of attachments) {
              const url = a.url || a.proxy_url || a.proxyUrl;
              const text = url && cache.get(url);
              if (text) blocks.push({ type: "codeBlock", content: snippet(text), lang: "txt" });
            }
            if (blocks.length) {
              if (Array.isArray(node.content)) node.content = blocks.concat(node.content);
              else if (typeof node.content === "string") node.content = snippet(cache.get(attachments[0].url || attachments[0].proxy_url) || "") + "\n" + node.content;
              else if (node.message && typeof node.message.content === "string") {
                node.message.content = "```\n" + snippet(cache.get(attachments[0].url || attachments[0].proxy_url) || "") + "\n```\n" + node.message.content;
              }
            }
          }
          if (Array.isArray(node)) for (const item of node) inject(item);
          else for (const value of Object.values(node)) if (value && typeof value === "object") inject(value);
        }
        r.subscribe("MESSAGE_CREATE", (event) => consider(event?.message || event));
        r.subscribe("LOAD_MESSAGES_SUCCESS", (event) => {
          for (const message of event?.messages || []) consider(message);
        });
        r.patchRows((rows) => {
          const next = typeof rows === "string" ? JSON.parse(rows) : JSON.parse(JSON.stringify(rows));
          inject(next);
          return typeof rows === "string" ? JSON.stringify(next) : next;
        });
        r.hook(["MessageAttachment", "Attachment", "FileAttachment", "MessageFileAttachment", "MediaAttachment", "AttachmentCard", "MessageAccessories", "File", "DefaultAttachment", "AttachmentContent"], wrap);
        r.patch("after", r.React, "createElement", (args, result) => {
          if (!r.active || !result?.props || result.props.__mimePreview) return;
          const a = attachmentFrom(args[1]) || attachmentFrom(result.props);
          if (previewable(a)) return wrap(result) ?? result;
        });
        r.command({
          name: "previewfile",
          description: "Preview a small Discord text attachment locally",
          options: [{ name: "url", description: "Discord attachment URL", type: 3, required: true }],
          async execute(options) {
            const url = attachmentUrl(String(options.find((o) => o.name === "url")?.value || ""));
            const a = { url, filename: decodeURIComponent(new URL(url).pathname.split("/").pop()), size: 0 };
            const text = await load(a);
            a.size = text.length;
            r.open("file", Full, { a, text });
          }
        });
      },
      stop() {
        cache.clear();
      },
      Settings() {
        return h(Page, { title: "PreviewFile" }, h(Text, null, "Text attachments show a preview above the download card. Limit 256 KB."));
      },
      load
    };
  }

  // PreviewFile.entry.js
  var PreviewFile_entry_default = register({ "id": "mime.previewfile", "name": "PreviewFile", "description": "Expandable previews for supported text attachments.", "version": "2.2.2", "authors": [{ "name": "mafu", "id": "519760564755365888" }, { "name": "Mime | N0_.q3", "id": "957164619061932045" }], "license": "GPL-3.0-or-later", "source": "https://github.com/xMimiez/Snow-Plugins/tree/main/PreviewFile" }, PreviewFile);
  return __toCommonJS(PreviewFile_entry_exports);
})();
