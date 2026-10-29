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

  // NightyTab.entry.js
  var NightyTab_entry_exports = {};
  __export(NightyTab_entry_exports, {
    default: () => NightyTab_entry_default
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
    const { h, C, D, RN, store } = r;
    function Text({ children, muted = false, heading = false, color, ...props }) {
      const Comp = D.Text || C.Text;
      if (Comp) return h(Comp, { variant: heading ? "heading-md/semibold" : "text-md/normal", color: color || (muted ? "text-muted" : "text-normal"), ...props }, children);
      return h(RN.Text, props, children);
    }
    function Button({ text, onPress, disabled, variant = "primary", ...props }) {
      const Comp = D.Button;
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

  // project:src/settings-section.js
  function registerSection(r, section) {
    const constants = r.find("SETTING_RENDERER_CONFIG");
    const lists = r.find("createList");
    if (!constants || !lists || !r.api.patcher?.before) return false;
    const navigationRef = r.find("getRootNavigationRef");
    const navigation = r.common.NavigationNative;
    const routeName = "MIME_PLUGIN_SETTINGS_PAGE";
    const canNavigate = navigationRef && navigation?.useRoute && navigation?.useNavigation;
    const key = /* @__PURE__ */ Symbol.for("mime.snow.settingsSections.v2");
    let hub = constants[key];
    if (!hub) {
      let CustomPageRenderer = function() {
        const route = navigation.useRoute();
        const nav = navigation.useNavigation();
        r.React.useEffect(() => {
          nav.setOptions({ title: route.params.title, headerShown: route.params.headerShown !== false });
        }, [nav, route.params.title, route.params.headerShown]);
        return route.params.render();
      };
      const descriptor = Object.getOwnPropertyDescriptor(constants, "SETTING_RENDERER_CONFIG");
      if (!descriptor?.configurable) return false;
      const entries = /* @__PURE__ */ new Map();
      let value = constants.SETTING_RENDERER_CONFIG;
      const get = () => {
        const base = descriptor.get ? descriptor.get.call(constants) : value;
        const extra = {};
        if (canNavigate) extra[routeName] = {
          type: "route",
          useTitle: () => "Plugin",
          screen: { route: routeName, getComponent: () => CustomPageRenderer }
        };
        for (const { runtime, section: s } of entries.values()) for (const row of s.items) {
          extra[row.key] = {
            type: "pressable",
            icon: row.icon,
            IconComponent: row.IconComponent || (() => null),
            useTitle: row.title,
            usePredicate: row.usePredicate,
            useTrailing: row.useTrailing,
            withArrow: true,
            onPress: row.onPress || (async () => {
              try {
                const page = await row.render();
                if (!runtime.active) return;
                if (canNavigate) {
                  const nav = navigationRef.getRootNavigationRef();
                  nav.navigate(routeName, {
                    title: row.title(),
                    headerShown: row.headerShown,
                    owner: runtime.meta.id,
                    render: () => runtime.active ? runtime.h(page.default, { close: () => nav.goBack() }) : null
                  });
                } else runtime.open(row.key, page.default, {}, { scrollable: false });
              } catch (error) {
                if (runtime.active) runtime.error("Open settings page", error);
              }
            }),
            ...row.rawTabsConfig
          };
        }
        return { ...base, ...extra };
      };
      Object.defineProperty(constants, "SETTING_RENDERER_CONFIG", {
        configurable: true,
        enumerable: descriptor.enumerable,
        get,
        set: descriptor.set ? (v) => descriptor.set.call(constants, v) : (v) => {
          value = v;
        }
      });
      hub = { entries, close() {
        if (Object.getOwnPropertyDescriptor(constants, "SETTING_RENDERER_CONFIG")?.get === get) {
          Object.defineProperty(constants, "SETTING_RENDERER_CONFIG", descriptor.get ? descriptor : { ...descriptor, value });
        }
        delete constants[key];
      } };
      Object.defineProperty(constants, key, { value: hub, configurable: true });
    }
    const id = Symbol(section.name);
    hub.entries.set(id, { runtime: r, section });
    r.patch("before", lists, "createList", (args) => {
      if (!r.active) return;
      const config = args[0];
      if (!config?.sections?.some((s) => s.settings?.includes("ACCOUNT"))) return;
      const sections = config.sections.map((s) => ({ ...s, settings: s.settings ? [...s.settings] : s.settings }));
      const keys = section.items.map((row) => row.key);
      const existing = sections.find((s) => s.label === section.name);
      if (existing) existing.settings = [.../* @__PURE__ */ new Set([...existing.settings || [], ...keys])];
      else sections.unshift({ label: section.name, title: section.name, settings: keys });
      args[0] = { ...config, sections };
    });
    r.own(() => {
      if (canNavigate) {
        const nav = navigationRef.getRootNavigationRef();
        const current = nav?.getCurrentRoute?.();
        if (current?.name === routeName && current.params?.owner === r.meta.id) nav.goBack();
      }
      hub.entries.delete(id);
      if (!hub.entries.size) hub.close();
    });
    return true;
  }

  // project:src/action-sheet.js
  function mapTree(React, node, transform) {
    const replacement = transform(node);
    if (replacement !== void 0) return replacement;
    if (Array.isArray(node)) return node.map((child) => mapTree(React, child, transform));
    if (!React.isValidElement(node) || node.props.children == null) return node;
    return React.cloneElement(node, {}, mapTree(React, node.props.children, transform));
  }
  function appendAction(r, tree, item) {
    let inserted = false;
    const name = (node) => node?.type?.displayName || node?.type?.name || node?.type?.type?.name;
    const result = mapTree(r.React, tree, (node) => {
      if (inserted || !Array.isArray(node)) return;
      const sample = node.find((n) => name(n) === "ButtonRow" || name(n) === "ActionSheetRow");
      if (!sample || node.some((n) => n?.key === item.key)) return;
      inserted = true;
      const Row = name(sample) === "ButtonRow" ? r.D.Forms?.FormRow || r.C.Forms?.FormRow || sample.type : sample.type;
      return [...node, r.h(Row, { key: item.key, label: item.label, onPress: item.onPress, ...item.icon ? { icon: item.icon, leading: item.icon } : {} })];
    });
    return inserted ? result : tree;
  }
  function patchLazySheet(r, getItem) {
    const sheets = r.find("openLazy", "hideActionSheet");
    if (!sheets || !r.api.patcher?.before) return false;
    return r.patch("before", sheets, "openLazy", (args) => {
      const [pending, key, props] = args;
      const item = getItem(key, props);
      if (!item || !pending?.then) return;
      args[0] = pending.then((module) => {
        if (!r.active || typeof module?.default !== "function" || module.default.prototype?.isReactComponent) return module;
        const Original = module.default;
        function WithAction(screenProps) {
          const tree = Original(screenProps);
          const current = r.active ? getItem(key, screenProps?.message || screenProps?.channel ? screenProps : props) : null;
          if (!current) return tree;
          return appendAction(r, tree, { ...current, onPress: () => {
            if (!r.active) return;
            sheets.hideActionSheet();
            Promise.resolve().then(() => current.onPress()).catch((error) => {
              if (r.active) r.error(current.label, error);
            });
          } });
        }
        return { ...module, default: WithAction };
      });
    });
  }

  // project:src/plugins/nighty-icon.js
  var blueIcon = "data:image/png;base64,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";
  var grayIcon = "data:image/png;base64,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";

  // project:src/plugins/nighty-tab.js
  function pageUrl(value) {
    try {
      const url = new URL(String(value).trim());
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch {
      return null;
    }
  }
  function canDownload(settings, message) {
    return !!settings.scriptUtils && typeof settings.nightyPrefix === "string" && Array.from(settings.nightyPrefix).length === 1 && !!settings.nightyPrefix.trim() && !!message?.id && !!messageChannelId(message) && !!message.attachments?.length;
  }
  function messageChannelId(message) {
    return message?.getChannelId?.() || message?.channel_id || message?.channelId;
  }
  function iconHint(node) {
    const props = node?.props || {};
    const bits = [props.name, typeof props.icon === "string" ? props.icon : ""];
    const kids = Array.isArray(props.children) ? props.children : props.children ? [props.children] : [];
    for (const child of kids) {
      if (typeof child?.props?.name === "string") bits.push(child.props.name);
      const type = child?.type;
      if (typeof type === "function") bits.push(type.displayName || type.name || "");
    }
    return bits.filter(Boolean).join(" ");
  }
  var ACTION_KEYS = ["actions", "buttons", "items", "headerActions", "trailingActions", "toolbarItems"];
  var SETTINGS_MESSAGE_KEYS = ["SETTINGS", "USER_SETTINGS", "SETTINGS_TITLE", "OPEN_SETTINGS", "USER_SETTINGS_BUTTON"];
  var OTHER_MESSAGE_KEYS = ["QUESTS", "SHOP", "NITRO", "COLLECTIBLES", "COLLECTIBLES_SHOP", "QUEST_HOME"];
  function textOf(value, depth = 0) {
    if (value == null || depth > 2) return "";
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (typeof value === "function") return value.displayName || value.name || "";
    if (typeof value === "object") return ["message", "defaultMessage", "id", "displayName", "name"].map((key) => textOf(value[key], depth + 1)).filter(Boolean).join(" ");
    return "";
  }
  function recordText(record) {
    if (!record || typeof record !== "object") return "";
    return ["label", "accessibilityLabel", "accessibilityHint", "aria-label", "testID", "nativeID", "id", "key", "name", "route", "screen", "icon", "Icon", "IconComponent"].map((key) => textOf(record[key])).filter(Boolean).join(" ");
  }
  var settingsNeedles = [];
  var otherNeedles = [];
  function rememberMessages(messages) {
    if (!messages || typeof messages !== "object") return;
    const take = (keys, bucket) => {
      for (const key of keys) {
        const value = messages[key];
        if (typeof value === "string" && value.length >= 2 && value.length <= 32 && !bucket.includes(value)) bucket.push(value);
      }
    };
    take(SETTINGS_MESSAGE_KEYS, settingsNeedles);
    take(OTHER_MESSAGE_KEYS, otherNeedles);
  }
  function isSettingsText(text) {
    if (!text || /notification/i.test(text)) return false;
    if (/settings?|SettingsIcon|GearIcon|CogIcon|USER_SETTINGS|\b(gear|cog)\b/i.test(text)) return true;
    return settingsNeedles.some((word) => text.includes(word));
  }
  function isOtherText(text) {
    if (!text) return false;
    if (/quest|shop|collectible|nitro|QuestIcon|ShopIcon|NitroIcon|CollectiblesIcon/i.test(text)) return true;
    return otherNeedles.some((word) => text.includes(word));
  }
  function pressProps(record) {
    if (!record || typeof record !== "object" || record.subLabel || record.trailing) return false;
    if (typeof record.label === "string" && record.label.length > 40) return false;
    return typeof record.onPress === "function" || typeof record.onPressOut === "function";
  }
  function nodeText(node) {
    const props = node?.props;
    if (!props) return "";
    return ["accessibilityLabel", "accessibilityHint", "aria-label", "testID", "nativeID", "label", "name", "route", "screen", "id"].map((key) => textOf(props[key])).concat(iconHint(node)).filter(Boolean).join(" ");
  }
  function isIconControl(node) {
    return pressProps(node?.props);
  }
  function isSettingsControl(node) {
    return isIconControl(node) && isSettingsText(nodeText(node));
  }
  function isQuestOrShopControl(node) {
    return isIconControl(node) && isOtherText(nodeText(node));
  }
  function plainKind(item) {
    if (!pressProps(item) || item.props) return "";
    const text = recordText(item);
    if (isSettingsText(text)) return "settings";
    if (isOtherText(text)) return "other";
    return "";
  }
  function controlKind(node) {
    if (isSettingsControl(node)) return "settings";
    if (isQuestOrShopControl(node)) return "other";
    const inner = node?.props?.children;
    const list = Array.isArray(inner) ? inner.filter(Boolean) : inner ? [inner] : [];
    if (list.length !== 1) return "";
    if (isSettingsControl(list[0])) return "settings-wrap";
    if (isQuestOrShopControl(list[0])) return "other-wrap";
    return "";
  }
  function insertPlainAction(list, makeButton) {
    if (!Array.isArray(list) || list.length < 2 || list.length > 8) return list;
    if (list.some((item) => item?.key === "mime-nighty-profile-button" || item?.id === "mime-nighty-profile-button")) return list;
    const kinds = list.map(plainKind);
    const index = kinds.indexOf("settings");
    if (index < 0 || !kinds.includes("other")) return list;
    const next = list.slice();
    next.splice(index + 1, 0, makeButton(list[index]));
    return next;
  }
  function insertNightySlot(React, element, makeButton) {
    const children = element?.props?.children;
    const list = Array.isArray(children) ? children.filter(Boolean) : null;
    if (!list || list.length < 2 || list.length > 8) return element;
    if (list.some((node2) => node2?.props?.testID === "mime-nighty-profile-button")) return element;
    const kinds = list.map(controlKind);
    const index = kinds.findIndex((kind) => kind === "settings" || kind === "settings-wrap");
    if (index < 0 || !kinds.some((kind) => kind === "other" || kind === "other-wrap")) return element;
    const node = list[index];
    const sample = kinds[index] === "settings" ? node : Array.isArray(node.props.children) ? node.props.children.filter(Boolean)[0] : node.props.children;
    const added = makeButton(sample);
    if (!added) return element;
    const next = list.slice();
    next.splice(index + 1, 0, added);
    return React.cloneElement(element, {}, ...next);
  }
  function NightyTab(r) {
    const { h, React, RN, store } = r;
    const { Page, Text, Button, Input, Toggle } = ui(r);
    const iconUrl = () => store.iconType === "custom" ? pageUrl(store.customIconUrl) : store.iconType === "grayscale" ? grayIcon : blueIcon;
    function Icon() {
      r.useRefresh();
      const uri = iconUrl();
      return uri ? h(
        RN.View,
        { style: { width: 24, height: 24, alignItems: "center", justifyContent: "center" } },
        h(RN.Image, { source: { uri }, resizeMode: "contain", style: { width: 18, height: 18 }, accessibilityIgnoresInvertColors: true })
      ) : null;
    }
    const sending = /* @__PURE__ */ new Set();
    async function download(message) {
      if (!r.active || !canDownload(store, message) || sending.has(message.id)) return;
      sending.add(message.id);
      try {
        const module = r.find("HTTP", "get", "post", "put", "patch", "del") || r.find("get", "post", "put", "del");
        const rest = module?.HTTP || module;
        if (typeof rest?.post !== "function") throw new Error("Discord message API unavailable");
        const channelId = messageChannelId(message);
        await rest.post({ url: `/channels/${channelId}/messages`, body: {
          content: `${store.nightyPrefix}dls`,
          message_reference: { message_id: message.id, channel_id: channelId, ...message.guild_id ? { guild_id: message.guild_id } : {} },
          allowed_mentions: { parse: [], replied_user: false }
        } });
      } finally {
        sending.delete(message.id);
      }
    }
    function pageHost() {
      const src = pageUrl(store.url);
      if (!src) return "";
      try {
        return new URL(src).host;
      } catch {
        return "";
      }
    }
    function cleanToken(value) {
      if (typeof value !== "string") return "";
      const token = value.trim();
      if (token.length < 8 || token.length > 4096 || !/^[\w.~+/-]+=*$/.test(token)) return "";
      return token;
    }
    function sessionToken() {
      const host = pageHost();
      const saved = store.sessions?.[host];
      return host && cleanToken(saved) ? cleanToken(saved) : "";
    }
    function sessionScript(token) {
      const saved = JSON.stringify(cleanToken(token) || "");
      return `(() => { try { var saved = ${saved}; if (saved) { var secure = location.protocol === 'https:' ? '; Secure' : ''; document.cookie = 'access_token=' + saved + '; Path=/; Max-Age=2592000; SameSite=Lax' + secure; try { localStorage.setItem('access_token', saved); } catch (e) {} } if (window.__mimeNightySession) return true; window.__mimeNightySession = true; var send = function (value) { if (typeof value !== 'string' || !value || !window.ReactNativeWebView) return; window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'NIGHTY_TOKEN', token: value })); }; var orig = window.fetch; if (typeof orig === 'function') { window.fetch = function () { var args = arguments; return Promise.resolve(orig.apply(this, args)).then(function (res) { try { var first = args[0]; var url = typeof first === 'string' ? first : (first && first.url) || ''; if (String(url).indexOf('/api/login') !== -1 && res && res.clone) res.clone().json().then(function (data) { if (data && typeof data.access_token === 'string') send(data.access_token); }).catch(function () {}); } catch (e) {} return res; }); }; } } catch (e) {} return true; })();`;
    }
    function onSessionMessage(event) {
      if (!r.active) return;
      const host = pageHost();
      if (!host) return;
      let data;
      try {
        data = JSON.parse(event?.nativeEvent?.data || "");
      } catch {
        return;
      }
      if (data?.type !== "NIGHTY_TOKEN") return;
      const token = cleanToken(data.token);
      if (!token) return;
      const current = store.sessions && typeof store.sessions === "object" ? store.sessions : {};
      if (current[host] === token) return;
      r.set("sessions", { ...current, [host]: token });
    }
    function readInset(edge) {
      try {
        const mod = r.find("initialWindowMetrics") || r.find("useSafeAreaInsets") || {};
        const insets = mod.initialWindowMetrics?.insets || mod.insets;
        const value = insets?.[edge];
        if (typeof value === "number" && value > 0 && value < 80) return Math.round(value);
      } catch {
      }
      return 0;
    }
    function NightyPage() {
      r.useRefresh();
      const src = pageUrl(store.url);
      const WebView = r.find("WebView")?.WebView || r.byName("WebView");
      const [error, setError] = React.useState("");
      const frame = { flex: 1, width: "100%", paddingBottom: readInset("bottom") };
      const allow = (req) => {
        const url = req?.url || "";
        return !url || url === "about:blank" || url === src || !!pageUrl(url);
      };
      return h(
        RN.View,
        { style: frame },
        !src ? h(Text, null, "Set a valid HTTP or HTTPS URL in Nighty Tab settings.") : !WebView ? h(Text, null, "WebView is unavailable in this Snow build.") : h(WebView, {
          key: src,
          source: { uri: src, ...sessionToken() ? { headers: { Cookie: `access_token=${sessionToken()}` } } : {} },
          style: { flex: 1, width: "100%" },
          originWhitelist: ["http://*", "https://*"],
          javaScriptEnabled: true,
          domStorageEnabled: true,
          sharedCookiesEnabled: false,
          thirdPartyCookiesEnabled: false,
          incognito: false,
          startInLoadingState: true,
          injectedJavaScriptBeforeContentLoaded: sessionScript(sessionToken()),
          injectedJavaScript: sessionScript(sessionToken()),
          onMessage: onSessionMessage,
          onShouldStartLoadWithRequest: allow,
          onError: (event) => setError(event.nativeEvent?.description || "Could not load Nighty."),
          onHttpError: (event) => setError(`Nighty returned HTTP ${event.nativeEvent?.statusCode}.`),
          onLoad: () => setError("")
        }),
        error ? h(Text, null, error) : null
      );
    }
    function Settings({ close }) {
      r.useRefresh();
      return h(
        Page,
        { title: "Nighty Tab", close },
        h(Text, null, "URL"),
        h(Input, { value: store.url, placeholder: "https://", autoCapitalize: "none", onChange: (v) => r.set("url", v) }),
        store.url && !pageUrl(store.url) ? h(Text, null, "Enter an HTTP or HTTPS URL without embedded credentials.") : null,
        h(Button, { text: "Open Nighty", onPress: () => {
          if (!openNighty()) openSheet();
        } }),
        h(Toggle, { setting: "showNightyButton", label: "Profile Nighty button", subLabel: "Adds a Nighty button beside Settings on your profile. It uses the same icon as the Nighty settings row." }),
        h(Toggle, { setting: "scriptUtils", label: "Script Utils functions", subLabel: "Download Script replies to an attachment with your prefix followed by dls." }),
        h(Text, null, "Nighty prefix (one character)"),
        h(Input, { value: store.nightyPrefix, onChange: (v) => r.set("nightyPrefix", v), autoCapitalize: "none", placeholder: "." }),
        ...["blue", "grayscale", "custom"].map((style) => h(Button, { key: style, text: `${store.iconType === style ? "\u2713 " : ""}${style} icon`, onPress: () => r.set("iconType", style) })),
        store.iconType === "custom" ? h(Input, { value: store.customIconUrl, placeholder: "https:// image URL", autoCapitalize: "none", onChange: (v) => r.set("customIconUrl", v) }) : null,
        h(Icon),
        h(Text, { muted: true }, `Settings entry: ${r.status.settingsEntry ? "registered" : "unavailable"} \xB7 Message menu: ${r.status.messageMenu ? "registered" : "unavailable"} \xB7 Profile button: ${store.showNightyButton ? r.status.profileButton === "added" ? "added beside Settings" : "watching" : "off"}`)
      );
    }
    function screenNavigator() {
      const found = r.byName("Navigator", true) || r.byName("Navigator") || r.find("Navigator");
      if (typeof found === "function") return found;
      if (typeof found?.Navigator === "function") return found.Navigator;
      if (typeof found?.default === "function") return found.default;
      return null;
    }
    function openNighty() {
      if (!r.active) return false;
      const navigation = r.common.navigation || r.find("push", "pushLazy", "pop");
      if (typeof navigation?.push !== "function") return false;
      const Navigator = screenNavigator();
      const close = () => navigation.pop?.();
      const headerLeft = discordClose(close) || (() => closeMark(close));
      function Screen() {
        if (Navigator) return h(Navigator, {
          initialRouteName: "Nighty",
          goBackOnBackPress: true,
          screens: {
            Nighty: {
              title: "Nighty",
              headerBackVisible: false,
              headerLeft,
              render: () => r.active ? h(NightyPage, { close }) : null
            }
          }
        });
        return h(RN.View, { style: { flex: 1, width: "100%" } }, renderClose(close), h(NightyPage, { close }));
      }
      Screen.displayName = "Nighty";
      try {
        navigation.push(Screen);
        return true;
      } catch (error) {
        if (r.active) r.error("Open Nighty", error);
        return false;
      }
    }
    function openSheet() {
      try {
        r.open("nighty", NightyPage, {}, { scrollable: false });
      } catch (error) {
        if (r.active) r.error("Open Nighty", error);
      }
    }
    function press() {
      return () => {
        if (r.active && store.showNightyButton && !openNighty()) openSheet();
      };
    }
    function toolbarIcon() {
      const uri = iconUrl();
      if (!uri) return null;
      return h(RN.Image, {
        source: { uri },
        resizeMode: "contain",
        fadeDuration: 0,
        accessibilityIgnoresInvertColors: true,
        style: { width: 22, height: 16 }
      });
    }
    function profileMark() {
      const uri = iconUrl();
      if (!uri) return null;
      return h(
        RN.View,
        { style: { width: 24, height: 18, alignItems: "center", justifyContent: "center" } },
        h(RN.Image, {
          source: { uri },
          resizeMode: "contain",
          fadeDuration: 0,
          accessibilityIgnoresInvertColors: true,
          style: { width: 22, height: 16 }
        })
      );
    }
    function findCaption(node, depth = 0) {
      if (!node || depth > 8 || typeof node !== "object") return null;
      const content = captionText(node);
      if (content && content !== "Nighty" && content.length <= 24 && (isSettingsText(content) || isOtherText(content))) return node;
      const kids = node.props?.children;
      const list = Array.isArray(kids) ? kids : kids && typeof kids === "object" ? [kids] : [];
      for (const kid of list) {
        const found = findCaption(kid, depth + 1);
        if (found) return found;
      }
      return null;
    }
    function flatStyle(style) {
      if (!style) return {};
      if (Array.isArray(style)) return Object.assign({}, ...style.map(flatStyle));
      return typeof style === "object" ? style : {};
    }
    function profileLabel(sample) {
      const flat = flatStyle(findCaption(sample)?.props?.style);
      const fontSize = typeof flat.fontSize === "number" && flat.fontSize >= 9 && flat.fontSize <= 13 ? flat.fontSize : 11;
      const lineHeight = typeof flat.lineHeight === "number" && flat.lineHeight >= fontSize && flat.lineHeight <= 16 ? flat.lineHeight : fontSize + 2;
      return h(RN.Text, {
        numberOfLines: 1,
        allowFontScaling: false,
        style: {
          fontFamily: typeof flat.fontFamily === "string" ? flat.fontFamily : "gg sans",
          fontSize,
          lineHeight,
          fontWeight: flat.fontWeight || "700",
          color: typeof flat.color === "string" ? flat.color : "#FFFFFF",
          textAlign: "center",
          marginTop: 1
        }
      }, "Nighty");
    }
    function captionText(node) {
      const kids = node?.props?.children;
      if (typeof kids === "string" || typeof kids === "number") return String(kids);
      if (!Array.isArray(kids)) return "";
      return kids.filter((kid) => typeof kid === "string" || typeof kid === "number").join("");
    }
    function discordClose(onClose) {
      const module = r.find("getRenderCloseButton") || r.find("getHeaderCloseButton");
      const render = module?.getRenderCloseButton || module?.getHeaderCloseButton;
      if (typeof render !== "function") return null;
      try {
        return render(onClose) || null;
      } catch (error) {
        if (r.active) r.error("Nighty close button", error);
        return null;
      }
    }
    function closeMark(onClose) {
      return h(RN.Pressable || RN.TouchableOpacity, {
        accessibilityLabel: "Close",
        accessibilityRole: "button",
        onPress: onClose,
        hitSlop: { top: 12, bottom: 12, left: 12, right: 12 },
        style: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }
      }, h(RN.Text, { style: { color: "#FFFFFF", fontSize: 22, lineHeight: 24 } }, "\u2715"));
    }
    function renderClose(onClose) {
      const control = discordClose(onClose);
      if (typeof control === "function") return h(control);
      return control || closeMark(onClose);
    }
    function NightyProfileButton({ sample }) {
      r.useRefresh();
      const [open, setOpen] = React.useState(false);
      const Modal = RN.Modal;
      const close = () => setOpen(false);
      return h(
        RN.Pressable || RN.TouchableOpacity,
        {
          accessibilityLabel: "Nighty",
          accessibilityHint: "Open Nighty",
          accessibilityRole: "button",
          testID: "mime-nighty-profile-button",
          hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
          onPress: () => {
            if (!r.active || !store.showNightyButton) return;
            if (!openNighty()) setOpen(true);
          },
          style: { flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center" }
        },
        profileMark(),
        profileLabel(sample),
        open && Modal ? h(Modal, {
          visible: true,
          animationType: "slide",
          presentationStyle: "fullScreen",
          statusBarTranslucent: true,
          onRequestClose: close
        }, h(
          RN.View,
          { style: { flex: 1, width: "100%", paddingTop: readInset("top") } },
          renderClose(close),
          h(NightyPage, { close })
        )) : null
      );
    }
    function nightyControl(sample) {
      return h(NightyProfileButton, { key: "mime-nighty-profile-button", sample });
    }
    function nightyRecord(sample) {
      const image = toolbarIcon();
      const record = sample && typeof sample === "object" ? { ...sample } : {};
      for (const key of Object.keys(record)) {
        if (typeof record[key] === "string" && isSettingsText(record[key])) record[key] = "Nighty";
      }
      record.key = "mime-nighty-profile-button";
      record.id = "mime-nighty-profile-button";
      record.label = "Nighty";
      record.text = "Nighty";
      record.accessibilityLabel = "Nighty";
      record.accessibilityHint = "Open Nighty";
      record.IconComponent = Icon;
      record.icon = typeof sample?.icon === "function" ? Icon : image;
      record.onPress = press();
      return record;
    }
    function applyToolbar(element) {
      if (!r.active || !store.showNightyButton || !element?.props) return element;
      const slotted = insertNightySlot(r.React, element, nightyControl);
      if (slotted !== element) {
        r.status.profileButton = "added";
        return slotted;
      }
      let changed = false;
      const props = {};
      for (const key of ACTION_KEYS) {
        const next = insertPlainAction(element.props[key], nightyRecord);
        if (next !== element.props[key]) {
          props[key] = next;
          changed = true;
        }
      }
      if (!changed) return element;
      r.status.profileButton = "added";
      return r.React.cloneElement(element, props);
    }
    const watched = /* @__PURE__ */ new Set();
    function watch(parent, key) {
      const fn = parent?.[key];
      if (typeof fn !== "function" || watched.has(fn)) return false;
      watched.add(fn);
      return r.patch("after", parent, key, (_args, result) => {
        const next = applyToolbar(result);
        return next === result ? void 0 : next;
      });
    }
    return { Settings, NightyPage, download, start() {
      r.status.settingsEntry = registerSection(r, { name: "Nighty", items: [{ key: "MIME_NIGHTY", title: () => "Nighty", headerShown: false, IconComponent: Icon, render: async () => ({ default: NightyPage }) }] });
      r.status.messageMenu = patchLazySheet(r, (key, props) => key === "MessageLongPressActionSheet" && canDownload(store, props?.message) ? { key: "mime-nighty-download", label: "Download Script", icon: h(Icon), onPress: () => download(props.message) } : null);
      rememberMessages(r.common?.i18n?.Messages || r.find("Messages")?.Messages);
      const patched = watch(React, "createElement");
      for (const key of ["jsx", "jsxs"]) watch(React, key);
      const metro = r.B.metro;
      const factories = [r.B._jsx, r.host?._jsx];
      try {
        const found = metro?.findByPropsAll?.("jsx", "jsxs") || [];
        factories.push(...found, metro?.findByProps?.("jsx", "jsxs"));
      } catch {
      }
      for (const factory of factories) {
        watch(factory, "jsx");
        watch(factory, "jsxs");
      }
      r.status.profileButton = patched === false ? "unavailable" : r.status.profileButton === "replaced" ? "replaced" : "patched";
    } };
  }
  NightyTab.defaults = { url: "", scriptUtils: false, nightyPrefix: ".", iconType: "blue", customIconUrl: "", showNightyButton: true, sessions: {} };

  // NightyTab.entry.js
  var NightyTab_entry_default = register({ "id": "mime.nightytab", "name": "Nighty Tab", "description": "Nighty in mobile settings, with an optional profile-bar button and Download Script replies.", "version": "1.4.0", "authors": [{ "name": "Mime | N0_.q3", "id": "957164619061932045" }, { "name": "rico | wkcp", "id": "1361736124858630274" }], "license": "GPL-3.0-or-later", "source": "https://github.com/xMimiez/Snow-Plugins/tree/main/NightyTab" }, NightyTab);
  return __toCommonJS(NightyTab_entry_exports);
})();
