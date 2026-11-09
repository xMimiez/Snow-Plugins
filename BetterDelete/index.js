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

  // BetterDelete.entry.js
  var BetterDelete_entry_exports = {};
  __export(BetterDelete_entry_exports, {
    default: () => BetterDelete_entry_default
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
          return r.h(ActionSheet, { scrollable: options.scrollable ?? true }, r.h(Boundary, null, r.h(Component, { ...props, close })));
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

  // project:src/plugins/better-delete.js
  var QUICK = /^(edit message|reply|forward)$/i;
  var DELETE = /^(delete|delete message)$/i;
  function rowText(node) {
    const chunks = [];
    const visit = (value, depth) => {
      if (depth > 8 || value == null || value === false || typeof value === "function") return;
      if (typeof value === "string" || typeof value === "number") {
        chunks.push(String(value));
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((entry) => visit(entry, depth + 1));
        return;
      }
      if (typeof value === "object") {
        if (value.props) visit(value.props.children, depth + 1);
        visit(value.message, depth + 1);
        visit(value.content, depth + 1);
        visit(value.defaultMessage, depth + 1);
        if (!value.props) {
          visit(value.label, depth + 1);
          visit(value.text, depth + 1);
        }
      }
    };
    const props = node?.props || {};
    visit(props.label, 0);
    visit(props.title, 0);
    visit(props.accessibilityLabel, 0);
    visit(props.children, 0);
    return chunks.join(" ").replace(/\s+/g, " ").trim();
  }
  function labelId(node) {
    const label = node?.props?.label || node?.props?.accessibilityLabel;
    const id = label?.id || label?.key;
    return id ? String(id).toUpperCase() : "";
  }
  function isQuickRow(node) {
    const id = labelId(node);
    if (/EDIT_MESSAGE|MESSAGE_REPLY|^REPLY$|FORWARD/.test(id)) return true;
    return QUICK.test(rowText(node));
  }
  function isPlainDeleteRow(node) {
    if (!isActionRow(node)) return false;
    const id = labelId(node);
    if (/HIDE|LOGGER|BETTER|SILENT/.test(id)) return false;
    if (id === "DELETE" || id === "DELETE_MESSAGE" || id === "MESSAGE_DELETE") return true;
    return DELETE.test(rowText(node));
  }
  function isActionRow(node) {
    if (!node || typeof node !== "object" || !node.props) return false;
    const type = node.type;
    const name = type?.displayName || type?.name || type?.type?.displayName || type?.type?.name || "";
    if (name === "ButtonRow" || name === "ActionSheetRow" || name === "FormRow" || name === "ContextMenuRow") return true;
    if (typeof node.props.onPress !== "function" && typeof node.props.action !== "function") return false;
    const id = labelId(node);
    return QUICK.test(rowText(node)) || DELETE.test(rowText(node)) || /^SILENT DELETE MESSAGE$/i.test(rowText(node)) || /EDIT_MESSAGE|REPLY|FORWARD|DELETE/.test(id);
  }
  function childList(children) {
    if (children == null || children === false) return [];
    return Array.isArray(children) ? children : [children];
  }
  function relabel(React, row, key, label, onPress, clearIcon) {
    const props = {
      key,
      label,
      title: label,
      accessibilityLabel: label,
      onPress
    };
    if (clearIcon) {
      props.icon = null;
      props.leading = null;
      props.IconComponent = null;
      props.children = label;
    } else if (typeof row.props.children === "string" || typeof row.props.children === "number") {
      props.children = label;
    } else if (row.props.children != null) {
      props.children = replaceMenuText(React, row.props.children, label);
    }
    return React.cloneElement(row, props);
  }
  function replaceMenuText(React, node, label) {
    if (typeof node === "string" || typeof node === "number") {
      const text = String(node).trim();
      return DELETE.test(text) || QUICK.test(text) ? label : node;
    }
    if (Array.isArray(node)) return node.map((child) => replaceMenuText(React, child, label));
    if (!React.isValidElement(node) || node.props?.children == null) return node;
    const children = replaceMenuText(React, node.props.children, label);
    if (children === node.props.children) return node;
    return React.cloneElement(node, { children });
  }
  function stripDeletes(React, node, captured) {
    if (isPlainDeleteRow(node)) {
      captured.push(node);
      return null;
    }
    if (Array.isArray(node)) {
      let changed2 = false;
      const next = [];
      for (const child of node) {
        const walked = stripDeletes(React, child, captured);
        if (walked !== child) changed2 = true;
        if (walked != null) next.push(walked);
      }
      return changed2 ? next : node;
    }
    if (!React.isValidElement(node) || node.props == null) return node;
    let changed = false;
    const props = {};
    for (const key of Object.keys(node.props)) {
      const value = node.props[key];
      if (value == null) continue;
      if (key !== "children" && !Array.isArray(value) && !React.isValidElement(value)) continue;
      const mapped = stripDeletes(React, value, captured);
      if (mapped !== value) {
        props[key] = mapped;
        changed = true;
      }
    }
    if (!changed) return node;
    const children = Object.prototype.hasOwnProperty.call(props, "children") ? props.children : node.props.children;
    const original = childList(node.props.children);
    const remaining = childList(children).filter((child) => child != null);
    if (original.length && original.every(isActionRow) && !remaining.length) return null;
    return React.cloneElement(node, props);
  }
  function spliceActions(React, rows, captured, options) {
    const presentDelete = rows.some(isPlainDeleteRow);
    const presentBetter = rows.some((row) => row?.key === "mime-silent-delete" || row?.props?.key === "mime-silent-delete" || /^silent delete message$/i.test(rowText(row)));
    const additions = [];
    if (!presentDelete && captured[0]) additions.push(captured[0]);
    else if (!presentDelete && options.canDelete && options.onDelete) {
      const sample = rows.find(isActionRow);
      if (sample) additions.push(relabel(React, sample, "mime-delete", "Delete Message", options.onDelete, true));
    }
    if (options.showBetter && !presentBetter && options.onBetter) {
      const template = captured[0] || rows.find(isActionRow);
      if (template) additions.push(relabel(React, template, "mime-silent-delete", "Silent Delete Message", options.onBetter, !captured[0]));
    }
    if (!additions.length) return rows;
    let anchor = -1;
    rows.forEach((row, index) => {
      if (isQuickRow(row)) anchor = index;
    });
    const copy = rows.slice();
    copy.splice(anchor + 1, 0, ...additions);
    return copy;
  }
  function insertActions(React, node, captured, options, want, state) {
    if (node == null || isActionRow(node)) return node;
    if (Array.isArray(node)) {
      let nested = false;
      const walked = node.map((child) => {
        const next = insertActions(React, child, captured, options, want, state);
        if (next !== child) nested = true;
        return next;
      });
      if (nested || state.done) return nested ? walked : node;
      const rows = walked.filter(isActionRow);
      if (!rows.length) return walked.some((child, index) => child !== node[index]) ? walked : node;
      if (want === "quick" && !rows.some(isQuickRow)) return walked.some((child, index) => child !== node[index]) ? walked : node;
      state.done = true;
      return spliceActions(React, walked, captured, options);
    }
    if (!React.isValidElement(node) || node.props == null) return node;
    let changed = false;
    const props = {};
    for (const key of Object.keys(node.props)) {
      const value = node.props[key];
      if (value == null) continue;
      if (key !== "children" && !Array.isArray(value) && !React.isValidElement(value)) continue;
      const mapped = insertActions(React, value, captured, options, want, state);
      if (mapped !== value) {
        props[key] = mapped;
        changed = true;
      }
    }
    return changed ? React.cloneElement(node, props) : node;
  }
  function placeMessageActions(React, tree, options) {
    const captured = [];
    const stripped = stripDeletes(React, tree, captured);
    const quick = { done: false };
    const withQuick = insertActions(React, stripped, captured, options, "quick", quick);
    if (quick.done) return withQuick;
    return insertActions(React, withQuick, captured, options, "first", { done: false });
  }
  function messageActions(r) {
    return r.find("deleteMessage", "_sendMessage") || r.find("deleteMessage", "sendMessage") || r.find("deleteMessage", "startEditMessage") || r.find("deleteMessage");
  }
  function myId(r) {
    const users = r.byStore("UserStore");
    const auth = r.byStore("AuthenticationStore");
    return users?.getCurrentUser?.()?.id || auth?.getId?.() || r.find("getCurrentUser")?.getCurrentUser?.()?.id || null;
  }
  function isOwnMessage(r, message) {
    const me = myId(r);
    const author = message?.author?.id || message?.authorId;
    return !!me && author === me && message?.deleted !== true;
  }
  function replacementText(value) {
    const text = String(value ?? "").trim();
    return (text || "redacted eh").slice(0, 2e3);
  }
  function sentMessageId(sent) {
    const value = sent?.id || sent?.message?.id || sent?.body?.id || sent?.body?.message?.id;
    return value == null ? "" : String(value);
  }
  function missingHttp(error) {
    return /unavailable|Invalid Discord API path/i.test(String(error?.message || error || ""));
  }
  function alreadyGone(error) {
    return error?.status === 404 || /unknown message/i.test(String(error?.message || error?.body?.message || ""));
  }
  async function deleteOnServer(api, discord, channelId, id) {
    let clientOk = false;
    let clientError;
    if (typeof api?.deleteMessage === "function") {
      try {
        await api.deleteMessage(channelId, id);
        clientOk = true;
      } catch (error) {
        if (alreadyGone(error)) clientOk = true;
        else clientError = error;
      }
    }
    let restOk = false;
    if (typeof discord === "function") {
      try {
        await discord(`/channels/${channelId}/messages/${id}`, { method: "DELETE" });
        restOk = true;
      } catch (error) {
        if (alreadyGone(error)) restOk = true;
        else if (!missingHttp(error) && !clientOk) throw error;
      }
    }
    if (!clientOk && !restOk) throw clientError || new Error("Delete is unavailable");
  }
  async function sendReplacement(api, discord, channelId, payload, messageId) {
    if (typeof api?._sendMessage === "function") return api._sendMessage(channelId, payload, { nonce: messageId });
    if (typeof api?.sendMessage === "function") return api.sendMessage(channelId, { ...payload, nonce: messageId }, true, { nonce: messageId });
    if (typeof discord === "function") {
      const result = await discord(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ ...payload, nonce: messageId }) });
      return typeof result?.json === "function" ? result.json() : result;
    }
    throw new Error("Replacement send is unavailable");
  }
  async function findSentId(discord, channelId, messageId, text) {
    if (typeof discord !== "function") return "";
    try {
      const result = await discord(`/channels/${channelId}/messages?limit=10`);
      const list = typeof result?.json === "function" ? result.json() : result;
      const rows = Array.isArray(list) ? list : [];
      const hit = rows.find((row) => String(row?.nonce || "") === String(messageId)) || rows.find((row) => row?.content === text);
      return hit?.id == null ? "" : String(hit.id);
    } catch (error) {
      if (missingHttp(error)) return "";
      return "";
    }
  }
  async function runBetterDelete(api, discord, channelId, messageId, content) {
    const text = replacementText(content);
    const payload = { content: text, tts: false, invalidEmojis: [], validNonShortcutEmojis: [] };
    await deleteOnServer(api, discord, channelId, messageId);
    const sent = await sendReplacement(api, discord, channelId, payload, messageId);
    const followId = sentMessageId(sent) || await findSentId(discord, channelId, messageId, text) || messageId;
    await deleteOnServer(api, discord, channelId, followId);
    return text;
  }
  function patchMessageSheet(r, transform) {
    const sheets = r.find("openLazy", "hideActionSheet");
    if (!sheets || !r.api.patcher?.before) return false;
    return r.patch("before", sheets, "openLazy", (args) => {
      const [pending, key] = args;
      if (key !== "MessageLongPressActionSheet" || !pending?.then) return;
      args[0] = pending.then((module) => {
        if (!r.active || typeof module?.default !== "function" || module.default.prototype?.isReactComponent) return module;
        const Original = module.default;
        function WithDeleteActions(screenProps) {
          const tree = Original(screenProps);
          if (!r.active) return tree;
          const message = screenProps?.message;
          try {
            return transform(tree, message, () => sheets.hideActionSheet()) ?? tree;
          } catch (error) {
            r.error("Message menu", error);
            return tree;
          }
        }
        return { ...module, default: WithDeleteActions };
      });
    });
  }
  function BetterDelete(r) {
    const { h } = r;
    const { Page, Text, Toggle, Input } = ui(r);
    const busy = /* @__PURE__ */ new Set();
    async function hide(message) {
      const channelId = String(message?.channel_id || message?.channelId || "");
      const messageId = String(message?.id || "");
      if (!/^\d{5,}$/.test(channelId) || !/^\d{5,}$/.test(messageId)) throw new Error("This message cannot be deleted");
      if (busy.has(messageId)) return;
      busy.add(messageId);
      try {
        await runBetterDelete(messageActions(r), r.discord.bind(r), channelId, messageId, r.store.replacement);
      } finally {
        busy.delete(messageId);
      }
    }
    async function remove(message) {
      const channelId = String(message?.channel_id || message?.channelId || "");
      const messageId = String(message?.id || "");
      const api = messageActions(r);
      if (typeof api?.deleteMessage === "function") {
        await api.deleteMessage(channelId, messageId);
        return;
      }
      await r.discord(`/channels/${channelId}/messages/${messageId}`, { method: "DELETE" });
    }
    return {
      Settings() {
        r.useRefresh();
        return h(
          Page,
          { title: "Silent Delete" },
          h(Toggle, {
            setting: "enabled",
            label: "Silent Delete",
            subLabel: "Sends the replacement with the same nonce so other message loggers keep it, then deletes that message."
          }),
          h(Input, {
            label: "Replacement message",
            value: r.store.replacement,
            onChange: (value) => r.set("replacement", String(value).slice(0, 2e3))
          }),
          h(Text, { muted: true }, "Delete and Silent Delete Message are placed in the Edit, Reply, and Forward group. Silent Delete only appears on your own messages and deletes immediately. Might not be safe; use at your own risk.")
        );
      },
      start() {
        const patched = patchMessageSheet(r, (tree, message, hideSheet) => {
          const own = isOwnMessage(r, message);
          const press = (action) => () => {
            try {
              hideSheet();
            } catch {
            }
            Promise.resolve().then(action).catch((error) => {
              if (r.active) r.error("Silent Delete", error);
            });
          };
          return placeMessageActions(r.React, tree, {
            showBetter: !!r.store.enabled && own,
            canDelete: own,
            onBetter: press(() => hide(message)),
            onDelete: press(() => remove(message))
          });
        });
        r.status.messageMenu = patched ? "patched" : "unavailable";
      }
    };
  }
  BetterDelete.defaults = { enabled: true, replacement: "redacted eh" };

  // BetterDelete.entry.js
  var BetterDelete_entry_default = register({ "id": "mime.betterdelete", "name": "Silent Delete", "description": "Puts Delete and Silent Delete Message in the Edit, Reply, and Forward group. Silent Delete hides your message from other message loggers.", "version": "1.0.2", "authors": [{ "name": "Vendicated", "id": "343383572805058560" }, { "name": "Mime | N0_.q3", "id": "957164619061932045" }], "license": "GPL-3.0-or-later", "source": "https://github.com/xMimiez/Snow-Plugins/tree/main/BetterDelete" }, BetterDelete);
  return __toCommonJS(BetterDelete_entry_exports);
})();
