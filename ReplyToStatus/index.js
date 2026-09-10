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

  // ReplyToStatus.entry.js
  var ReplyToStatus_entry_exports = {};
  __export(ReplyToStatus_entry_exports, {
    default: () => ReplyToStatus_entry_default
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

  // project:src/plugins/reply-to-status.js
  function normalizeStatus(value) {
    if (!value) return null;
    const status = Array.isArray(value) ? value.find((a) => a?.type === 4 || a?.name === "Custom Status") : value;
    if (!status) return null;
    const emoji = status.emoji || {};
    const text = status.state || status.text || "";
    const id = emoji.id || status.emojiId || status.emoji_id;
    const name = emoji.name || status.emojiName || status.emoji_name || "";
    return text || id || name ? { text, emojiId: id, emojiName: name, animated: !!(emoji.animated || status.emojiAnimated) } : null;
  }
  function statusParts(status) {
    const result = [];
    if (status.emojiId) result.push({ id: status.emojiId, name: status.emojiName || "emoji", animated: status.animated });
    else if (status.emojiName) result.push({ text: status.emojiName + " " });
    const pattern = /<(a?):([^:>]+):(\d+)>|<(\d{16,22})>/g;
    let offset = 0;
    for (const match of status.text.matchAll(pattern)) {
      if (match.index > offset) result.push({ text: status.text.slice(offset, match.index) });
      result.push({ id: match[3] || match[4], name: match[2] || "emoji", animated: match[1] === "a" });
      offset = match.index + match[0].length;
    }
    if (offset < status.text.length) result.push({ text: status.text.slice(offset) });
    return result;
  }
  function ReplyToStatus(r) {
    const { h, React, RN } = r;
    const { Text, Button, Page, Input } = ui(r);
    const GateContext = React.createContext(false);
    const owners = /* @__PURE__ */ new Map();
    let dismiss = null;
    let sending = false;
    function Emoji({ part }) {
      const [failed, fail] = React.useState(false);
      if (failed || !RN.Image) return h(Text, null, ":" + part.name + ":");
      return h(RN.Image, {
        source: { uri: `https://cdn.discordapp.com/emojis/${part.id}.${part.animated ? "gif" : "png"}?size=48&quality=lossless` },
        accessibilityLabel: part.name,
        style: { width: 22, height: 22 },
        onError: () => fail(true)
      });
    }
    function Quote({ status }) {
      return h(
        RN.View,
        { style: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 } },
        statusParts(status).map((part, i) => part.id ? h(Emoji, { key: i, part }) : h(Text, { key: i }, part.text))
      );
    }
    function Composer({ userId, status, close }) {
      const [draft, setDraft] = React.useState("");
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState("");
      const mounted = React.useRef(true);
      React.useEffect(() => {
        mounted.current = true;
        return () => {
          mounted.current = false;
          dismiss = null;
        };
      }, []);
      const onClose = () => {
        dismiss = null;
        close();
      };
      async function send(value) {
        if (sending || !value.trim()) return;
        sending = true;
        setBusy(true);
        setError("");
        try {
          const dm = (await r.discord("/users/@me/channels", { method: "POST", body: JSON.stringify({ recipient_id: userId }) })).json();
          if (!dm?.id) throw new Error("Discord did not return a DM channel");
          const emoji = status.emojiId ? `<${status.animated ? "a" : ""}:${status.emojiName || "emoji"}:${status.emojiId}>` : status.emojiName;
          const quote = [emoji, status.text].filter(Boolean).join(" ").replace(/\r?\n/g, "\n> ");
          const content = `> ${quote}
${value.trim()}`;
          if (content.length > 2e3) throw new Error("Reply and status together must be under 2,000 characters");
          await r.discord(`/channels/${dm.id}/messages`, { method: "POST", body: JSON.stringify({ content, allowed_mentions: { parse: [] } }) });
          r.toast("Reply sent");
          if (mounted.current && r.active) onClose();
        } catch (e) {
          if (mounted.current && r.active) setError(e.message);
        } finally {
          sending = false;
          if (mounted.current && r.active) setBusy(false);
        }
      }
      return h(
        Page,
        { title: "Reply to Status", close: onClose },
        h(Quote, { status }),
        h(Input, { label: "Your reply", placeholder: "Write a reply\u2026", value: draft, onChange: setDraft, editable: !busy, multiline: true }),
        h(RN.View, { style: { flexDirection: "row", flexWrap: "wrap", gap: 8 } }, ["\u{1F44D}", "\u2764\uFE0F", "\u{1F602}", "\u{1F525}", "\u{1F389}", "\u{1F62E}"].map((emoji) => h(Button, { key: emoji, text: emoji, variant: "secondary", disabled: busy, accessibilityLabel: `Reply ${emoji}`, onPress: () => void send(emoji) }))),
        error ? h(Text, null, error) : null,
        h(Button, { text: busy ? "Sending\u2026" : "Send reply", disabled: busy || !draft.trim(), onPress: () => void send(draft) })
      );
    }
    function open(userId, status) {
      if (dismiss) return;
      try {
        dismiss = r.open("composer", Composer, { userId, status });
      } catch (error) {
        dismiss = null;
        r.error("Open reply", error);
      }
    }
    function ProfileGate({ children, userId, status }) {
      const parentOwns = React.useContext(GateContext);
      const me = r.byStore("UserStore")?.getCurrentUser?.();
      r.useRefresh();
      const token = React.useRef({}).current;
      const eligible = !parentOwns && !!userId && !!status && userId !== me?.id;
      React.useEffect(() => {
        if (!eligible) return;
        const set = owners.get(userId) || /* @__PURE__ */ new Set();
        owners.set(userId, set);
        set.add(token);
        r.changed();
        return () => {
          set.delete(token);
          if (!set.size) owners.delete(userId);
          r.changed();
        };
      }, [eligible, userId]);
      const owns = eligible && owners.get(userId)?.values().next().value === token;
      if (!owns) return children;
      return h(GateContext.Provider, { value: true }, h(
        RN.View,
        { style: { flexShrink: 1 } },
        children,
        h(RN.View, { style: { paddingHorizontal: 16, paddingVertical: 8 } }, h(Button, {
          text: "Reply to Status",
          variant: "secondary",
          accessibilityLabel: "Reply to Status",
          onPress: () => open(userId, status)
        }))
      ));
    }
    return {
      start() {
        function wrap(element) {
          const p = element?.props || {};
          if (p.__mimeReplyWrapped) return;
          const userId = p.userId || p.user?.id || p.displayProfile?.userId || p.displayProfile?.user?.id;
          if (!userId) return;
          const presence = r.byStore("PresenceStore");
          const status = normalizeStatus(p.customStatus || p.activity || p.activities || p.status || presence?.getActivities?.(userId) || presence?.getStatus?.(userId));
          if (!status) return;
          return h(ProfileGate, { userId, status, key: element.key }, r.React.cloneElement(element, { __mimeReplyWrapped: true }));
        }
        r.hook([
          "UserProfileActionSheet",
          "UserProfile",
          "UserProfileModal",
          "UserProfileHeader",
          "UserProfileCustomStatus",
          "ProfileCustomStatus",
          "UserProfileSheet",
          "ProfileActionSheet",
          "UserProfileContainer",
          "PrimaryUserProfile",
          "DisplayProfile",
          "OverlayProfile",
          "UserProfileCard"
        ], wrap);
        r.patch("after", r.React, "createElement", (args, result) => {
          if (!r.active || !result?.props) return;
          const type = args[0];
          const name = typeof type === "string" ? type : type?.displayName || type?.name || "";
          if (!/profile/i.test(name)) return;
          return wrap(result) ?? result;
        });
      },
      stop() {
        dismiss?.();
        dismiss = null;
        owners.clear();
      },
      Settings() {
        r.useRefresh();
        return h(
          Page,
          { title: "Reply to Status" },
          h(Text, null, "One reply button per profile. Replies are sent as a DM quoting the status; mobile does not expose a verified desktop status-reply transport."),
          h(Text, { muted: true }, "Custom emojis use Discord images, with readable names if an image fails.")
        );
      },
      ProfileGate,
      Composer,
      Quote
    };
  }

  // ReplyToStatus.entry.js
  var ReplyToStatus_entry_default = register({ "id": "mime.replytostatus", "name": "ReplyToStatus", "description": "One themed status-reply button per profile with rendered emojis.", "version": "2.2.0", "authors": [{ "name": "Mime | N0_.q3", "id": "957164619061932045" }], "license": "MIT", "source": "https://github.com/xMimiez/Snow-Plugins/tree/main/ReplyToStatus" }, ReplyToStatus);
  return __toCommonJS(ReplyToStatus_entry_exports);
})();
