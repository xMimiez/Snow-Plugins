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

  // ChannelSpoilers.entry.js
  var ChannelSpoilers_entry_exports = {};
  __export(ChannelSpoilers_entry_exports, {
    default: () => ChannelSpoilers_entry_default
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

  // project:src/plugins/channel-spoilers.js
  var SNOWFLAKE = /^\d{15,22}$/;
  var MEDIA_EXT = /\.(png|jpe?g|gif|webp|mp4|mov|webm)(\?|#|$)/i;
  var IMAGE_EXT = /\.(png|jpe?g|gif|webp)(\?|#|$)/i;
  var VIDEO_EXT = /\.(mp4|mov|webm)(\?|#|$)/i;
  var MEDIA_TYPE = /^(image|video)\//i;
  var MEDIA_KIND = /^(image|gif|gifv|video)$/i;
  var MEDIA_NAME = /MessageImage|MessageVideo|ImageAttachment|VideoAttachment|MediaAttachment|EmbedMedia|MessageMedia|GifVideo|FastImage|MediaPlayer|Mosaic|EmbedImage|EmbedVideo|EmbedThumbnail|AttachmentImage|GalleryItem|CachedImage|MediaView|InlineMedia|GifImage|LazyImage|ZoomableImage|(?:^|[^a-z])(?:Gif|Video|Image)(?:[^a-z]|$)/i;
  var SPOILER_FLAG = 8;
  function channelSnowflake(value) {
    const id = String(value ?? "").trim();
    return SNOWFLAKE.test(id) ? id : "";
  }
  function channelIdOf(props) {
    if (!props || typeof props !== "object") return "";
    const message = props.message && typeof props.message === "object" ? props.message : null;
    const value = props.channelId || props.channel_id || props.channel?.id || message?.channel_id || message?.channelId || message?.getChannelId?.() || "";
    return value == null ? "" : String(value);
  }
  function isListedChannel(channels, id) {
    const text = String(id || "");
    return !!text && Array.isArray(channels) && channels.map(String).includes(text);
  }
  function mediaType(obj) {
    return obj.content_type || obj.contentType || (typeof obj.type === "string" ? obj.type : "");
  }
  function mediaName(obj) {
    return [obj.filename, obj.name, obj.fileName, obj.url, obj.proxy_url, obj.proxyURL, obj.src, obj.uri, obj.source?.uri].filter((value) => typeof value === "string").join(" ");
  }
  function isVisualMedia(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj) || obj.props || obj.$$typeof) return false;
    const type = mediaType(obj);
    const name = mediaName(obj);
    if (typeof type === "string" && (MEDIA_TYPE.test(type) || MEDIA_KIND.test(type))) return true;
    if (MEDIA_EXT.test(name)) return true;
    const url = obj.url || obj.proxy_url || obj.proxyURL || obj.src || obj.source?.uri;
    return typeof url === "string" && /^https?:/i.test(url) && (obj.width || obj.height || obj.proxy_url || obj.proxyURL);
  }
  function attachmentRecord(item) {
    return typeof item.filename === "string" || typeof item.fileName === "string" || typeof item.content_type === "string" || typeof item.contentType === "string";
  }
  function spoilImageLinks(content) {
    if (typeof content !== "string" || !content) return content;
    return content.replace(/https?:\/\/[^\s<]+/gi, (raw, offset) => {
      let end = raw.length;
      while (end > 0 && /[),.;!?]/.test(raw[end - 1])) end -= 1;
      const url = raw.slice(0, end);
      const tail = raw.slice(end);
      const path = url.split("#")[0];
      const host = path.replace(/^https?:\/\//i, "").split("/")[0].replace(/^www\./, "");
      const imageLink = IMAGE_EXT.test(path) || !VIDEO_EXT.test(path) && /(?:^|\.)(?:tenor\.com|giphy\.com|imgur\.com)$/i.test(host);
      if (!imageLink) return raw;
      const before = content.slice(Math.max(0, offset - 2), offset);
      const after = content.slice(offset + end, offset + end + 2);
      if (before === "||" && after === "||") return raw;
      return `||${url}||${tail}`;
    });
  }
  function componentName(type) {
    if (!type || typeof type === "string") return typeof type === "string" ? type : "";
    return type.displayName || type.name || type.type?.displayName || type.type?.name || "";
  }
  function messageLike(value) {
    if (!value || typeof value !== "object" || Array.isArray(value) || value.props) return false;
    if (value.author || value.author_id || value.authorId) return true;
    if (typeof value.content === "string") return true;
    if (Array.isArray(value.attachments) || Array.isArray(value.embeds)) return true;
    return false;
  }
  function isDecorative(element) {
    const props = element?.props || {};
    if (props.attachment || props.attachments || props.media) return false;
    const name = componentName(element?.type);
    if (/Emoji|Reaction|Avatar|GuildIcon|UserIcon/i.test(name) && !MEDIA_NAME.test(name)) return true;
    if (props.emoji || props.user || props.avatar || props.guild || props.avatarUrl) return true;
    const size = typeof props.size === "number" ? props.size : typeof props.width === "number" ? props.width : typeof props.style?.width === "number" ? props.style.width : 0;
    return size > 0 && size <= 40;
  }
  function mediaPayload(props) {
    if (!props) return null;
    for (const item of [props.attachment, props.media, props.item, props.embed]) {
      if (isVisualMedia(item)) return item;
    }
    return isVisualMedia(props) ? props : null;
  }
  function markLocalSpoiler(item) {
    if (!item || typeof item !== "object" || item.props || item.$$typeof) return;
    for (const key of ["filename", "name", "fileName"]) {
      if (typeof item[key] === "string" && item[key] && !/^SPOILER_/i.test(item[key])) item[key] = "SPOILER_" + item[key];
    }
    if (typeof item.flags === "number" && Number.isFinite(item.flags)) item.flags |= SPOILER_FLAG;
    else if (typeof item.flags === "string" && /^\d+$/.test(item.flags)) item.flags = String(Number(item.flags) | SPOILER_FLAG);
    else if (item.flags == null) item.flags = SPOILER_FLAG;
    if (typeof item.spoiler === "boolean") item.spoiler = true;
    else if (typeof item.spoiler !== "string" || item.spoiler.length === 0) item.spoiler = "true";
    item.is_spoiler = true;
  }
  function spoilTree(node, channels, inherited = "", depth = 0) {
    if (depth > 12 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((item) => spoilTree(item, channels, inherited, depth + 1));
      return;
    }
    const own = channelIdOf(node);
    const channelId = channels.has(own) ? own : inherited;
    const inChannel = channels.has(channelId);
    const decorative = !!(node.avatar || node.avatarUrl || node.guildIcon || node.guild_icon) || /avatar|guildicon|usericon/i.test(String(node.type || node.component || "")) && !node.attachment && !node.attachments;
    if (inChannel && !decorative) {
      if (typeof node.content === "string") node.content = spoilImageLinks(node.content);
      const mark = (item) => {
        if (!isVisualMedia(item)) return;
        markLocalSpoiler(item);
      };
      const markGallery = (entry) => {
        if (!entry || typeof entry !== "object") return;
        mark(entry.media);
        mark(entry.file);
        mark(entry.image);
        mark(entry.thumbnail);
        if (typeof entry.spoiler === "boolean") entry.spoiler = true;
        else if ((entry.media || entry.file) && entry.spoiler == null && !attachmentRecord(entry)) entry.spoiler = true;
      };
      if (!node.attachments) mark(node);
      mark(node.attachment);
      mark(node.media);
      mark(node.image);
      mark(node.video);
      mark(node.thumbnail);
      if (Array.isArray(node.attachments)) node.attachments.forEach(mark);
      if (Array.isArray(node.embeds)) node.embeds.forEach((embed) => {
        mark(embed);
        mark(embed?.image);
        mark(embed?.video);
        mark(embed?.thumbnail);
      });
      const items = node.items || node.components;
      if (Array.isArray(items)) items.forEach(markGallery);
    }
    const nextChannel = inChannel ? channelId : inherited;
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") spoilTree(value, channels, nextChannel, depth + 1);
    }
  }
  function ChannelSpoilers(r) {
    const { h, React, RN } = r;
    const { Page, Text, Button, Input } = ui(r);
    const revealed = /* @__PURE__ */ new Set();
    const wrappedTypes = /* @__PURE__ */ new WeakMap();
    let currentChannel = "";
    let covering = false;
    function listed(id) {
      return isListedChannel(r.store.channels, id);
    }
    function SpoilerCover({ mediaId, original }) {
      const [shown, setShown] = React.useState(revealed.has(mediaId));
      if (shown) return original;
      return h(RN.Pressable, {
        testID: "mime-channel-spoiler",
        accessibilityLabel: "Spoiler",
        accessibilityRole: "button",
        onPress: () => {
          revealed.add(mediaId);
          setShown(true);
        },
        style: { minHeight: 120, borderRadius: 8, backgroundColor: "#000000cc", alignItems: "center", justifyContent: "center", padding: 12 }
      }, h(RN.Text, { style: { color: "#F2F3F5", fontSize: 16, fontWeight: "700" } }, "Spoiler"));
    }
    function trackingType(type) {
      const existing = wrappedTypes.get(type);
      if (existing) return existing;
      function TrackedMessage(props) {
        const channelId = channelIdOf(props);
        const previous = currentChannel;
        if (listed(channelId)) currentChannel = channelId;
        try {
          return type(props);
        } finally {
          currentChannel = previous;
        }
      }
      TrackedMessage.displayName = type.displayName || type.name || "Message";
      TrackedMessage.__mimeTrack = true;
      wrappedTypes.set(type, TrackedMessage);
      return TrackedMessage;
    }
    function coverElement(element) {
      if (!element?.props || element.type === SpoilerCover || element.props.original) return element;
      if (element.props.testID === "mime-channel-spoiler" || isDecorative(element)) return element;
      const fromProps = channelIdOf(element.props);
      const channelId = listed(fromProps) ? fromProps : listed(currentChannel) ? currentChannel : "";
      if (!channelId) return element;
      const payload = mediaPayload(element.props);
      const named = MEDIA_NAME.test(componentName(element.type));
      if (!payload && !named) return element;
      const mediaId = String(payload?.id || payload?.url || payload?.filename || element.props.src || element.key || channelId);
      return h(SpoilerCover, { key: element.key, mediaId, original: element });
    }
    function Settings() {
      r.useRefresh();
      const [draft, setDraft] = React.useState("");
      const channels = Array.isArray(r.store.channels) ? r.store.channels : [];
      const add = () => {
        const id = channelSnowflake(draft);
        if (!id || channels.includes(id)) return;
        r.set("channels", channels.concat(id));
        setDraft("");
      };
      const remove = (id) => r.set("channels", channels.filter((item) => item !== id));
      return h(
        Page,
        { title: "Channel Spoilers" },
        h(Input, { label: "Channel ID", value: draft, onChange: setDraft, placeholder: "Channel ID" }),
        h(Button, { text: "Add", onPress: add }),
        h(
          RN.View,
          { testID: "mime-channel-table" },
          channels.length ? channels.map((id) => h(RN.View, {
            key: id,
            testID: "mime-spoiler-channel-" + id,
            style: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }
          }, h(Text, null, id), h(Button, { text: "Remove " + id, variant: "secondary", onPress: () => remove(id) }))) : h(Text, { muted: true }, "No channels yet.")
        ),
        h(Text, { muted: true }, "Images, GIFs, and videos in these channels are covered on this device until you tap them. Other people still see the files.")
      );
    }
    return {
      Settings,
      start() {
        r.patch("after", React, "createElement", (args, result) => {
          if (covering || !r.active || !result?.props) return;
          const type = args?.[0];
          const props = args?.[1];
          const render = typeof type === "function" && !type.prototype?.isReactComponent && !type.__mimeTrack ? type : null;
          if (render && messageLike(props?.message) && listed(channelIdOf(props))) {
            covering = true;
            try {
              return React.createElement(trackingType(render), props, ...args.slice(2));
            } finally {
              covering = false;
            }
          }
          covering = true;
          try {
            const covered = coverElement(result);
            return covered === result ? void 0 : covered;
          } finally {
            covering = false;
          }
        });
        const spoilRows = (rows) => {
          const channels = Array.isArray(r.store.channels) ? r.store.channels : [];
          if (!channels.length || rows == null) return rows;
          const next = JSON.parse(JSON.stringify(rows));
          spoilTree(next, new Set(channels.map(String)));
          return next;
        };
        r.patchRows(spoilRows);
        const messages = r.byStore("MessageStore") || r.find("getMessages", "getMessage") || r.find("getMessages");
        const listedSet = () => new Set((Array.isArray(r.store.channels) ? r.store.channels : []).map(String));
        const spoilStored = (value) => {
          const channels = listedSet();
          if (!channels.size || value == null) return;
          try {
            spoilTree(value, channels);
          } catch {
          }
        };
        if (typeof messages?.getMessages === "function") {
          r.patch("after", messages, "getMessages", (_args, result) => {
            if (r.active) spoilStored(result);
          });
        }
        if (typeof messages?.getMessage === "function") {
          r.patch("after", messages, "getMessage", (_args, result) => {
            if (r.active) spoilStored(result);
          });
        }
        r.status.channels = Array.isArray(r.store.channels) ? r.store.channels.length : 0;
      }
    };
  }
  ChannelSpoilers.defaults = { channels: [] };

  // ChannelSpoilers.entry.js
  var ChannelSpoilers_entry_default = register({ "id": "mime.channelspoilers", "name": "Channel Spoilers", "description": "Covers images, GIFs, and videos in chosen channels on this device.", "version": "1.0.3", "authors": [{ "name": "Mime | N0_.q3", "id": "957164619061932045" }], "license": "MIT", "source": "https://github.com/xMimiez/Snow-Plugins/tree/main/ChannelSpoilers" }, ChannelSpoilers);
  return __toCommonJS(ChannelSpoilers_entry_exports);
})();
