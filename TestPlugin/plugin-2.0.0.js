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

  // project:src/test-math.js
  function add(a, b) {
    return Number(a) + Number(b);
  }

  // project:src/plugins/test-plugin.js
  function TestPlugin(r) {
    const { h, React, RN, C } = r, { Page, Text, Button } = ui(r);
    let report = ["Native Snow API v1", "Bundled sibling module: 2 + 3 = " + add(2, 3)], busy = false;
    async function run() {
      if (busy) return;
      busy = true;
      r.changed();
      const lines = [`${r.meta.name} ${r.meta.version} \xB7 Snow`, `Bundled module import: ${add(2, 3) === 5 ? "PASS" : "FAIL"}`];
      try {
        r.set("runs", (Number(r.store.runs) || 0) + 1);
        await r.api.storage.flush();
        lines.push("Storage flush: PASS \xB7 run " + r.store.runs);
        const target = { add(a, b) {
          return a + b;
        } };
        const unpatch = r.api.patcher.after("add", target, (_args, value) => value + 1);
        try {
          lines.push("Scoped patch: " + (target.add(2, 3) === 6 ? "PASS" : "FAIL"));
        } finally {
          unpatch();
        }
        lines.push("Patch cleanup: " + (target.add(2, 3) === 5 ? "PASS" : "FAIL"));
        for (const file of ["data.json", "extra.js", "lib/math.js"]) {
          try {
            const data = await r.request("https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/TestPlugin/" + file);
            if (file === "data.json") data.json();
            lines.push(`${file}: fetched ${data.text.length} characters (not evaluated)`);
          } catch (e) {
            lines.push(`${file}: ${e.message}`);
          }
        }
        for (const name of ["UserStore", "ChannelStore", "PresenceStore", "ReadStateStore"]) lines.push(`${name}: ${r.byStore(name) ? "available" : "unavailable"}`);
        lines.push("Native CSS injection: unavailable in React Native. Use the isolated WebView CSS test.");
        lines.push("Version suffix comes from the native loader. Remove the old Bunny install and install this native manifest; no host version text is patched.");
      } catch (e) {
        lines.push("Test error: " + e.message);
      } finally {
        report = lines;
        busy = false;
        if (r.active) r.changed();
      }
    }
    function CssTest({ close }) {
      const WebView = r.find("WebView")?.WebView || r.byName("WebView");
      return h(Page, { title: "Isolated CSS test", close }, WebView ? h(WebView, { originWhitelist: ["about:blank"], javaScriptEnabled: false, onShouldStartLoadWithRequest: (req) => req.url === "about:blank", source: { html: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#202127;color:#eee;font:18px system-ui;padding:24px}.card{border:2px solid #8892ff;border-radius:16px;padding:24px}</style><div class="card">Snow WebView CSS works. This style is isolated from Discord.</div>' }, style: { height: 240 } }) : h(Text, null, "WebView unavailable"));
    }
    function alert() {
      if (!C.AlertModal || !C.AlertActions || !C.AlertActionButton) return r.toast("Native alert components unavailable");
      r.api.ui.openAlert("test", h(C.AlertModal, { title: "Snow alert test", content: "This alert is owned by TestPlugin and is dismissed when the plugin stops.", actions: h(C.AlertActions, null, h(C.AlertActionButton, { text: "Close", onPress: () => r.api.ui.dismissAlert("test") })) }));
    }
    function Settings({ close }) {
      r.useRefresh();
      return h(Page, { title: "TestPlugin \xB7 Snow", close }, h(Button, { text: busy ? "Running\u2026" : "Run compatibility checks", disabled: busy, onPress: run }), h(Button, { text: "Test native alert", variant: "secondary", onPress: alert }), h(Button, { text: "Test sheet and WebView CSS", variant: "secondary", onPress: () => {
        try {
          r.open("css", CssTest);
        } catch (e) {
          r.error("CSS test", e);
        }
      } }), h(Button, { text: "Copy report", variant: "secondary", onPress: () => r.copy(report.join("\n")) }), h(Text, { selectable: true }, report.join("\n")));
    }
    return { start() {
      r.command({ name: "testplugin", description: "Open native Snow compatibility checks", execute() {
        r.open("diagnostics", Settings);
      } });
    }, Settings, run };
  }
  TestPlugin.defaults = { runs: 0 };

  // TestPlugin.entry.js
  register({ "id": "mime.testplugin", "name": "TestPlugin", "description": "Native Snow compatibility checks, sibling files, popups and isolated WebView CSS.", "version": "2.0.0", "authors": [{ "name": "Mime | N0_.q3", "id": "957164619061932045" }], "license": "MIT", "source": "https://github.com/xMimiez/Snow-Plugins/tree/main/TestPlugin", "capabilities": ["commands", "patcher", "storage", "ui"], "dependencies": [] }, TestPlugin);
})();
