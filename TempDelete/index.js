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

  // TempDelete.entry.js
  var TempDelete_entry_exports = {};
  __export(TempDelete_entry_exports, {
    default: () => TempDelete_entry_default
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

  // project:src/plugins/temp-delete.js
  var QUICK = /^(edit message|reply|forward)$/i;
  var DELETE = /^(delete|delete message)$/i;
  var CONTAINER = /ActionSheet|Modal|Navigator|FlashList|FlatList|SectionList|ScrollView|^(Chat|Channel|Guild|Screen|Home|Page)(Screen|View|Page)?$/i;
  function componentName(type) {
    if (!type || typeof type === "string") return "";
    return type.displayName || type.name || type.type?.displayName || type.type?.name || "";
  }
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
  function messageIdOf(message) {
    const id = message?.id ?? message?.messageId ?? message?.message_id;
    if (id == null || id === "") return "";
    return String(id);
  }
  function messageLike(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (value.author || value.author_id || value.authorId) return true;
    if (typeof value.content === "string") return true;
    if (Array.isArray(value.attachments) || Array.isArray(value.embeds)) return true;
    return false;
  }
  function isTempDeleteRow(node) {
    if (!node || typeof node !== "object") return false;
    if (node.key === "mime-temp-delete" || node.props?.key === "mime-temp-delete") return true;
    return /^temp delete$/i.test(rowText(node));
  }
  function isPlainDeleteRow(node) {
    if (!node?.props || isTempDeleteRow(node)) return false;
    const id = labelId(node);
    if (/HIDE|LOGGER|BETTER|SILENT|TEMP/.test(id)) return false;
    if (id === "DELETE" || id === "DELETE_MESSAGE" || id === "MESSAGE_DELETE") return true;
    return DELETE.test(rowText(node));
  }
  function isQuickRow(node) {
    const id = labelId(node);
    if (/EDIT_MESSAGE|MESSAGE_REPLY|^REPLY$|FORWARD/.test(id)) return true;
    return QUICK.test(rowText(node));
  }
  function isActionRow(node) {
    if (!node?.props) return false;
    const name = componentName(node.type);
    if (name === "ButtonRow" || name === "ActionSheetRow" || name === "FormRow" || name === "ContextMenuRow") return true;
    if (typeof node.props.onPress !== "function" && typeof node.props.action !== "function") return false;
    return isQuickRow(node) || isPlainDeleteRow(node) || isTempDeleteRow(node);
  }
  function findNode(node, pred, depth = 0) {
    if (depth > 14 || node == null) return null;
    if (pred(node)) return node;
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = findNode(child, pred, depth + 1);
        if (found) return found;
      }
      return null;
    }
    const children = node?.props?.children;
    return children == null ? null : findNode(children, pred, depth + 1);
  }
  function insertAt(React, node, row, mode, state, depth = 0) {
    if (state.done || depth > 14 || node == null) return node;
    if (Array.isArray(node)) {
      let changed2 = false;
      const mapped = [];
      for (const child of node) {
        if (state.done) {
          mapped.push(child);
          continue;
        }
        const next = insertAt(React, child, row, mode, state, depth + 1);
        if (next !== child) changed2 = true;
        mapped.push(next);
      }
      if (state.done) return changed2 ? mapped : node;
      if (mode === "delete") {
        const index = mapped.findIndex(isPlainDeleteRow);
        if (index >= 0) {
          state.done = true;
          const copy = mapped.slice();
          copy.splice(index + 1, 0, row);
          return copy;
        }
      }
      if (mode === "quick") {
        let anchor = -1;
        mapped.forEach((child, index) => {
          if (isQuickRow(child)) anchor = index;
        });
        if (anchor >= 0) {
          state.done = true;
          const copy = mapped.slice();
          copy.splice(anchor + 1, 0, row);
          return copy;
        }
      }
      if (mode === "first" && mapped.some(isActionRow)) {
        state.done = true;
        return mapped.concat(row);
      }
      return changed2 ? mapped : node;
    }
    if (!React.isValidElement(node) || node.props == null) return node;
    let changed = false;
    const props = {};
    for (const key of Object.keys(node.props)) {
      const value = node.props[key];
      if (value == null) continue;
      const single = key === "children" && !Array.isArray(value) && React.isValidElement(value);
      if (!single && !Array.isArray(value) && !React.isValidElement(value)) continue;
      const target = single ? [value] : value;
      const next = insertAt(React, target, row, mode, state, depth + 1);
      if (next !== target) {
        props[key] = next;
        changed = true;
      }
    }
    return changed ? React.cloneElement(node, props) : node;
  }
  function ClockIcon(props) {
    const React = ClockIcon.React;
    const RN = ClockIcon.RN || {};
    const color = props?.color || props?.fill || "#F23F43";
    const size = Number(props?.size || props?.width || props?.height) || 24;
    const Svg = RN.Svg;
    const Circle = RN.Circle;
    const Path = RN.Path;
    if (React && Svg && Circle && Path) {
      return React.createElement(
        Svg,
        { width: size, height: size, viewBox: "0 0 24 24" },
        React.createElement(Circle, { cx: "12", cy: "12", r: "8", stroke: color, strokeWidth: "2", fill: "none" }),
        React.createElement(Path, { d: "M12 8.5V12l2.5 1.5", stroke: color, strokeWidth: "2", fill: "none", strokeLinecap: "round" })
      );
    }
    if (!React) return null;
    return React.createElement(RN.Text || "Text", {
      accessibilityLabel: "Clock",
      style: { color, fontSize: Math.max(16, Math.round(size * 0.85)), lineHeight: size, width: size, textAlign: "center" }
    }, "\u25F7");
  }
  ClockIcon.displayName = "ClockIcon";
  function clockProp(React, current) {
    const Icon = clockProp.Icon || ClockIcon;
    if (typeof current === "function") return Icon;
    if (current && typeof current === "object") return React.createElement(Icon, { color: "#F23F43", size: 24 });
    return Icon;
  }
  function placeTempDelete(React, tree, onPress) {
    if (!tree || typeof onPress !== "function" || findNode(tree, isTempDeleteRow)) return tree;
    const sample = findNode(tree, isPlainDeleteRow) || findNode(tree, isActionRow);
    if (!sample?.type) return tree;
    const row = React.cloneElement(sample, {
      key: "mime-temp-delete",
      label: "Temp Delete",
      title: "Temp Delete",
      accessibilityLabel: "Temp Delete",
      onPress,
      icon: clockProp(React, sample.props?.icon),
      Icon: clockProp.Icon || ClockIcon,
      IconComponent: clockProp.Icon || ClockIcon,
      leading: clockProp(React, sample.props?.leading ?? sample.props?.icon),
      variant: "danger",
      destructive: true,
      danger: true,
      color: "text-danger"
    });
    const state = { done: false };
    const withDelete = insertAt(React, tree, row, "delete", state);
    if (state.done) return withDelete;
    const withQuick = insertAt(React, withDelete, row, "quick", state);
    if (state.done) return withQuick;
    const withFirst = insertAt(React, withQuick, row, "first", state);
    return state.done ? withFirst : tree;
  }
  function recordId(item) {
    if (!item || typeof item !== "object") return "";
    if (messageLike(item)) return messageIdOf(item);
    if (item.message && messageLike(item.message)) return messageIdOf(item.message);
    return "";
  }
  function filterBucket(bucket, hidden) {
    if (!bucket || !hidden?.size) return bucket;
    const keep = (list) => list.filter((item) => {
      const id = recordId(item);
      return !id || !hidden.has(id);
    });
    if (Array.isArray(bucket)) {
      const next2 = keep(bucket);
      return next2.length === bucket.length ? bucket : next2;
    }
    const key = Array.isArray(bucket._array) ? "_array" : Array.isArray(bucket.messages) ? "messages" : "";
    if (!key) return bucket;
    const next = keep(bucket[key]);
    if (next.length === bucket[key].length) return bucket;
    const copy = Object.assign(Object.create(Object.getPrototypeOf(bucket)), bucket);
    copy[key] = next;
    return copy;
  }
  function dropStoredMessage(bucket, id) {
    const list = Array.isArray(bucket) ? bucket : Array.isArray(bucket?._array) ? bucket._array : Array.isArray(bucket?.messages) ? bucket.messages : null;
    if (!list) return false;
    const index = list.findIndex((item) => recordId(item) === id);
    if (index < 0) return false;
    list.splice(index, 1);
    return true;
  }
  function isHiddenRecord(value, hidden) {
    if (!value || typeof value !== "object" || !hidden?.size) return false;
    if (messageLike(value) && hidden.has(messageIdOf(value))) return true;
    if (value.message && messageLike(value.message) && hidden.has(messageIdOf(value.message))) return true;
    return false;
  }
  function stripHiddenRows(rows, hidden) {
    if (!hidden?.size || rows == null) return rows;
    const walk = (value, depth) => {
      if (depth > 8 || value == null) return value;
      if (Array.isArray(value)) {
        let changed = false;
        const next = [];
        for (const item of value) {
          const child = walk(item, depth + 1);
          if (child == null) {
            changed = true;
            continue;
          }
          if (child !== item) changed = true;
          next.push(child);
        }
        return changed ? next : value;
      }
      if (typeof value !== "object") return value;
      return isHiddenRecord(value, hidden) ? null : value;
    };
    return walk(rows, 0);
  }
  function isHiddenMessageElement(element, hidden) {
    if (!element?.props || !hidden?.size) return false;
    const name = componentName(element.type);
    if (name && CONTAINER.test(name)) return false;
    const props = element.props;
    const candidates = [props.message, props.item];
    for (const item of candidates) {
      if (messageLike(item) && hidden.has(messageIdOf(item))) return true;
    }
    return false;
  }
  function channelIdOf(message) {
    const value = message?.channel_id || message?.channelId || message?.getChannelId?.() || "";
    return value == null ? "" : String(value);
  }
  function TempDelete(r) {
    const { h } = r;
    const { Page, Text } = ui(r);
    const hidden = /* @__PURE__ */ new Set();
    const refreshRows = [];
    let rawGetMessages = null;
    let messageStore = null;
    function hide(message) {
      const id = messageIdOf(message);
      if (!id || !r.active) return;
      hidden.add(id);
      const channelId = channelIdOf(message);
      if (rawGetMessages && channelId) {
        try {
          const bucket = rawGetMessages(channelId);
          dropStoredMessage(bucket, id);
          bucket?.remove?.(id);
          bucket?._map?.delete?.(id);
        } catch (error) {
          r.error("Temp Delete", error);
        }
      }
      try {
        const payload = { type: "MESSAGE_DELETE", id, channelId, messageId: id, mlDeleted: true };
        const guildId = message?.guild_id || message?.guildId;
        if (guildId) payload.guildId = guildId;
        r.common?.FluxDispatcher?.dispatch?.(payload);
      } catch (error) {
        r.error("Temp Delete", error);
      }
      try {
        messageStore?.emitChange?.();
      } catch (error) {
        r.error("Temp Delete", error);
      }
      for (const refresh of refreshRows) {
        try {
          refresh();
        } catch (error) {
          r.error("Temp Delete", error);
        }
      }
    }
    return {
      hide,
      Settings() {
        return h(
          Page,
          { title: "Temp Delete" },
          h(Text, null, "Temp Delete sits under Delete Message on every message, including messages you did not send."),
          h(Text, { muted: true }, "The message is removed on this device only. It comes back the next time Discord starts. Nothing is deleted on Discord\u2019s servers.")
        );
      },
      start() {
        ClockIcon.React = r.React;
        let text;
        try {
          text = r.RN?.Text;
        } catch {
          text = void 0;
        }
        ClockIcon.RN = { Text: text };
        const svg = r.find("Svg", "Path", "Circle") || r.find("Svg", "Path");
        if (svg?.Svg) ClockIcon.RN = { Text: text, Svg: svg.Svg, Circle: svg.Circle, Path: svg.Path };
        const icons = r.find("ClockIcon", "TrashIcon") || r.find("ClockIcon");
        if (typeof icons?.ClockIcon === "function") clockProp.Icon = icons.ClockIcon;
        messageStore = r.byStore("MessageStore") || r.find("getMessages", "getMessage") || r.find("getMessages");
        if (typeof messageStore?.getMessages === "function") rawGetMessages = messageStore.getMessages.bind(messageStore);
        if (messageStore && rawGetMessages) {
          r.patch("after", messageStore, "getMessages", (_args, result) => {
            if (!r.active) return;
            const next = filterBucket(result, hidden);
            return next === result ? void 0 : next;
          });
        }
        if (messageStore && typeof messageStore.getMessage === "function") {
          r.patch("instead", messageStore, "getMessage", (args, original) => {
            const result = original(...args);
            if (!r.active || !result) return result;
            return hidden.has(messageIdOf(result)) ? void 0 : result;
          });
        }
        r.patchRows((rows) => stripHiddenRows(rows, hidden));
        let moduleKeys = [];
        try {
          moduleKeys = Object.keys(r.RN?.NativeModules || {});
        } catch {
          moduleKeys = [];
        }
        for (const key of moduleKeys) {
          if (key === "PushNotificationIOS" || key === "NativeEventEmitter") continue;
          let native;
          try {
            native = r.RN.NativeModules[key];
          } catch {
            continue;
          }
          if (typeof native?.updateRows !== "function") continue;
          let lastId;
          let lastRows;
          r.patch("after", native, "updateRows", (args) => {
            lastId = args?.[0];
            lastRows = args?.[1];
          });
          refreshRows.push(() => {
            if (lastRows == null) return;
            native.updateRows(lastId, lastRows);
          });
        }
        r.patch("after", r.React, "createElement", (_args, result) => {
          if (!r.active || !isHiddenMessageElement(result, hidden)) return;
          return false;
        });
        const sheets = r.find("openLazy", "hideActionSheet");
        const patched = !!(sheets && r.patch("before", sheets, "openLazy", (args) => {
          const pending = args?.[0];
          const key = args?.find((value) => typeof value === "string" && /MessageLongPress/i.test(value));
          if (!key || !pending?.then) return;
          args[0] = pending.then((module) => {
            if (!r.active || typeof module?.default !== "function" || module.default.prototype?.isReactComponent) return module;
            const Original = module.default;
            function WithTempDelete(screenProps) {
              const tree = Original(screenProps);
              if (!r.active) return tree;
              const message = screenProps?.message;
              const press = () => {
                try {
                  sheets.hideActionSheet?.();
                } catch {
                }
                Promise.resolve().then(() => {
                  if (r.active) hide(message);
                }).catch((error) => {
                  if (r.active) r.error("Temp Delete", error);
                });
              };
              try {
                return placeTempDelete(r.React, tree, press) ?? tree;
              } catch (error) {
                r.error("Temp Delete", error);
                return tree;
              }
            }
            return { ...module, default: WithTempDelete };
          });
        }));
        r.status.messageMenu = patched ? "patched" : "unavailable";
      }
    };
  }

  // TempDelete.entry.js
  var TempDelete_entry_default = register({ "id": "mime.tempdelete", "name": "Temp Delete", "description": "Hides a message on this device until Discord restarts.", "version": "1.0.3", "authors": [{ "name": "Mime | N0_.q3", "id": "957164619061932045" }], "license": "MIT", "source": "https://github.com/xMimiez/Snow-Plugins/tree/main/TempDelete" }, TempDelete);
  return __toCommonJS(TempDelete_entry_exports);
})();
