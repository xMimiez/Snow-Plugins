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
  var TOOLBAR_NAMES = ["ProfileHeaderActions", "UserProfileHeaderActions", "ProfileActionBar", "ProfileToolbar", "ProfileButtons", "UserProfileActions", "YouProfileHeaderActions", "HeaderActionButtons", "ProfileQuickAccessBar"];
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
  var COMPONENT_NAMES = [...TOOLBAR_NAMES, "YouScreen", "YouHeader", "YouHeaderActions", "YouProfileHeader", "ProfileHeaderActions", "UserProfileHeader", "UserProfileHeaderActions", "UserProfileActions"];
  var FILE_PATHS = [
    "modules/main_tabs_v2/native/tabs/you/YouScreen.tsx",
    "modules/main_tabs_v2/native/tabs/you/YouHeader.tsx",
    "modules/main_tabs_v2/native/tabs/you/YouHeaderActions.tsx",
    "modules/main_tabs_v2/native/tabs/you/ProfileHeaderActions.tsx",
    "modules/user_profile/native/ProfileHeaderActions.tsx",
    "modules/user_profile/native/UserProfileHeader.tsx",
    "modules/user_profile/native/UserProfileHeaderActions.tsx"
  ];
  var SETTINGS_MESSAGE_KEYS = ["SETTINGS", "USER_SETTINGS", "SETTINGS_TITLE", "OPEN_SETTINGS", "USER_SETTINGS_BUTTON"];
  var OTHER_MESSAGE_KEYS = ["QUESTS", "SHOP", "NITRO", "COLLECTIBLES", "COLLECTIBLES_SHOP", "QUEST_HOME"];
  function textOf(value, depth = 0) {
    if (value == null || depth > 2) return "";
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (typeof value === "function") return value.displayName || value.name || "";
    if (typeof value === "object") return ["message", "defaultMessage", "id", "displayName", "name"].map((key) => textOf(value[key], depth + 1)).filter(Boolean).join(" ");
    return "";
  }
  function toolbarSource(fn) {
    let src = "";
    try {
      src = Function.prototype.toString.call(fn);
    } catch {
      return false;
    }
    return src.length > 80 && src.length < 2e4 && /USER_SETTINGS|SettingsIcon/.test(src) && /QUEST|COLLECTIBLES|ShopIcon|NitroIcon/.test(src);
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
  function replacePlainActions(list, makeButton) {
    if (!Array.isArray(list) || list.length < 2 || list.length > 8) return list;
    const kinds = list.map(plainKind);
    if (!kinds.includes("settings") || !kinds.includes("other")) return list;
    let replaced = false;
    return list.map((item, index) => {
      if (replaced || kinds[index] !== "settings") return item;
      replaced = true;
      return makeButton(item);
    });
  }
  function replaceSettingsSlot(React, element, makeButton) {
    const children = element?.props?.children;
    const list = Array.isArray(children) ? children.filter(Boolean) : null;
    if (!list || list.length < 2 || list.length > 8) return element;
    const kinds = list.map(controlKind);
    if (!kinds.includes("settings") && !kinds.includes("settings-wrap")) return element;
    if (!kinds.some((kind) => kind === "other" || kind === "other-wrap")) return element;
    let replaced = false;
    const next = list.map((node, index) => {
      if (replaced) return node;
      if (kinds[index] === "settings") {
        replaced = true;
        return makeButton(node);
      }
      if (kinds[index] === "settings-wrap") {
        replaced = true;
        const inner = Array.isArray(node.props.children) ? node.props.children.filter(Boolean) : [node.props.children];
        return React.cloneElement(node, {}, makeButton(inner[0]));
      }
      return node;
    });
    return replaced ? React.cloneElement(element, {}, ...next) : element;
  }
  function NightyTab(r) {
    const { h, React, RN, store } = r;
    const { Page, Text, Button, Input, Toggle } = ui(r);
    const iconUrl = () => store.iconType === "custom" ? pageUrl(store.customIconUrl) : `https://raw.githubusercontent.com/aboveproof/Equicord-Nighty-Tab/main/asset/icon${store.iconType === "grayscale" ? "-grayscale" : ""}.png`;
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
    function NightyPage() {
      r.useRefresh();
      const src = pageUrl(store.url);
      const WebView = r.find("WebView")?.WebView || r.byName("WebView");
      const [error, setError] = React.useState("");
      return h(
        RN.View,
        { style: { flex: 1 } },
        !src ? h(Text, null, "Set a valid HTTP or HTTPS URL in Nighty Tab settings.") : !WebView ? h(Text, null, "WebView is unavailable in this Snow build.") : h(WebView, {
          key: src,
          source: { uri: src },
          style: { flex: 1 },
          originWhitelist: ["http://*", "https://*"],
          javaScriptEnabled: true,
          domStorageEnabled: true,
          sharedCookiesEnabled: false,
          thirdPartyCookiesEnabled: false,
          startInLoadingState: true,
          onShouldStartLoadWithRequest: (req) => !!pageUrl(req.url),
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
        h(Button, { text: "Open Nighty", onPress: () => r.open("nighty", NightyPage, {}, { scrollable: false }) }),
        h(Toggle, { setting: "showNightyButton", label: "Nighty instead of Settings", subLabel: "Shows Nighty in place of the Settings button next to Quests and Shop. Turn this off and reopen your profile to get Settings back." }),
        h(Toggle, { setting: "scriptUtils", label: "Script Utils functions", subLabel: "Download Script replies to an attachment with your prefix followed by dls." }),
        h(Text, null, "Nighty prefix (one character)"),
        h(Input, { value: store.nightyPrefix, onChange: (v) => r.set("nightyPrefix", v), autoCapitalize: "none", placeholder: "." }),
        ...["blue", "grayscale", "custom"].map((style) => h(Button, { key: style, text: `${store.iconType === style ? "\u2713 " : ""}${style} icon`, onPress: () => r.set("iconType", style) })),
        store.iconType === "custom" ? h(Input, { value: store.customIconUrl, placeholder: "https:// image URL", autoCapitalize: "none", onChange: (v) => r.set("customIconUrl", v) }) : null,
        h(Icon),
        h(Text, { muted: true }, `Settings entry: ${r.status.settingsEntry ? "registered" : "unavailable"} \xB7 Message menu: ${r.status.messageMenu ? "registered" : "unavailable"} \xB7 Profile button: ${store.showNightyButton ? r.status.profileButton === "replaced" ? "replaced Settings" : "watching" : "off"}`)
      );
    }
    function ToolbarIcon() {
      const uri = iconUrl();
      return uri ? h(RN.Image, { source: { uri }, resizeMode: "contain", style: { width: 24, height: 24 }, accessibilityIgnoresInvertColors: true }) : null;
    }
    function openNighty() {
      if (!r.active) return;
      const constants = r.find("SETTING_RENDERER_CONFIG");
      const row = constants?.SETTING_RENDERER_CONFIG?.MIME_NIGHTY;
      if (typeof row?.onPress === "function") {
        Promise.resolve(row.onPress()).catch((error) => {
          if (r.active) r.error("Open Nighty", error);
        });
        return;
      }
      try {
        r.open("nighty", NightyPage, {}, { scrollable: false });
      } catch (error) {
        if (r.active) r.error("Open Nighty", error);
      }
    }
    function nightyControl(sample) {
      return r.React.cloneElement(sample, {
        key: "mime-nighty-profile-button",
        accessibilityLabel: "Nighty",
        accessibilityHint: "Open Nighty",
        testID: "mime-nighty-profile-button",
        onPress: () => {
          if (r.active && store.showNightyButton) openNighty();
        }
      }, h(ToolbarIcon));
    }
    function nightyRecord(sample) {
      const next = { ...sample, key: "mime-nighty-profile-button", id: "mime-nighty-profile-button", accessibilityLabel: "Nighty", onPress: () => {
        if (r.active && store.showNightyButton) openNighty();
      } };
      if (typeof sample.label === "string") next.label = "Nighty";
      if ("icon" in sample) next.icon = ToolbarIcon;
      if ("Icon" in sample) next.Icon = ToolbarIcon;
      if ("IconComponent" in sample) next.IconComponent = ToolbarIcon;
      return next;
    }
    function applyToolbar(element) {
      if (!r.active || !store.showNightyButton || !element?.props) return element;
      const slotted = replaceSettingsSlot(r.React, element, nightyControl);
      if (slotted !== element) {
        r.status.profileButton = "replaced";
        return slotted;
      }
      let changed = false;
      const props = {};
      for (const key of ACTION_KEYS) {
        const next = replacePlainActions(element.props[key], nightyRecord);
        if (next !== element.props[key]) {
          props[key] = next;
          changed = true;
        }
      }
      if (!changed) return element;
      r.status.profileButton = "replaced";
      return r.React.cloneElement(element, props);
    }
    function applyDeep(node, depth = 0) {
      if (node == null || depth > 10) return node;
      if (Array.isArray(node)) {
        if (node.length > 40) return node;
        let changed = false;
        const mapped = node.map((child) => {
          const next2 = applyDeep(child, depth + 1);
          if (next2 !== child) changed = true;
          return next2;
        });
        return changed ? mapped : node;
      }
      const next = applyToolbar(node);
      if (next !== node || !r.React.isValidElement(node)) return next;
      const children = next.props?.children;
      const nextChildren = applyDeep(children, depth + 1);
      if (nextChildren === children) return node;
      return r.React.cloneElement(node, {}, nextChildren);
    }
    const watched = /* @__PURE__ */ new Set();
    const proxies = /* @__PURE__ */ new Map();
    const proxiedNames = /* @__PURE__ */ new Set();
    function watch(parent, key, deep) {
      const fn = parent?.[key];
      if (typeof fn !== "function" || watched.has(fn)) return false;
      watched.add(fn);
      return r.patch("after", parent, key, (_args, result) => {
        const next = deep ? applyDeep(result) : applyToolbar(result);
        return next === result ? void 0 : next;
      });
    }
    function wrapRender(type) {
      if (proxies.has(type)) return proxies.get(type);
      function Proxy2(props) {
        const rendered = type(props);
        const next = applyDeep(rendered);
        return next === void 0 ? rendered : next;
      }
      const label = type.displayName || type.name || "row";
      Proxy2.displayName = `NightyProxy(${label})`;
      proxies.set(type, Proxy2);
      return Proxy2;
    }
    function installRenderProxy(name) {
      const jsx = r.B.api?.react?.jsx;
      if (!name || proxiedNames.has(name) || typeof jsx?.onJsxCreate !== "function") return false;
      proxiedNames.add(name);
      const callback = (Component, element) => {
        if (!r.active || !store.showNightyButton || typeof Component !== "function" || !element) return;
        const type = wrapRender(Component);
        const next = r.React.createElement(type, element.props);
        next.key = element.key;
        next.ref = element.ref;
        return next;
      };
      jsx.onJsxCreate(name, callback);
      r.own(() => {
        try {
          jsx.deleteJsxCreate(name, callback);
        } catch {
        }
      });
      return true;
    }
    function considerModule(mod) {
      if (!mod || typeof mod !== "object") return;
      for (const key of Object.keys(mod)) {
        const value = mod[key];
        const fn = typeof value === "function" ? value : value?.render || value?.type;
        if (typeof fn !== "function") continue;
        const name = fn.displayName || fn.name || "";
        if (!COMPONENT_NAMES.includes(name) && !toolbarSource(fn)) continue;
        if (typeof value === "function") watch(mod, key, true);
        else if (typeof value.render === "function") watch(value, "render", true);
        else if (typeof value.type === "function") watch(value, "type", true);
        if (name) installRenderProxy(name);
      }
    }
    return { Settings, NightyPage, download, start() {
      r.status.settingsEntry = registerSection(r, { name: "Nighty", items: [{ key: "MIME_NIGHTY", title: () => "Nighty", headerShown: false, IconComponent: Icon, render: async () => ({ default: NightyPage }) }] });
      r.status.messageMenu = patchLazySheet(r, (key, props) => key === "MessageLongPressActionSheet" && canDownload(store, props?.message) ? { key: "mime-nighty-download", label: "Download Script", icon: h(Icon), onPress: () => download(props.message) } : null);
      rememberMessages(r.common?.i18n?.Messages || r.find("Messages")?.Messages);
      let proxied = false;
      for (const name of COMPONENT_NAMES) if (installRenderProxy(name)) proxied = true;
      const patched = watch(React, "createElement", false);
      for (const key of ["jsx", "jsxs"]) watch(React, key, false);
      const metro = r.B.metro;
      const factories = [r.B._jsx, r.host?._jsx];
      try {
        const found = metro?.findByPropsAll?.("jsx", "jsxs") || [];
        factories.push(...found, metro?.findByProps?.("jsx", "jsxs"));
      } catch {
      }
      for (const factory of factories) {
        watch(factory, "jsx", false);
        watch(factory, "jsxs", false);
      }
      for (const name of COMPONENT_NAMES) {
        try {
          considerModule(metro?.findByName?.(name, false));
          considerModule(metro?.findByDisplayName?.(name, false));
          considerModule(metro?.findByTypeName?.(name, false));
        } catch {
        }
      }
      for (const filePath of FILE_PATHS) {
        try {
          considerModule(metro?.findByFilePath?.(filePath, false));
        } catch {
        }
      }
      try {
        const matches = metro?.findAll?.((mod) => {
          const fn = mod?.default || mod?.render || mod;
          const label = fn?.displayName || fn?.name;
          return typeof label === "string" && COMPONENT_NAMES.includes(label);
        }) || [];
        for (const mod of matches) considerModule(mod?.default ? mod : { default: mod });
      } catch {
      }
      const armed = patched !== false || proxied;
      r.status.profileButton = armed ? r.status.profileButton === "replaced" ? "replaced" : "patched" : "unavailable";
    } };
  }
  NightyTab.defaults = { url: "", scriptUtils: false, nightyPrefix: ".", iconType: "blue", customIconUrl: "", showNightyButton: true };

  // NightyTab.entry.js
  var NightyTab_entry_default = register({ "id": "mime.nightytab", "name": "Nighty Tab", "description": "Nighty in mobile settings, with an optional profile-bar button and Download Script replies.", "version": "1.0.3", "authors": [{ "name": "Mime | N0_.q3", "id": "957164619061932045" }, { "name": "rico | wkcp", "id": "1361736124858630274" }], "license": "GPL-3.0-or-later", "source": "https://github.com/xMimiez/Snow-Plugins/tree/main/NightyTab" }, NightyTab);
  return __toCommonJS(NightyTab_entry_exports);
})();
