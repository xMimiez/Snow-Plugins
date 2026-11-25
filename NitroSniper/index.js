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

  // NitroSniper.entry.js
  var NitroSniper_entry_exports = {};
  __export(NitroSniper_entry_exports, {
    default: () => NitroSniper_entry_default
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
    const initial = JSON.parse(JSON.stringify(defaults));
    const store = B.plugin?.createStorage ? B.plugin.createStorage(initial) : initial;
    for (const [key, value] of Object.entries(initial)) if (store[key] === void 0) store[key] = value;
    const alerts = /* @__PURE__ */ new Set();
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
        ui: {
          ...B.ui,
          openAlert(id, element) {
            if (!r.active) return;
            alerts.add(id);
            return B.ui.openAlert(id, element);
          },
          dismissAlert(id) {
            alerts.delete(id);
            return B.ui.dismissAlert(id);
          }
        }
      },
      own(fn) {
        if (typeof fn === "function") cleanups.push(fn);
        return fn;
      },
      changed() {
        for (const fn of listeners) fn();
      },
      useRefresh() {
        B.plugin?.useProxy?.(store);
        const [, bump] = React.useState(0);
        React.useEffect(() => {
          if (!r.active) return;
          const fn = () => bump((n) => n + 1);
          listeners.add(fn);
          return () => listeners.delete(fn);
        }, []);
        return () => r.changed();
      },
      set(key, value) {
        if (!r.active) return;
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
      local(channelId, content) {
        if (!r.active) return false;
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
        const name = command.name;
        const execute = command.execute;
        const prepared = {
          ...command,
          name,
          options: (command.options || []).map((opt) => ({ ...opt })),
          async execute(args, ctx) {
            if (!r.active) return;
            try {
              const result = await execute(args, ctx);
              if (!r.active) return;
              return result;
            } catch (error) {
              if (r.active) r.error(`/${name}`, error);
            }
          }
        };
        return r.own(register2(prepared));
      },
      wait(ms) {
        if (!r.active) return Promise.reject(new Error("Plugin stopped"));
        return new Promise((resolve, reject) => {
          const finish = () => {
            clearTimeout(timer);
            control.signal.removeEventListener("abort", abort);
          };
          const abort = () => {
            finish();
            reject(new Error("Plugin stopped"));
          };
          const timer = setTimeout(() => {
            finish();
            resolve();
          }, ms);
          control.signal.addEventListener("abort", abort, { once: true });
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
        if (!r.active) throw new Error("Plugin stopped");
        const found = r.find("HTTP", "get", "post", "put", "patch", "del") || r.find("get", "post", "put", "del");
        const client = found?.HTTP || found;
        const method = (options.method || "GET").toLowerCase().replace(/^delete$/, "del");
        if (typeof client?.[method] !== "function") throw new Error("Discord HTTP client unavailable");
        try {
          const response = await client[method]({ url: path, ...options.body != null ? { body: typeof options.body === "string" ? JSON.parse(options.body) : options.body } : {} });
          if (!r.active) throw new Error("Plugin stopped");
          if (response?.status >= 400) throw Object.assign(new Error(response.body?.message || `HTTP ${response.status}`), { status: response.status, body: response.body });
          return { response, json() {
            return response?.body ?? null;
          } };
        } catch (cause) {
          const error = new Error(cause?.body?.message || cause?.message || "Discord request failed");
          error.status = cause?.status;
          error.retryAfter = Number(cause?.body?.retry_after) || 0;
          throw error;
        }
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
      open(key, Component, props = {}, options = {}) {
        if (!r.active) throw new Error("Plugin stopped");
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
          return r.h(ActionSheet, { scrollable: options.scrollable ?? true, startHeight: options.height }, r.h(Boundary, null, r.h(Component, { ...props, close })));
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
        if (!r.active) return;
        const clip = r.common.clipboard || r.find("setString");
        if (!clip?.setString) throw new Error("Clipboard unavailable");
        clip.setString(String(text));
        r.toast("Copied");
      },
      dispose() {
        active = false;
        control.abort();
        for (const id of alerts) {
          try {
            B.ui?.dismissAlert?.(id);
          } catch (e) {
            console.error(`[${meta.name}] alert cleanup`, e?.message);
          }
        }
        alerts.clear();
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
        r.changed();
        listeners.clear();
        return r.api.storage.flush();
      }
    };
    return r;
  }
  function ui(r) {
    const { h, RN, store } = r;
    const colors = { background: "#111214", surface: "#1E1F22", surfacePressed: "#26272B", border: "#2B2D31", text: "#F2F3F5", muted: "#B5BAC1", accent: "#5865F2", danger: "#F23F43" };
    const palette = { "text-danger": colors.danger, "text-warning": "#FEE75C", "text-muted": colors.muted, "text-normal": colors.text };
    function Text({ children, muted = false, heading = false, color, style, ...props }) {
      const resolved = palette[color] || (muted ? colors.muted : colors.text);
      const base = heading ? { color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: "600", marginLeft: 4, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 } : { color: resolved, fontSize: muted ? 13 : 16, lineHeight: muted ? 18 : 21, fontWeight: muted ? "400" : "600" };
      return h(RN.Text, { ...props, style: [base, style] }, children);
    }
    function Button({ text, onPress, disabled, variant = "primary", ...props }) {
      const primary = variant !== "secondary";
      return h(RN.Pressable || RN.TouchableOpacity, {
        ...props,
        accessibilityRole: "button",
        accessibilityLabel: text,
        accessibilityState: { disabled: !!disabled },
        disabled: !!disabled,
        onPress,
        style: ({ pressed } = {}) => ({
          minHeight: 48,
          borderRadius: 12,
          paddingHorizontal: 16,
          backgroundColor: primary ? pressed ? "#4752C4" : colors.accent : pressed ? colors.surfacePressed : colors.surface,
          borderWidth: primary ? 0 : 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.5 : 1
        })
      }, h(RN.Text, { style: { color: primary ? "#FFFFFF" : colors.muted, fontSize: 16, lineHeight: 20, fontWeight: "700" } }, text));
    }
    function Input({ value, onChange, label, secureTextEntry, style, ...props }) {
      const field = h(RN.TextInput, {
        ...props,
        value: value == null ? "" : String(value),
        onChangeText: onChange,
        secureTextEntry: !!secureTextEntry,
        placeholderTextColor: "#6D6F78",
        autoCorrect: false,
        selectionColor: colors.accent,
        style: [{ minHeight: 50, color: colors.text, fontSize: 16, lineHeight: 21, backgroundColor: "#151619", borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12 }, style]
      });
      if (!label) return field;
      return h(
        RN.View,
        { style: { gap: 8 } },
        h(RN.Text, { style: { color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: "600", marginLeft: 4 } }, label),
        field
      );
    }
    function Toggle({ setting, label, subLabel }) {
      r.useRefresh();
      return h(
        RN.View,
        { style: { minHeight: 72, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 } },
        h(
          RN.View,
          { style: { flex: 1 } },
          h(RN.Text, { style: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "600", marginBottom: subLabel ? 3 : 0 } }, label),
          subLabel ? h(RN.Text, { style: { color: colors.muted, fontSize: 14, lineHeight: 19 } }, subLabel) : null
        ),
        h(RN.Switch, {
          accessibilityLabel: label,
          value: !!store[setting],
          onValueChange: (value) => r.set(setting, value),
          trackColor: { false: "#3F4147", true: colors.accent },
          thumbColor: "#FFFFFF",
          ios_backgroundColor: "#3F4147"
        })
      );
    }
    function Slider({ value, onValueChange, ...props }) {
      return h(Input, {
        ...props,
        value: String(value),
        onChange: (text) => {
          const next = Number(text);
          onValueChange(Number.isFinite(next) ? next : 0);
        },
        keyboardType: "numeric"
      });
    }
    function card(rows) {
      return h(RN.View, { style: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: "hidden" } }, ...rows);
    }
    function Page({ title, children, close }) {
      const items = [];
      const walk = (value) => {
        if (value == null || value === false) return;
        if (Array.isArray(value)) {
          value.forEach(walk);
          return;
        }
        items.push(value);
      };
      walk(children);
      const blocks = [];
      let toggles = [];
      const flush = () => {
        if (!toggles.length) return;
        const rows = [];
        toggles.forEach((node, index) => {
          if (index) rows.push(h(RN.View, { key: "divider-" + index, style: { height: 1, backgroundColor: colors.border, marginLeft: 16 } }));
          rows.push(node);
        });
        blocks.push(card(rows));
        toggles = [];
      };
      for (const child of items) {
        if (child.type === Toggle) {
          toggles.push(child);
          continue;
        }
        flush();
        if (child.type === Input) {
          blocks.push(card([h(RN.View, { key: "field", style: { padding: 14 } }, child)]));
          continue;
        }
        blocks.push(child);
      }
      flush();
      const body = [];
      if (title) body.push(h(RN.Text, { key: "title", accessibilityRole: "header", style: { color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: "600", marginLeft: 4, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 } }, title));
      blocks.forEach((block, index) => {
        if (body.length && !(title && index === 0)) body.push(h(RN.View, { key: "gap-" + index, style: { height: 22 } }));
        body.push(block);
      });
      if (close) {
        if (body.length) body.push(h(RN.View, { key: "gap-close", style: { height: 22 } }));
        body.push(h(Button, { key: "close", text: "Close", variant: "secondary", onPress: close }));
      }
      return h(RN.ScrollView, {
        style: { flex: 1, backgroundColor: colors.background },
        contentContainerStyle: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 36 },
        keyboardShouldPersistTaps: "handled",
        showsVerticalScrollIndicator: false
      }, ...body);
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

  // project:src/plugins/captcha.js
  function captchaErrorInfo(e) {
    const body = e?.body || {};
    if (body.captcha_required || body.captcha_service || body.captcha_sitekey) {
      return {
        service: body.captcha_service || "hcaptcha",
        sitekey: body.captcha_sitekey || body.captcha_site_key || null,
        rqtoken: body.captcha_rqtoken || body.captcha_rq_token || null
      };
    }
    return null;
  }
  var CAPTCHA_HTML = [
    '<!DOCTYPE html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<script src="https://js.hcaptcha.com/1/api.js?render=explicit" onload="window.__apiReady=true"></script>',
    '</head><body style="margin:0">',
    '<div id="box" style="position:fixed;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center"></div>',
    "<script>",
    "var widgetId = null, rqdata = null;",
    "function post(type, data) {",
    "  var payload = Object.assign({ type: type }, data || {});",
    "  try { window.ReactNativeWebView.postMessage(JSON.stringify(payload)); } catch (e) {}",
    "}",
    'post("ready", { apiReady: !!window.__apiReady });',
    "window.solveCaptcha = function (sk, rq) {",
    "  try {",
    "    rqdata = rq || null;",
    "    if (window.hcaptcha && window.hcaptcha.setRqdata && rqdata) { try { hcaptcha.setRqdata(rqdata); } catch (e) {} }",
    "    if (widgetId !== null) { try { hcaptcha.reset(widgetId); } catch (e) {} }",
    "    else {",
    "      var opts = {",
    "        sitekey: sk,",
    '        size: "invisible",',
    '        callback: function (token) { post("token", { token: token }); },',
    '        "error-callback": function (err) { post("error", { message: String(err) }); },',
    '        "expired-callback": function () { post("error", { message: "captcha expired" }); },',
    '        "chalexpired-callback": function () { post("error", { message: "challenge expired" }); },',
    '        "open-callback": function () { post("challenge_opened", {}); },',
    '        "close-callback": function () { post("challenge_closed", {}); }',
    "      };",
    "      if (rqdata) opts.rqdata = rqdata;",
    '      widgetId = hcaptcha.render("box", opts);',
    "    }",
    "    hcaptcha.execute(widgetId);",
    '  } catch (e) { post("error", { message: String(e && e.message || e) }); }',
    "};",
    "</script></body></html>"
  ].join("");
  var DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
  var SOLVER_TIMEOUT = 6e4;
  var MAX_AUTO_RETRY = 3;
  function createCaptchaSolver(r, React) {
    const WebView = r.find("WebView")?.WebView || r.byName("WebView");
    let sheetClose = null;
    let pending = null;
    let requestId = 0;
    let epoch = 0;
    function closeSheet() {
      if (!sheetClose) return;
      const close = sheetClose;
      sheetClose = null;
      try {
        close();
      } catch {
      }
    }
    function mountHost() {
      if (sheetClose || !React) return;
      try {
        sheetClose = r.open("captcha", function CaptchaHost() {
          return element() || null;
        }, {}, { scrollable: false });
      } catch {
        sheetClose = null;
      }
    }
    async function solveViaEndpoint(sitekey) {
      const url = String(r.store.captchaSolverUrl || "").trim();
      if (!url) return null;
      const res = await r.request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sitekey, pageurl: "https://discord.com" })
      }, 12e4);
      const body = res.json();
      const token = body?.token || body?.solution?.token || body?.request || null;
      if (!token || typeof token !== "string") throw new Error("solver endpoint returned no token");
      return token;
    }
    function solve(sitekey, rqtoken) {
      return new Promise((resolvePromise, rejectPromise) => {
        const p = { pending: true, resolvePromise, rejectPromise, sitekey, rqtoken: rqtoken || null, id: ++requestId };
        const settle = (ok, value) => {
          if (p.pending) {
            p.pending = false;
            ok ? p.resolvePromise(value) : p.rejectPromise(value);
          }
        };
        solveViaEndpoint(sitekey).then((token) => {
          if (token) {
            settle(true, token);
            r.changed();
          } else startWidget();
        }).catch(() => startWidget());
        function startWidget() {
          if (!p.pending) return;
          if (!WebView) {
            settle(false, new Error("WebView unavailable in this Snow build"));
            return;
          }
          pending = p;
          epoch++;
          p.retries = 0;
          mountHost();
          if (!sheetClose) {
            settle(false, new Error("captcha sheet unavailable in this Snow build"));
            return;
          }
          r.changed();
          setTimeout(() => {
            if (pending === p && p.pending) {
              pending = null;
              closeSheet();
              settle(false, new Error("captcha solve timed out (widget did not return a token in 60s)"));
              r.changed();
            }
          }, SOLVER_TIMEOUT);
        }
      });
    }
    function handleMessage(data) {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      const current = pending;
      if (!current || !current.pending) return;
      if (msg.type === "token") {
        pending = null;
        closeSheet();
        current.pending = false;
        current.resolvePromise(String(msg.token));
        r.changed();
      } else if (msg.type === "error") {
        if (current.retries < MAX_AUTO_RETRY) {
          current.retries++;
          epoch++;
          r.changed();
          return;
        }
        pending = null;
        closeSheet();
        current.pending = false;
        current.rejectPromise(new Error(`captcha widget: ${msg.message || "unknown error"}`));
        r.changed();
      } else if (msg.type === "challenge_opened") {
        r.toast("hCaptcha needs one tap \u2014 finish the puzzle on screen", "ShieldIcon");
        r.changed();
      }
    }
    function element() {
      if (!pending || !pending.pending || !WebView || !React) return null;
      const sitekey = String(pending.sitekey || "");
      const rq = pending.rqtoken ? JSON.stringify(pending.rqtoken) : "null";
      const inject = "if (window.solveCaptcha) { window.solveCaptcha(" + JSON.stringify(sitekey) + ", " + rq + "); } else { setTimeout(function () { window.solveCaptcha && window.solveCaptcha(" + JSON.stringify(sitekey) + ", " + rq + "); }, 1500); }";
      return React.createElement(WebView, {
        key: `captcha-${pending.id}-${epoch}`,
        source: { html: CAPTCHA_HTML, baseUrl: "https://discord.com" },
        originWhitelist: ["*"],
        javaScriptEnabled: true,
        domStorageEnabled: true,
        // Desktop UA makes hCaptcha serve the invisible desktop flow instead
        // of the mobile TouchUI interstitial, so execute() can pass passively.
        userAgent: DESKTOP_UA,
        applicationUserAgent: DESKTOP_UA,
        style: { height: "100%", width: "100%" },
        injectedJavaScript: inject,
        onMessage: (event) => handleMessage(event?.nativeEvent?.data)
      });
    }
    function dispose() {
      closeSheet();
      if (pending && pending.pending) {
        pending.pending = false;
        pending.rejectPromise(new Error("captcha solver disposed"));
      }
      pending = null;
    }
    return { solve, element, handleMessage, isPending: () => !!(pending && pending.pending), dispose };
  }

  // project:src/plugins/nitro-sniper.js
  function giftCodes(text) {
    return [...new Set(Array.from(String(text || "").matchAll(/(?:https?:\/\/)?(?:www\.)?(?:discord\.gift\/|discord(?:app)?\.com\/gifts\/)([A-Za-z0-9]{16,24})(?![A-Za-z0-9])/g), (m) => m[1]))];
  }
  function webhookUrl(value) {
    if (!String(value || "").trim()) return null;
    const u = new URL(String(value).trim());
    if (u.protocol !== "https:" || !["discord.com", "canary.discord.com", "ptb.discord.com"].includes(u.hostname) || !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[\w-]+\/?$/.test(u.pathname) || u.username || u.password) throw new Error("Use a Discord HTTPS webhook URL");
    return u.href;
  }
  function NitroSniper(r) {
    const { h, React } = r, { Page, Text, Button, Input, Toggle } = ui(r);
    const solver = createCaptchaSolver(r, React);
    const seen = /* @__PURE__ */ new Map(), queue = [];
    let running = false, stopped = false, started = Date.now(), waitTimer, releaseWait;
    const SHEET_RE = /^(CaptchaModal|GiftCodeRedeemModal)$/;
    const BUTTON_RE = /^(BaseTextButton|BaseButton|Pressable)$/;
    const GIFT_HANDLER_RE = /^(redeemGiftCode|handleRedeem(?:GiftCode)?|handleAccept(?:Gift)?|handleConfirm)$/i;
    const GIFT_LABEL_RE = /^(accept(?: gift)?|redeem(?: gift)?|claim(?: gift)?|get nitro|confirm)$/i;
    function elementText(node, depth = 0) {
      if (node == null || depth > 6) return "";
      if (typeof node === "string" || typeof node === "number") return String(node);
      if (Array.isArray(node)) return node.map((n) => elementText(n, depth + 1)).join("");
      if (typeof node === "object" && node.props) {
        const p = node.props;
        const own = typeof p?.text === "string" ? p.text : typeof p?.accessibilityLabel === "string" ? p.accessibilityLabel : typeof p?.label === "string" ? p.label : "";
        return own + " " + elementText(p?.children, depth + 1);
      }
      return "";
    }
    r.patch("after", React, "createElement", (args, result) => {
      if (!r.active || stopped) return result;
      const type = args && args[0];
      const name = componentName(type);
      if (SHEET_RE.test(name)) {
        console.log("[NitroSniper] createElement saw", name);
        armAutoPress(3e5);
      }
      return result;
    });
    function findProp(target, key) {
      try {
        const d = Object.getOwnPropertyDescriptor(target, key);
        return d && "value" in d ? d.value : void 0;
      } catch {
        return void 0;
      }
    }
    function componentName(type) {
      for (let wrappers = 0; type && wrappers < 4; wrappers++) {
        if (typeof type === "string") return type;
        const name = findProp(type, "displayName") || findProp(type, "name");
        if (typeof name === "string" && name) return name;
        if (typeof type !== "object") break;
        type = findProp(type, "type") ?? findProp(type, "render");
      }
      return "";
    }
    function walkSheets(visitSheet, visitButton) {
      const hook = findProp(findProp(globalThis, "__REACT_DEVTOOLS__"), "hook") ?? findProp(globalThis, "__REACT_DEVTOOLS_GLOBAL_HOOK__");
      const registry = findProp(hook, "renderers");
      const getFiberRoots = findProp(hook, "getFiberRoots");
      const stats2 = { hook: !!hook, renderers: registry instanceof Map ? registry.size : 0, roots: 0, fibers: 0, depth: 0 };
      if (typeof getFiberRoots !== "function" || !(registry instanceof Map)) return stats2;
      const stack = [];
      for (const [id] of Map.prototype.entries.call(registry)) {
        let roots;
        try {
          roots = Reflect.apply(getFiberRoots, hook, [id]);
        } catch {
          continue;
        }
        if (!(roots instanceof Set)) continue;
        for (const root of Set.prototype.values.call(roots)) {
          stack.push({ fiber: findProp(root, "current") ?? root, depth: 0 });
          stats2.roots++;
        }
      }
      const seen2 = /* @__PURE__ */ new Set();
      while (stack.length) {
        let { fiber, sheet, depth } = stack.pop();
        if (!fiber || typeof fiber !== "object" || seen2.has(fiber)) continue;
        seen2.add(fiber);
        stats2.fibers++;
        stats2.depth = Math.max(stats2.depth, depth);
        const sibling = findProp(fiber, "sibling");
        if (sibling) stack.push({ fiber: sibling, sheet, depth });
        if (findProp(fiber, "tag") === 22 && findProp(fiber, "memoizedState") != null) continue;
        const resolvedName = componentName(findProp(fiber, "type"));
        const name = SHEET_RE.test(resolvedName) || BUTTON_RE.test(resolvedName) ? resolvedName : componentName(findProp(fiber, "elementType")) || resolvedName;
        if (SHEET_RE.test(name)) {
          sheet = { fiber, name, depth };
          visitSheet(sheet);
        }
        if (sheet) {
          const props = findProp(fiber, "memoizedProps");
          if (typeof props?.onPress === "function") visitButton(sheet, name, props, depth);
        }
        const child = findProp(fiber, "child");
        if (child) stack.push({ fiber: child, sheet, depth: depth + 1 });
      }
      return stats2;
    }
    function scanReport() {
      const sheets = [], handlers = [];
      const stats2 = walkSheets(
        ({ name, depth }) => sheets.push(`${name}@d${depth}`),
        (sheet, name, props, depth) => {
          if (handlers.length < 24) handlers.push(`${sheet.name}: ${name || "Anonymous"}@d${depth}: ${props.onPress.name || "(anonymous)"}`);
        }
      );
      return [
        `devtools hook: ${stats2.hook ? "yes" : "NO"}`,
        `renderers: ${stats2.renderers}; roots: ${stats2.roots}; fibers walked: ${stats2.fibers}; max depth: ${stats2.depth}`,
        `sheets: ${sheets.join(", ") || "none"}`,
        `onPress in sheets: ${handlers.join(", ") || "none"}`
      ].join("\n");
    }
    const pressedSheets = /* @__PURE__ */ new WeakSet(), loggedSheets = /* @__PURE__ */ new WeakSet();
    const loggedHandlers = /* @__PURE__ */ new WeakMap();
    function markSheet(set, fiber) {
      set.add(fiber);
      const alternate = findProp(fiber, "alternate");
      if (alternate) set.add(alternate);
    }
    function scanAndPress() {
      const candidates = [];
      const disabledHandlers = /* @__PURE__ */ new Map();
      const stats2 = walkSheets(
        (sheet2) => {
          if (loggedSheets.has(sheet2.fiber)) return;
          markSheet(loggedSheets, sheet2.fiber);
          console.log("[NitroSniper] fiber scan: entered", sheet2.name, "subtree at depth", sheet2.depth);
        },
        (sheet2, name, props, depth) => {
          if (pressedSheets.has(sheet2.fiber) || pressedSheets.has(findProp(sheet2.fiber, "alternate"))) return;
          const handler2 = String(props.onPress.name || "(anonymous)");
          let logged = loggedHandlers.get(sheet2.fiber) ?? loggedHandlers.get(findProp(sheet2.fiber, "alternate"));
          if (!logged) {
            logged = /* @__PURE__ */ new Set();
            loggedHandlers.set(sheet2.fiber, logged);
          }
          const key = `${name}:${handler2}`;
          if (logged.size < 16 && !logged.has(key)) {
            logged.add(key);
            console.log("[NitroSniper] fiber in sheet has onPress:", handler2, "fiber:", name || "Anonymous", "depth:", depth);
          }
          if (!BUTTON_RE.test(name)) return;
          const press2 = props.onPress;
          if (props.disabled || props.loading || props.submitting || props.accessibilityState?.disabled) {
            let handlers = disabledHandlers.get(sheet2);
            if (!handlers) {
              handlers = /* @__PURE__ */ new Set();
              disabledHandlers.set(sheet2, handlers);
            }
            handlers.add(press2);
            return;
          }
          const knownHandler = sheet2.name === "CaptchaModal" ? handler2 === "handleShowCaptcha" : GIFT_HANDLER_RE.test(handler2);
          const label2 = elementText({ props }).trim();
          if (!knownHandler && (sheet2.name !== "GiftCodeRedeemModal" || !GIFT_LABEL_RE.test(label2))) return;
          candidates.push({ sheet: sheet2, handler: handler2, label: label2, press: press2, rank: (knownHandler ? 2 : 0) + (name === "BaseTextButton" ? 1 : 0) });
        }
      );
      let best;
      for (const candidate of candidates) {
        if (disabledHandlers.get(candidate.sheet)?.has(candidate.press)) continue;
        if (!best || candidate.rank > best.rank) best = candidate;
      }
      if (!best || stopped || !r.active) return { ...stats2, pressed: false };
      const { sheet, handler, label, press } = best;
      markSheet(pressedSheets, sheet.fiber);
      const message = `Pressing "${(label || "confirm").slice(0, 40)}"\u2026`;
      console.log("[NitroSniper]", message, sheet.name, handler);
      try {
        const result = press({ nativeEvent: {}, currentTarget: null });
        console.log("[NitroSniper] invoked", handler, "in", sheet.name);
        if (result && typeof result.then === "function") {
          Promise.resolve(result).catch((e) => console.log("[NitroSniper] press rejected:", handler, String(e)));
        }
      } catch (e) {
        console.log("[NitroSniper] press failed:", handler, String(e));
        return { ...stats2, pressed: false };
      }
      r.toast(message, "ShieldIcon");
      return { ...stats2, pressed: true };
    }
    let armedUntil = 0, sweeps = 0;
    let scanTimer;
    function stopScan() {
      if (scanTimer != null) clearTimeout(scanTimer);
      scanTimer = void 0;
    }
    function startScan(delay) {
      if (scanTimer != null || !r.active || stopped || Date.now() >= armedUntil) return;
      scanTimer = setTimeout(() => {
        scanTimer = void 0;
        if (!r.active || stopped || Date.now() >= armedUntil) return;
        try {
          const { pressed, roots, fibers, depth } = scanAndPress();
          if (pressed || sweeps < 4) console.log("[NitroSniper] fiber sweep", sweeps, "pressed:", pressed, "roots:", roots, "fibers:", fibers, "max depth:", depth);
        } catch (e) {
          if (sweeps < 3) r.error("Fiber scan", e);
        }
        sweeps++;
        startScan(1e3);
      }, delay);
    }
    function armAutoPress(ms = 6e4) {
      armedUntil = Math.max(armedUntil, Date.now() + ms);
      sweeps = 0;
      console.log("[NitroSniper] armed autoPress for", ms, "ms");
      startScan(350);
    }
    r.own(stopScan);
    function redeemViaActions(actions, code) {
      if (typeof actions?.redeemGiftCode !== "function") return Promise.resolve(null);
      return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error("native redeem timed out"));
          }
        }, 2e4);
        const done = (ok) => (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (ok) resolve();
          else {
            const e = value instanceof Error ? value : new Error(value?.message || "native redeem failed");
            if (value && typeof value === "object") e.body = value.body || value;
            reject(e);
          }
        };
        try {
          actions.redeemGiftCode({ code, onRedeemed: done(true), onError: done(false) });
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          if (/not a function|undefined|null/.test(err.message)) resolve(null);
          else {
            settled = true;
            clearTimeout(timer);
            reject(err);
          }
        }
      });
    }
    const stats = { queued: 0, claimed: 0, failed: 0, lastResult: "Waiting for new gift links" };
    function wait(ms) {
      return new Promise((resolve) => {
        releaseWait = resolve;
        waitTimer = setTimeout(resolve, ms);
      });
    }
    async function webhook(payload) {
      const url = webhookUrl(r.store.webhookUrl);
      if (url) await r.request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "NitroSniper", allowed_mentions: { parse: [] }, ...payload }) });
    }
    async function drain() {
      if (running) return;
      running = true;
      try {
        while (queue.length && r.active && !stopped) {
          const item = queue.shift();
          let success = false, result = "", giftType;
          r.toast("Claiming gift\u2026", "GiftIcon");
          armAutoPress();
          try {
            let nativeCap = null;
            const nativeActions = r.find("redeemGiftCode");
            if (typeof nativeActions?.redeemGiftCode === "function") {
              try {
                const native = await redeemViaActions(nativeActions, item.code);
                if (native !== null) {
                  success = true;
                  result = "Gift claimed (native)";
                }
              } catch (nativeError) {
                nativeCap = captchaErrorInfo(nativeError);
                if (!nativeCap && nativeError?.status !== 429 && !/timed out/.test(nativeError?.message || "")) throw nativeError;
              }
            }
            if (!success) {
              let captchaKey, captchaRqtoken;
              armAutoPress();
              for (let attempt = 0; ; attempt++) {
                try {
                  const payload = { channel_id: item.channelId || null };
                  if (captchaKey) {
                    payload.captcha_key = captchaKey;
                    if (captchaRqtoken) payload.captcha_rqtoken = captchaRqtoken;
                  }
                  await r.discord(`/entitlements/gift-codes/${item.code}/redeem`, { method: "POST", body: JSON.stringify(payload) });
                  break;
                } catch (e) {
                  const cap = !captchaKey && (captchaErrorInfo(e) || nativeCap);
                  if (cap && cap.sitekey && cap.service === "hcaptcha") {
                    r.toast("Solving captcha\u2026", "ShieldIcon");
                    stats.lastResult = "Solving hCaptcha\u2026";
                    r.changed();
                    const token = await solver.solve(cap.sitekey, cap.rqtoken);
                    captchaKey = token;
                    captchaRqtoken = cap.rqtoken;
                    armAutoPress();
                    attempt--;
                    continue;
                  }
                  if (e.status !== 429 || attempt >= 2 || e.retryAfter <= 0 || e.retryAfter > 120) throw e;
                  stats.lastResult = `Rate limited; retrying in ${Math.ceil(e.retryAfter)}s`;
                  r.changed();
                  await wait(e.retryAfter * 1e3 + 100);
                  armAutoPress();
                  if (stopped || !r.active) return;
                }
              }
              success = true;
              result = "Gift claimed";
            }
          } catch (e) {
            result = `Claim failed: ${e.message}`;
          }
          if (stopped || !r.active) return;
          stats[success ? "claimed" : "failed"]++;
          stats.lastResult = result;
          r.changed();
          r.toast(result, success ? "NitroWheelIcon" : "CircleXIcon");
          if (r.store.webhookUrl) {
            try {
              try {
                const resolved = (await r.discord(`/entitlements/gift-codes/${item.code}?with_application=false&with_subscription_plan=true`)).json();
                giftType = resolved?.subscription_plan?.name || resolved?.store_listing?.sku?.name;
              } catch {
              }
              if (!r.active || stopped) return;
              const fields = [];
              if (giftType) fields.push({ name: "Gift type", value: String(giftType).slice(0, 1024) });
              if (item.authorId) fields.push({ name: "Sent by", value: `[${String(item.authorName || item.authorId).replace(/[\[\]\\]/g, "")}](https://discord.com/users/${item.authorId})` });
              if (item.channelId && item.messageId) fields.push({ name: "Message", value: `https://discord.com/channels/${item.guildId || "@me"}/${item.channelId}/${item.messageId}` });
              await webhook({ embeds: [{ title: result.slice(0, 256), color: success ? 4437377 : 15746887, fields, timestamp: (/* @__PURE__ */ new Date()).toISOString() }] });
            } catch (e) {
              if (r.active) r.error("Webhook delivery failed", e);
            }
          }
        }
      } finally {
        running = false;
      }
    }
    function receive(event) {
      const m = event?.message;
      if (!m || stopped || event.optimistic || event.isPushNotification) return;
      const timestamp = m.timestamp ? new Date(m.timestamp).getTime() : Number(BigInt(m.id || "0") >> 22n) + 14200704e5;
      if (!Number.isFinite(timestamp) || timestamp < started) return;
      const self = r.byStore("UserStore")?.getCurrentUser?.()?.id;
      if (r.store.ignoreOwnGiftLinks && m.author?.id === self) return;
      for (const code of giftCodes(m.content)) {
        if (seen.has(code)) continue;
        seen.set(code, Date.now());
        if (seen.size > 4096) seen.delete(seen.keys().next().value ?? "");
        if (queue.length >= 100) {
          stats.lastResult = "Queue full; skipped gift";
          r.changed();
          continue;
        }
        queue.push({ code, channelId: m.channel_id || m.channelId, guildId: m.guild_id || m.guildId, messageId: m.id, authorId: m.author?.id, authorName: m.author?.globalName || m.author?.global_name || m.author?.username });
        stats.queued++;
      }
      r.changed();
      void drain().catch((e) => r.active && r.error("Gift queue", e));
    }
    function Settings() {
      r.useRefresh();
      const [url, setUrl] = React.useState(r.store.webhookUrl || "");
      return h(
        Page,
        { title: "NitroSniper" },
        h(Toggle, { setting: "ignoreOwnGiftLinks", label: "Ignore my gift links" }),
        h(Text, null, `Queued ${stats.queued} \xB7 Claimed ${stats.claimed} \xB7 Failed ${stats.failed}`),
        h(Text, null, stats.lastResult),
        h(Input, { label: "Optional result webhook", value: url, onChange: setUrl, secureTextEntry: true, autoCapitalize: "none" }),
        h(Button, { text: "Save webhook", onPress: async () => {
          try {
            webhookUrl(url);
            r.set("webhookUrl", url.trim());
            await r.api.storage.flush();
            r.toast("Saved");
          } catch (e) {
            r.error("Webhook", e);
          }
        } }),
        h(Button, { text: "Send test webhook", variant: "secondary", onPress: () => webhook({ content: "NitroSniper Snow webhook test" }).then(() => r.toast(r.store.webhookUrl ? "Test sent" : "Set a webhook first")).catch((e) => r.error("Webhook test", e)) }),
        h(Text, { muted: true }, "Claim cycle: claim link, auto-press the Accept and human-verification Confirm buttons, solve hCaptcha, and toast each result. Only new live messages are processed.")
      );
    }
    return { start() {
      started = Date.now();
      r.subscribe("MESSAGE_CREATE", (e) => {
        try {
          receive(e);
        } catch (err) {
          r.error("Message handler", err);
        }
      });
      try {
        console.log("[NitroSniper] start: arming fiber scanner for stuck sheet");
        armAutoPress(3e5);
      } catch (e) {
        console.log("[NitroSniper] start arm failed", String(e));
      }
      try {
        r.command({ name: "nitrosniper-test", description: "Arm the confirm-button scanner and report fiber findings", async execute() {
          armAutoPress(3e5);
          await new Promise((res) => {
            setTimeout(() => res(), 1600);
          });
          const found = scanReport();
          return `Scanner armed.
${found}`;
        } });
      } catch (e) {
        r.error("Command registration", e);
      }
    }, stop() {
      stopped = true;
      solver.dispose();
      queue.length = 0;
      clearTimeout(waitTimer);
      releaseWait?.();
    }, Settings, receive, stats };
  }
  NitroSniper.defaults = { ignoreOwnGiftLinks: false, webhookUrl: "" };
  var nitro_sniper_default = NitroSniper;

  // NitroSniper.entry.js
  var NitroSniper_entry_default = register({ "id": "mime.nitrosniper", "name": "NitroSniper", "description": "Process new gift links with a deduplicated queue, visible results, automated Accept/Confirm-button press (including the human-verification sheet) and hCaptcha solving.", "version": "3.0.0", "authors": [{ "name": "neoarz", "id": "218675193592283137" }, { "name": "Mime | N0_.q3", "id": "957164619061932045" }], "license": "MIT", "source": "https://github.com/xMimiez/Snow-Plugins/tree/main/NitroSniper" }, nitro_sniper_default);
  return __toCommonJS(NitroSniper_entry_exports);
})();
