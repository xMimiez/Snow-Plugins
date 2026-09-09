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
    const seen = /* @__PURE__ */ new Map(), queue = [];
    let running = false, stopped = false, started = Date.now(), waitTimer, releaseWait;
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
          try {
            for (let attempt = 0; ; attempt++) {
              try {
                await r.discord(`/entitlements/gift-codes/${item.code}/redeem`, { method: "POST", body: JSON.stringify({ channel_id: item.channelId || null }) });
                break;
              } catch (e) {
                if (e.status !== 429 || attempt >= 2 || e.retryAfter <= 0 || e.retryAfter > 120) throw e;
                stats.lastResult = `Rate limited; retrying in ${Math.ceil(e.retryAfter)}s`;
                r.changed();
                await wait(e.retryAfter * 1e3 + 100);
                if (stopped || !r.active) return;
              }
            }
            success = true;
            result = "Gift claimed";
          } catch (e) {
            result = `Claim failed: ${e.message}`;
          }
          if (stopped || !r.active) return;
          stats[success ? "claimed" : "failed"]++;
          stats.lastResult = result;
          r.changed();
          r.toast(result);
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
        if (seen.size > 4096) seen.delete(seen.keys().next().value);
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
        h(Button, { text: "Save webhook", onPress: () => {
          try {
            webhookUrl(url);
            r.set("webhookUrl", url.trim());
            r.toast("Saved");
          } catch (e) {
            r.error("Webhook", e);
          }
        } }),
        h(Button, { text: "Send test webhook", variant: "secondary", onPress: () => webhook({ content: "NitroSniper Snow webhook test" }).then(() => r.toast(r.store.webhookUrl ? "Test sent" : "Set a webhook first")).catch((e) => r.error("Webhook test", e)) }),
        h(Text, { muted: true }, "Only new live messages are processed. Timeouts are shown and never retried automatically. Desktop callbacks are replaced by one mobile REST request.")
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
    }, stop() {
      stopped = true;
      queue.length = 0;
      clearTimeout(waitTimer);
      releaseWait?.();
    }, Settings, receive, stats };
  }
  NitroSniper.defaults = { ignoreOwnGiftLinks: false, webhookUrl: "" };

  // NitroSniper.entry.js
  register({ "id": "mime.nitrosniper", "name": "NitroSniper", "description": "Process new gift links with a deduplicated queue and visible results.", "version": "2.0.0", "authors": [{ "name": "neoarz", "id": "218675193592283137" }, { "name": "Mime | N0_.q3", "id": "957164619061932045" }], "license": "MIT", "source": "https://github.com/xMimiez/Snow-Plugins/tree/main/NitroSniper", "capabilities": ["flux", "storage", "ui"], "dependencies": [] }, NitroSniper);
})();
