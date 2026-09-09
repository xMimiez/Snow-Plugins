(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // project:src/runtime.js
  function createRuntime(context, meta, defaults = {}) {
    const api = context.api;
    for (const capability of meta.capabilities) if (!api?.[capability]) throw new Error(`${meta.name}: missing Snow ${capability} capability`);
    const host = globalThis.snow;
    if (!host?.metro?.common) throw new Error(`${meta.name}: this Snow build does not expose metro.common`);
    const metro = host.metro;
    const common = metro.common;
    const React = common.React;
    const RN = common.ReactNative;
    if (!React?.createElement || !RN?.View) throw new Error(`${meta.name}: host React/React Native unavailable`);
    const C = common.components || {};
    const cleanups = [];
    const listeners = /* @__PURE__ */ new Set();
    const requests = /* @__PURE__ */ new Set();
    const openSheets = /* @__PURE__ */ new Map();
    let active = true;
    const store = api.storage ? api.storage.createStorage(defaults) : {};
    for (const [key, value] of Object.entries(defaults)) if (store[key] === void 0) store[key] = value;
    const r = {
      context,
      meta,
      api,
      host,
      metro,
      common,
      React,
      RN,
      C,
      h: React.createElement,
      store,
      get active() {
        return active && !context.signal?.aborted;
      },
      status: {},
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
        api.storage?.flush().catch((e) => r.error("Save settings", e));
      },
      find(...props) {
        try {
          return metro.findByProps?.(...props);
        } catch {
          return void 0;
        }
      },
      byName(name, raw = false) {
        try {
          return metro.findByName?.(name, !raw) || metro.findByDisplayName?.(name, !raw);
        } catch {
          return void 0;
        }
      },
      byStore(name) {
        try {
          return metro.findByStoreName?.(name);
        } catch {
          return void 0;
        }
      },
      toast(message) {
        if (r.active) api.ui?.showToast(String(message));
      },
      error(label, error) {
        const text = `${label}: ${error?.message || error}`;
        console.error(`[${meta.name}]`, text);
        r.status.lastError = text;
        r.changed();
        r.toast(text);
      },
      patch(kind, parent, key, callback) {
        if (typeof parent?.[key] !== "function") return false;
        r.own(api.patcher[kind](key, parent, callback));
        return true;
      },
      subscribe(type, callback) {
        return r.own(api.flux.subscribe(type, (payload) => {
          if (r.active) callback(payload);
        }));
      },
      command(command) {
        const execute = command.execute;
        return r.own(api.commands.registerCommand({ ...command, options: command.options || [], async execute(...args) {
          if (!r.active) return;
          try {
            const result = await execute(...args);
            return r.active ? result : void 0;
          } catch (error) {
            if (r.active) r.error(`/${command.name}`, error);
          }
        } }));
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
        context.signal?.addEventListener("abort", abort, { once: true });
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
          context.signal?.removeEventListener("abort", abort);
        }
      },
      async discord(path, options = {}) {
        if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid Discord API path");
        const token = r.find("getToken")?.getToken();
        if (!token) throw new Error("Discord session unavailable");
        return r.request("https://discord.com/api/v9" + path, { ...options, headers: { "Content-Type": "application/json", ...options.headers, Authorization: token } });
      },
      hook(names, transform) {
        const jsx = host.api?.react?.jsx;
        if (!jsx?.onJsxCreate || !jsx?.deleteJsxCreate) throw new Error(`${meta.name}: Snow JSX hooks unavailable`);
        for (const name of names) {
          const callback = (_Component, element) => {
            if (!r.active) return;
            r.status[name] = (r.status[name] || 0) + 1;
            return transform(element, name);
          };
          jsx.onJsxCreate(name, callback);
          r.own(() => jsx.deleteJsxCreate(name, callback));
        }
      },
      open(key, Component, props = {}) {
        const sheets = host.api?.ui?.sheets;
        if (!sheets?.showSheet || !sheets?.hideSheet || !C.ActionSheet) throw new Error("Snow bottom-sheet components unavailable");
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
          constructor() {
            super(...arguments);
            __publicField(this, "state", { error: null });
          }
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
          return r.h(C.ActionSheet, { scrollable: true }, r.h(Boundary, null, r.h(Component, { ...props, close })));
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
        const clip = common.clipboard || r.find("setString");
        if (!clip?.setString) throw new Error("Clipboard unavailable");
        clip.setString(String(text));
        r.toast("Copied");
      },
      dispose() {
        active = false;
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
        return api.storage?.flush();
      }
    };
    return r;
  }
  function ui(r) {
    const { h, C, RN } = r;
    function Text({ children, muted = false, heading = false, ...props }) {
      return C.Text ? h(C.Text, { variant: heading ? "heading-md/semibold" : "text-md/normal", color: muted ? "text-muted" : "text-normal", ...props }, children) : h(RN.Text, props, children);
    }
    function Button({ text, onPress, disabled, variant = "primary", ...props }) {
      return C.Button ? h(C.Button, { text, onPress, disabled, variant, size: "md", ...props }) : h(RN.Pressable || RN.TouchableOpacity, { onPress, disabled, accessibilityRole: "button", style: { padding: 12 } }, h(Text, null, text));
    }
    function Page({ title, children, close }) {
      return h(RN.View, { style: { padding: 16, gap: 12 } }, h(Text, { heading: true }, title), children, close ? h(Button, { text: "Close", variant: "secondary", onPress: close }) : null);
    }
    function Input({ value, onChange, ...props }) {
      return C.TextInput ? h(C.TextInput, { value, onChange, ...props }) : h(RN.TextInput, { value, onChangeText: onChange, ...props });
    }
    function Toggle({ setting, label, subLabel }) {
      return C.TableSwitchRow ? h(C.TableSwitchRow, { label, subLabel, value: !!r.store[setting], onValueChange: (v) => r.set(setting, v) }) : null;
    }
    return { Text, Button, Page, Input, Toggle };
  }
  function register(meta, factory) {
    let runtime;
    let instance;
    globalThis.__snowRegisterPlugin({
      id: meta.id,
      name: meta.name,
      description: meta.description,
      version: meta.version,
      author: meta.authors.map((a) => ({ name: a.name, id: BigInt(a.id || "0") })),
      reload: "plugin",
      dependencies: meta.dependencies || [],
      async start(context) {
        if (runtime) {
          try {
            await instance?.stop?.();
          } finally {
            await runtime.dispose();
          }
        }
        runtime = createRuntime(context, meta, factory.defaults || {});
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
      settings() {
        return instance?.Settings ? runtime.h(instance.Settings) : null;
      },
      health() {
        return !!runtime?.active && !!instance;
      }
    });
  }

  // project:src/plugins/preview-file.js
  var MAX_BYTES = 256 * 1024;
  function previewable(a) {
    return !!a && /\.(txt|md|json|js|jsx|ts|tsx|py|css|html|xml|yml|yaml|csv|log|ini|sh|c|cpp|h|java|rs|go)$/i.test(a.filename || a.name || "") && Number(a.size) <= MAX_BYTES && Number(a.size) >= 0;
  }
  function attachmentUrl(value) {
    const u = new URL(value);
    if (u.protocol !== "https:" || !["cdn.discordapp.com", "media.discordapp.net"].includes(u.hostname) || !u.pathname.startsWith("/attachments/") || u.username || u.password) throw new Error("Only Discord attachment URLs are supported");
    return u.href;
  }
  function PreviewFile(r) {
    const { h, React, RN } = r, { Page, Text, Button } = ui(r), cache = /* @__PURE__ */ new Map(), Gate = React.createContext(false);
    async function load(a) {
      if (!previewable(a)) throw new Error("Unsupported file or file exceeds 256 KB");
      const url = attachmentUrl(a.url || a.proxy_url || a.proxyUrl);
      if (cache.has(url)) return cache.get(url);
      const result = await r.request(url, { headers: { Range: `bytes=0-${MAX_BYTES}` } }, 15e3, MAX_BYTES);
      if (Number(result.response.headers?.get("content-length")) > MAX_BYTES || result.text.length > MAX_BYTES) throw new Error("File exceeds the 256 KB preview limit");
      if (result.text.includes("\0")) throw new Error("Binary files cannot be previewed");
      cache.set(url, result.text);
      if (cache.size > 16) cache.delete(cache.keys().next().value);
      return result.text;
    }
    function Full({ a, text, close }) {
      return h(Page, { title: a.filename || a.name, close }, h(Text, { muted: true }, `${text.split("\n").length} lines \xB7 ${a.size} bytes`), h(RN.ScrollView, { horizontal: true, style: { maxHeight: 500 } }, h(Text, { selectable: true, style: { fontFamily: RN.Platform?.OS === "ios" ? "Menlo" : "monospace" } }, text)), h(Button, { text: "Copy text", onPress: () => r.copy(text) }), h(Button, { text: "Open original", variant: "secondary", onPress: () => RN.Linking.openURL(attachmentUrl(a.url)).catch((e) => r.error("Open file", e)) }));
    }
    function Card({ original, a }) {
      const nested = React.useContext(Gate), [text, setText] = React.useState(null), [error, setError] = React.useState(""), [busy, setBusy] = React.useState(false), mounted = React.useRef(true);
      React.useEffect(() => {
        mounted.current = true;
        return () => {
          mounted.current = false;
        };
      }, []);
      function fetchPreview() {
        if (busy) return;
        setBusy(true);
        setError("");
        load(a).then((t) => mounted.current && setText(t)).catch((e) => mounted.current && setError(e.message)).finally(() => mounted.current && setBusy(false));
      }
      if (nested) return original;
      return h(Gate.Provider, { value: true }, h(
        RN.View,
        { style: { gap: 8, paddingVertical: 6 } },
        original,
        text === null ? h(Button, { text: busy ? "Loading preview\u2026" : error ? "Retry preview" : "Preview file", variant: "secondary", disabled: busy, onPress: fetchPreview }) : h(RN.View, { style: { padding: 12, gap: 8, borderWidth: 1, borderColor: "#80808060", borderRadius: 8 } }, h(Text, { selectable: true, numberOfLines: 8, style: { fontFamily: RN.Platform?.OS === "ios" ? "Menlo" : "monospace" } }, text.split("\n").slice(0, 8).join("\n").slice(0, 2e3)), h(Button, { text: "Expand file", variant: "secondary", onPress: () => {
          try {
            r.open("file", Full, { a, text });
          } catch (e) {
            r.error("Preview file", e);
          }
        } })),
        error ? h(Text, null, error) : null
      ));
    }
    return { start() {
      r.hook(["MessageAttachment", "Attachment", "FileAttachment", "MessageFileAttachment"], (element) => {
        const a = element?.props?.attachment;
        if (previewable(a)) return h(Card, { original: element, a });
      });
      r.command({ name: "previewfile", description: "Preview a small Discord text attachment locally", options: [{ name: "url", description: "Discord attachment URL", type: 3, required: true }], async execute(options) {
        const url = attachmentUrl(String(options.find((o) => o.name === "url")?.value || ""));
        const a = { url, filename: decodeURIComponent(new URL(url).pathname.split("/").pop()), size: 0 };
        const text = await load(a);
        a.size = typeof TextEncoder === "function" ? new TextEncoder().encode(text).length : text.length;
        r.open("file", Full, { a, text });
      } });
    }, stop() {
      cache.clear();
    }, Settings() {
      return h(Page, { title: "PreviewFile" }, h(Text, null, "Text attachments keep their download card and gain an expandable text preview. Tap to load; limit 256 KB. If this build uses native-only attachment rows, use /previewfile with the attachment URL."));
    }, load };
  }

  // PreviewFile.entry.js
  register({ "id": "mime.previewfile", "name": "PreviewFile", "description": "Expandable previews for supported text attachments.", "version": "2.0.0", "authors": [{ "name": "mafu", "id": "519760564755365888" }, { "name": "Mime | N0_.q3", "id": "957164619061932045" }], "license": "GPL-3.0-or-later", "source": "https://github.com/xMimiez/Snow-Plugins/tree/main/PreviewFile", "capabilities": ["commands", "ui"], "dependencies": [] }, PreviewFile);
})();
