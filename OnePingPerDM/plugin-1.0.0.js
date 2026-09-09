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

  // project:src/url-hub.js
  var KEY = /* @__PURE__ */ Symbol.for("mime.snow.urlHandlers.v1");
  function addUrlHandler(r, priority, handler) {
    let hub = globalThis[KEY];
    if (!hub) {
      const target = r.common.url?.openURL ? r.common.url : r.find("openURL", "openDeeplink");
      if (!target?.openURL) throw new Error("This Discord build has no supported openURL module");
      hub = { handlers: [], original: target.openURL, target };
      hub.wrapper = function(...args) {
        const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
        if (url) for (const entry2 of [...hub.handlers]) {
          try {
            if (entry2.handler(url, () => hub.original.apply(this, args))) return;
          } catch (error) {
            entry2.r.error("Open link", error);
          }
        }
        return hub.original.apply(this, args);
      };
      target.openURL = hub.wrapper;
      globalThis[KEY] = hub;
    }
    const entry = { r, priority, handler };
    hub.handlers.push(entry);
    hub.handlers.sort((a, b) => b.priority - a.priority);
    r.own(() => {
      hub.handlers = hub.handlers.filter((x) => x !== entry);
      if (!hub.handlers.length) {
        if (hub.target.openURL === hub.wrapper) hub.target.openURL = hub.original;
        delete globalThis[KEY];
      }
    });
  }
  function openExternal(r, url) {
    return r.RN.Linking.openURL(url);
  }

  // project:src/plugins/mobile-ports.js
  function AlwaysAnimate(r) {
    const { h, React, RN } = r, { Page, Text, Toggle } = ui(r);
    let reduced = false;
    return { async start() {
      reduced = await RN.AccessibilityInfo?.isReduceMotionEnabled?.() || false;
      const listener = RN.AccessibilityInfo?.addEventListener?.("reduceMotionChanged", (value) => {
        reduced = value;
      });
      r.own(() => listener?.remove());
      r.hook(["Emoji", "CustomEmoji", "Avatar", "GuildIcon", "GuildBanner", "Nameplate", "RoleIcon"], (element) => {
        if (!element || reduced && r.store.respectReducedMotion) return;
        const props = {};
        for (const key of ["canAnimate", "animate", "animateEmoji", "animateGradient", "loop"]) if (typeof element.props?.[key] === "boolean") props[key] = true;
        return Object.keys(props).length ? React.cloneElement(element, props) : void 0;
      });
    }, Settings() {
      r.useRefresh();
      return h(Page, { title: "AlwaysAnimate" }, h(Toggle, { setting: "respectReducedMotion", label: "Respect Reduce Motion" }), h(Text, null, "Enables existing animation props on supported emoji, avatar and profile components. Native-rendered chat is unaffected."));
    } };
  }
  AlwaysAnimate.defaults = { respectReducedMotion: true };
  function BlurNsfw(r) {
    const { h, React, RN } = r, { Page, Text, Button, Toggle } = ui(r), Gate = React.createContext(false);
    function Media({ original }) {
      const nested = React.useContext(Gate), [shown, reveal] = React.useState(false);
      if (nested) return original;
      return h(Gate.Provider, { value: true }, h(RN.View, null, shown ? original : h(RN.View, { style: { height: 100, justifyContent: "center", padding: 12 } }, h(Text, null, "Sensitive media hidden")), h(Button, { text: shown ? "Hide sensitive media" : "Reveal sensitive media", variant: "secondary", onPress: () => reveal((v) => !v) })));
    }
    return { start() {
      r.hook(["MessageImage", "MessageVideo", "MessageAttachment", "ImageAttachment", "VideoAttachment"], (element) => {
        const p = element?.props || {}, a = p.attachment;
        if (a && !/^(image|video)\//.test(a.content_type || a.contentType || "") && !/\.(png|jpe?g|gif|webp|mp4|mov)$/i.test(a.filename || "")) return;
        const channel = p.channel || r.byStore("ChannelStore")?.getChannel?.(p.channelId || p.channel_id || p.message?.channel_id || p.message?.channelId);
        if (r.store.blurAllChannels || channel?.nsfw) return h(Media, { original: element });
      });
    }, Settings() {
      r.useRefresh();
      return h(Page, { title: "BlurNSFW" }, h(Toggle, { setting: "blurAllChannels", label: "Hide media in every channel" }), h(Text, null, "Mobile uses a tap-to-reveal cover. Native chat rows without JSX hooks cannot be covered; do not rely on this as a content filter."));
    } };
  }
  BlurNsfw.defaults = { blurAllChannels: false };
  function appLink(value) {
    try {
      const u = new URL(value);
      if (u.protocol !== "https:" || u.username || u.password) return null;
      if (u.hostname === "open.spotify.com" && /^\/(?:intl-[a-z-]+\/)?(?:track|album|artist|playlist|episode|show)\/[A-Za-z0-9]+\/?$/.test(u.pathname)) return "spotify:" + u.pathname.replace(/^\/(?:intl-[a-z-]+\/)?/, "").replace(/\/$/, "").replace("/", ":");
      if (["store.steampowered.com", "steamcommunity.com"].includes(u.hostname)) return "steam://openurl/" + u.href;
      if (u.hostname === "tidal.com" && /^\/browse\/(track|album|artist|playlist)\/[\w-]+\/?$/.test(u.pathname)) return "tidal://" + u.pathname.slice(8);
      if (u.hostname === "music.apple.com") return "musics://" + u.host + u.pathname + u.search;
      if (u.hostname === "t.me" && /^\/[A-Za-z][\w]{4,}\/?$/.test(u.pathname)) return "tg://resolve?domain=" + encodeURIComponent(u.pathname.slice(1).replace(/\/$/, ""));
    } catch {
    }
    return null;
  }
  function OpenInApp(r) {
    const { h } = r, { Page, Text, Toggle } = ui(r);
    return { start() {
      addUrlHandler(r, 10, (url, fallback) => {
        const app = appLink(url);
        if (!r.store.enabled || !app) return false;
        Promise.resolve(r.RN.Linking.canOpenURL(app)).then(async (supported) => {
          if (!r.active) return;
          if (supported) {
            try {
              await openExternal(r, app);
              return;
            } catch {
            }
          }
          fallback();
        }).catch(() => r.active && fallback());
        return true;
      });
    }, Settings() {
      r.useRefresh();
      return h(Page, { title: "OpenInApp" }, h(Toggle, { setting: "enabled", label: "Open supported links in their app" }), h(Text, null, "Spotify, Steam, Tidal, Apple Music and public Telegram usernames. Falls back when an app is unavailable. SpotifyPreview takes priority. iOS scheme allowlists may limit detection."));
    } };
  }
  OpenInApp.defaults = { enabled: true };
  function OnePingPerDM(r) {
    const { h } = r, { Page, Text } = ui(r);
    return { start() {
    }, Settings() {
      return h(Page, { title: "OnePingPerDM \xB7 compatibility probe" }, h(Text, null, "Port blocked: no verified message-aware mobile notification sound hook."), h(Text, { muted: true }, "The desktop unread/mention policy is ported and tested, but is not attached to live audio. Messages and notifications are left intact."));
    } };
  }

  // OnePingPerDM.entry.js
  register({ "id": "mime.onepingperdm", "name": "OnePingPerDM", "description": "Compatibility probe: message-aware native audio hook still required.", "version": "1.0.0", "authors": [{ "name": "ProffDea", "id": "609329952180928513" }, { "name": "Mime | N0_.q3", "id": "957164619061932045" }], "license": "GPL-3.0-or-later", "source": "https://github.com/xMimiez/Snow-Plugins/tree/main/OnePingPerDM", "capabilities": ["ui"], "dependencies": [] }, OnePingPerDM);
})();
