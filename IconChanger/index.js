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

  // IconChanger.entry.js
  var IconChanger_entry_exports = {};
  __export(IconChanger_entry_exports, {
    default: () => IconChanger_entry_default
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

  // project:src/plugins/icon-catalog.json
  var icon_catalog_default = ["AccessibilityIcon", "AchievementsIcon", "AnalyticsIcon", "AnnouncementsIcon", "AnnouncementsLockIcon", "AnnouncementsSpoilerIcon", "AnnouncementsWarningIcon", "AppleNeutralIcon", "AppsIcon", "ArrowAngleLeftUpIcon", "ArrowAngleRightUpIcon", "ArrowLargeLeftIcon", "ArrowLargeUpIcon", "ArrowSmallDownIcon", "ArrowSmallLeftIcon", "ArrowSmallRightIcon", "ArrowSmallUpIcon", "ArrowsUpDownIcon", "AtIcon", "AttachmentIcon", "BackspaceIcon", "BattlenetNeutralIcon", "BeakerIcon", "BellIcon", "BellSlashIcon", "BellZIcon", "BicycleIcon", "BillIcon", "BlueskyNeutralIcon", "BookCheckIcon", "BookmarkIcon", "BookmarkOutlineIcon", "BoostGemIcon", "BoostGemOutlineIcon", "BoostGemSlashIcon", "BoostTier1Icon", "BoostTier2Icon", "BoostTier3Icon", "BugIcon", "BurgerIcon", "CalendarIcon", "CalendarMinusIcon", "CalendarPlusIcon", "CameraIcon", "CarIcon", "ChannelListIcon", "ChannelListMagnifyingGlassIcon", "ChannelNotificationIcon", "ChannelsFollowedIcon", "ChatArrowRightIcon", "ChatCheckIcon", "ChatDotsIcon", "ChatIcon", "ChatMarkUnreadIcon", "ChatPlusIcon", "ChatSmileIcon", "ChatWarningIcon", "ChatXIcon", "CheckmarkLargeBoldIcon", "CheckmarkLargeIcon", "CheckmarkSmallBoldIcon", "CheckmarkSmallIcon", "ChevronLargeDownIcon", "ChevronLargeLeftIcon", "ChevronLargeRightIcon", "ChevronLargeUpIcon", "ChevronSmallDownIcon", "ChevronSmallRightIcon", "ChevronSmallUpIcon", "CircleCheckIcon", "CircleErrorIcon", "CircleInformationIcon", "CircleMinusIcon", "CirclePlayIcon", "CirclePlusIcon", "CircleQuestionIcon", "CircleXIcon", "ClipboardCheckIcon", "ClipboardListIcon", "ClipsIcon", "ClockIcon", "ClockWarningIcon", "ClockXIcon", "ClosedCaptionsOutlineIcon", "CloudIcon", "ClydeIcon", "CompassIcon", "ConnectionFineIcon", "ConnectionUnknownIcon", "CopyIcon", "CreditCardIcon", "CrownIcon", "DenyIcon", "DiceIcon", "DoorEnterIcon", "DoorExitIcon", "DoubleCheckmarkIcon", "DownloadIcon", "DragIcon", "EducationIcon", "EmbedIcon", "EnvelopeIcon", "EpicGamesNeutralIcon", "ExperimentalGameControllerLinkIcon", "EyeDropperIcon", "EyeIcon", "EyeSlashIcon", "FacebookNeutralIcon", "FileIcon", "FileUpIcon", "FileWarningIcon", "FiltersHorizontalIcon", "FireIcon", "FlagIcon", "FlashIcon", "FolderIcon", "FolderPlusIcon", "FoodIcon", "ForumIcon", "ForumLockIcon", "ForumSpoilerIcon", "ForumWarningIcon", "FriendsIcon", "FullscreenEnterIcon", "GameControllerIcon", "GifIcon", "GiftIcon", "GlobeEarthIcon", "GoogleNeutralIcon", "GridSquareIcon", "GroupArrowDownIcon", "GroupIcon", "GroupPlusIcon", "HammerIcon", "HandRequestDenyIcon", "HandRequestSpeakIcon", "HandRequestSpeakListIcon", "HashmarkIcon", "HeadphonesDenyIcon", "HeadphonesIcon", "HeadphonesSlashIcon", "HeartIcon", "HeartOutlineIcon", "HomeIcon", "HourglassIcon", "HubIcon", "IdCardIcon", "IdIcon", "ImageFileIcon", "ImageIcon", "ImageLockIcon", "ImagePlusIcon", "ImageSparkleIcon", "ImageTextIcon", "ImageWarningIcon", "ImagesIcon", "InboxIcon", "InstagramNeutralIcon", "InventoryIcon", "KeyIcon", "KeyboardIcon", "LanguageIcon", "LaptopPhoneIcon", "LettersIcon", "LightbulbIcon", "LinkExternalMediumIcon", "LinkExternalSmallIcon", "LinkIcon", "ListBulletsIcon", "ListViewIcon", "LocationIcon", "LockIcon", "LockUnlockedIcon", "MagicDoorIcon", "MagicWandIcon", "MagnifyingGlassIcon", "MedalIcon", "MenuIcon", "MicrophoneArrowRightIcon", "MicrophoneDenyIcon", "MicrophoneIcon", "MicrophoneSlashIcon", "MinecraftNeutralIcon", "MobilePhoneIcon", "MobilePhoneSettingsIcon", "MobilePhoneShareIcon", "ModerationIcon", "MoreHorizontalIcon", "MoreVerticalIcon", "MusicIcon", "MusicSlashIcon", "NatureIcon", "NewUserIcon", "NewUserSimpleIcon", "NintendoSwitchNeutralIcon", "NitroWheelIcon", "ObjectIcon", "OrbsIcon", "PaintPaletteIcon", "PaintbrushThinIcon", "PaperIcon", "PaperPlusIcon", "PauseIcon", "PawPrintIcon", "PencilIcon", "PencilSparkleIcon", "PhoneCallIcon", "PhoneHangUpIcon", "PhoneIcon", "PiggyBankIcon", "PinIcon", "PlayIcon", "PlaystationNeutralIcon", "PlusLargeIcon", "PlusMediumIcon", "PlusSmallIcon", "PollsIcon", "PuzzlePieceIcon", "QrCodeIcon", "QuestsIcon", "QuoteIcon", "ReactionIcon", "RecordPlayerIcon", "RedditNeutralIcon", "RedoIcon", "RefreshIcon", "RetryIcon", "RibbonIcon", "RiotGamesNeutralIcon", "RobloxNeutralIcon", "RobotIcon", "ScienceIcon", "ScreenArrowIcon", "ScreenIcon", "ScreenStreamIcon", "ScreenXIcon", "SendMessageIcon", "ServerGridIcon", "ServerIcon", "SettingsIcon", "ShareIcon", "ShieldIcon", "ShieldLockIcon", "ShieldUserIcon", "ShopIcon", "SignPostIcon", "SlashBoxIcon", "SlashIcon", "SoundboardIcon", "SoundboardSlashIcon", "SparklesIcon", "SpeedometerIcon", "SpoilerIcon", "SpotifyNeutralIcon", "StaffBadgeIcon", "StageIcon", "StageLockIcon", "StampIcon", "StampXIcon", "StarIcon", "StarOutlineIcon", "SteamNeutralIcon", "StickerIcon", "StickerPlusIcon", "StopIcon", "SubscriptionIcon", "SuperReactionIcon", "TagIcon", "TagsIcon", "TeacupIcon", "TextControllerIcon", "TextIcon", "TextLockIcon", "TextSpoilerIcon", "TextWarningIcon", "ThemeDarkIcon", "ThemeGrayIcon", "ThemeLightIcon", "ThemeMidnightIcon", "ThreadIcon", "ThreadLockIcon", "ThreadMinusIcon", "ThreadPlusIcon", "ThumbsDownIcon", "ThumbsUpIcon", "TicketIcon", "TiktokNeutralIcon", "TimerIcon", "TopicsIcon", "TrainIcon", "TranscriptOutlineIcon", "TrashIcon", "TreehouseIcon", "TrophyIcon", "TvIcon", "TwitchNeutralIcon", "TwitterNeutralIcon", "UndoIcon", "UnknownGameIcon", "UnsendIcon", "UploadIcon", "UserCheckIcon", "UserCircleIcon", "UserClockIcon", "UserIcon", "UserMinusIcon", "UserPlatformIcon", "UserPlusIcon", "UserSquareIcon", "VideoIcon", "VideoSelfieIcon", "VideoSlashIcon", "VoiceLockIcon", "VoiceNormalIcon", "VoiceNormalSpoilerIcon", "VoiceWarningIcon", "VoiceXIcon", "VrHeadsetIcon", "WarningIcon", "WaveformIcon", "WebhookIcon", "WebhookPlusIcon", "WindowLaunchIcon", "WrenchIcon", "XLargeBoldIcon", "XLargeIcon", "XNeutralIcon", "XSmallBoldIcon", "XSmallIcon", "XboxNeutralIcon", "YoutubeNeutralIcon"];

  // project:src/plugins/icon-changer.js
  var THEME_URL = "https://raw.githubusercontent.com/xMimiez/Snow-Themes/refs/heads/main/DarkPlus/DarkPlus-mobile.json";
  var THEME_ICON_KEYS = [
    "ic_radio_circle_checked",
    "ic_radio_circle_checked__overlay",
    "ic_radio_square_checked_24px",
    "ic_radio_square_checked_24px__overlay",
    "ic_selection_checked_24px",
    "ic_selection_checked_24px__overlay",
    "ic_star_filled",
    "img_guild_folder",
    "StatusOnline",
    "StatusIdle",
    "StatusDND",
    "StatusOffline",
    "StatusMobileOnline",
    "ic_send",
    "ic_send__overlay",
    "ShopIcon",
    "PencilIcon",
    "SettingsIcon",
    "MagnifyingGlassIcon",
    "search",
    "MoreHorizontalIcon",
    "NitroWheelIcon"
  ];
  var GROUPS = [
    { id: "search", label: "Search", names: ["search", "MagnifyingGlassIcon", "ChannelListMagnifyingGlassIcon"] },
    { id: "unread", label: "Unread messages", names: ["ChatMarkUnreadIcon", "InboxIcon", "ChatDotsIcon", "ChatIcon"] },
    { id: "friends", label: "Add friends", names: ["UserPlusIcon", "FriendsIcon", "GroupPlusIcon", "NewUserIcon"] },
    { id: "plus", label: "+ / Add", names: ["PlusSmallIcon", "PlusMediumIcon", "PlusLargeIcon", "CirclePlusIcon", "ChatPlusIcon"] },
    { id: "settings", label: "Settings icons", names: ["SettingsIcon", "WrenchIcon", "UserIcon", "ShieldIcon", "BellIcon", "GiftIcon", "NitroWheelIcon", "LanguageIcon", "LockIcon", "CircleInformationIcon"] },
    { id: "send", label: "Send", names: ["ic_send", "ic_send__overlay", "SendMessageIcon"] },
    { id: "status", label: "Status dots", names: ["StatusOnline", "StatusIdle", "StatusDND", "StatusOffline", "StatusMobileOnline"] }
  ];
  var PRESET_COLORS = ["#BB86FC", "#CDAEF3", "#5865F2", "#212121", "#EDEDED", "#81C995", "#E2C06A", "#CF6679", "#6A6A6A"];
  function isHex(value) {
    return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(String(value || "").trim());
  }
  function isCatalogIcon(name) {
    return typeof name === "string" && /Icon$/.test(name) && !name.includes("__");
  }
  function findPlusIcons(r) {
    const seen = /* @__PURE__ */ new Set();
    const bags = [];
    const add = (value) => {
      if (value && typeof value === "object" && !seen.has(value)) {
        seen.add(value);
        bags.push(value);
      }
    };
    add(r.B?.themes);
    add(r.B?.managers?.themes);
    add(r.host?.themes);
    add(r.B?.api?.themes);
    add(typeof globalThis !== "undefined" && globalThis.snow?.themes);
    add(r.find("getCurrentTheme"));
    add(r.find("iconpack"));
    add(r.find("plus", "semanticColors"));
    add(r.find("icons", "iconpack"));
    for (const bag of bags) {
      const theme = typeof bag.getCurrentTheme === "function" ? bag.getCurrentTheme() : bag.currentTheme || bag.theme || bag.data || bag;
      const plus = theme?.plus || theme?.data?.plus || theme?.icons && theme;
      if (plus?.icons && typeof plus.icons === "object") return plus.icons;
      if (bag.icons && typeof bag.icons === "object" && (bag.iconpack != null || bag.version != null)) return bag.icons;
    }
    return null;
  }
  function IconChanger(r) {
    const { h, React, RN, C, D } = r, { Page, Text, Button, Input, Toggle } = ui(r);
    const nameSet = new Set(THEME_ICON_KEYS.concat(icon_catalog_default));
    let names = [...nameSet];
    let plusIcons = null;
    const idToName = /* @__PURE__ */ new Map();
    function stored() {
      return r.store.icons && typeof r.store.icons === "object" ? r.store.icons : {};
    }
    function customFor(name) {
      if (!name) return null;
      const map = stored();
      if (map[name]?.color || map[name]?.image) return map[name];
      if (isHex(r.store.globalColor) && (THEME_ICON_KEYS.includes(name) || isCatalogIcon(name))) return { color: r.store.globalColor };
      return null;
    }
    function writeTheme(name, color) {
      if (!plusIcons) plusIcons = findPlusIcons(r);
      if (!plusIcons || typeof plusIcons !== "object") return false;
      try {
        if (color) plusIcons[name] = color;
        else delete plusIcons[name];
        return true;
      } catch {
        return false;
      }
    }
    function applyAllToTheme() {
      plusIcons = findPlusIcons(r) || plusIcons;
      if (!plusIcons) return 0;
      let n = 0;
      if (isHex(r.store.globalColor)) {
        for (const name of nameSet) {
          if (stored()[name]?.color) continue;
          if (writeTheme(name, r.store.globalColor)) n++;
        }
      }
      for (const [name, custom] of Object.entries(stored())) {
        if (custom?.color && writeTheme(name, custom.color)) n++;
      }
      return n;
    }
    function setCustom(name, next) {
      const map = { ...stored() };
      if (!next || !next.color && !next.image) delete map[name];
      else map[name] = next;
      r.set("icons", map);
      writeTheme(name, next?.color || null);
      applyAllToTheme();
    }
    function sourceId(source) {
      if (typeof source === "number" && Number.isFinite(source)) return source;
      if (Array.isArray(source) && typeof source[0] === "number") return source[0];
      return null;
    }
    function applyImage(element) {
      if (!r.store.enabled || !element?.props || element.props.__mimeIcon) return;
      const id = sourceId(element.props.source);
      if (id == null) return;
      let name = idToName.get(id);
      if (!name) {
        const asset = r.B.assets?.findAsset?.(id) || r.B.assets?.getAssetByID?.(id);
        name = asset?.name;
        if (name) idToName.set(id, name);
      }
      const custom = customFor(name);
      if (!custom?.color && !custom?.image) return;
      if (custom.image) return React.cloneElement(element, { source: { uri: custom.image }, __mimeIcon: true });
      return React.cloneElement(element, { style: [{ tintColor: custom.color }, element.props.style], tintColor: custom.color, __mimeIcon: true });
    }
    function Preview({ name, size = 24 }) {
      const custom = customFor(name);
      if (isCatalogIcon(name) && C.Icon) return h(C.Icon, { name, size, color: custom?.color, accessible: false });
      return h(RN.View, { style: { width: size, height: size, borderRadius: 4, backgroundColor: (custom?.color || "#5865F2") + "33" } });
    }
    function ColorEditor({ title, names: keys, close }) {
      const [color, setColor] = React.useState("");
      return h(
        Page,
        { title, close },
        h(Text, { muted: true }, "Writes into the active theme plus.icons map (same keys Dark+ uses)."),
        h(Text, { muted: true }, keys.join(", ")),
        h(Input, { value: color, onChange: setColor, placeholder: "#BB86FC", autoCapitalize: "none" }),
        h(
          RN.View,
          { style: { flexDirection: "row", flexWrap: "wrap" } },
          PRESET_COLORS.map((hex) => h(RN.Pressable, {
            key: hex,
            onPress: () => setColor(hex),
            style: { width: 28, height: 28, borderRadius: 14, backgroundColor: hex, margin: 4, borderWidth: 1, borderColor: "#ffffff55" }
          }))
        ),
        h(Button, { text: "Apply", onPress: () => {
          if (!isHex(color)) return r.toast("Enter a hex color");
          for (const name of keys) setCustom(name, { color: color.trim() });
          r.toast("Applied " + title);
          close();
        } }),
        h(Button, { text: "Reset", variant: "secondary", onPress: () => {
          for (const name of keys) setCustom(name, null);
          close();
        } })
      );
    }
    function Settings() {
      r.useRefresh();
      const [query, setQuery] = React.useState("");
      const q = query.trim().toLowerCase();
      const filtered = names.filter((name) => !q || name.toLowerCase().includes(q));
      const themeKeys = THEME_ICON_KEYS.filter((name) => !q || name.toLowerCase().includes(q));
      return h(
        Page,
        { title: "Icon Changer" },
        h(Toggle, { setting: "enabled", label: "Enable icon overrides", subLabel: "Writes colors into theme plus.icons so Snow\u2019s recolorer applies them" }),
        h(Button, { text: "Re-apply onto current theme", variant: "secondary", onPress: () => {
          plusIcons = findPlusIcons(r);
          const n = applyAllToTheme();
          r.toast(plusIcons ? `Wrote ${n} keys into plus.icons` : "Could not find the live plus.icons map");
        } }),
        h(Text, null, "Tint all listed icons"),
        h(Input, { value: r.store.globalColor || "", onChange: (text) => {
          r.set("globalColor", text);
          applyAllToTheme();
        }, placeholder: "#BB86FC", autoCapitalize: "none" }),
        h(
          RN.View,
          { style: { flexDirection: "row", flexWrap: "wrap" } },
          PRESET_COLORS.map((hex) => h(RN.Pressable, {
            key: hex,
            onPress: () => {
              r.set("globalColor", hex);
              applyAllToTheme();
            },
            style: { width: 28, height: 28, borderRadius: 14, backgroundColor: hex, margin: 4, borderWidth: 1, borderColor: "#ffffff55" }
          }))
        ),
        D.TableRowGroup ? h(
          D.TableRowGroup,
          { title: "Dark+ plus.icons keys" },
          GROUPS.map((group) => h(D.TableRow, {
            key: group.id,
            label: group.label,
            subLabel: group.names.join(", "),
            icon: C.RowIcon && isCatalogIcon(group.names.find(isCatalogIcon) || "") ? h(C.RowIcon, { name: group.names.find(isCatalogIcon) }) : void 0,
            onPress: () => r.open("group-" + group.id, ColorEditor, { title: group.label, names: group.names })
          }))
        ) : null,
        h(Input, { value: query, onChange: setQuery, placeholder: "Search icon keys", autoCapitalize: "none" }),
        D.TableRowGroup ? h(
          D.TableRowGroup,
          { title: `Theme keys (${themeKeys.length})` },
          themeKeys.map((name) => h(D.TableRow, {
            key: name,
            label: name,
            subLabel: customFor(name)?.color || "theme / default",
            icon: C.RowIcon && isCatalogIcon(name) ? h(C.RowIcon, { name }) : void 0,
            onPress: () => r.open("edit-" + name, ColorEditor, { title: name, names: [name] })
          }))
        ) : null,
        h(Text, { muted: true }, `${filtered.length} total keys. Dark+ recolors: ${THEME_ICON_KEYS.join(", ")}.`)
      );
    }
    return {
      async start() {
        try {
          const theme = (await r.request(THEME_URL, {}, 15e3, 2e5)).json();
          const fromTheme = theme?.plus?.icons && typeof theme.plus.icons === "object" ? Object.keys(theme.plus.icons) : [];
          fromTheme.forEach((n) => nameSet.add(n));
        } catch {
        }
        try {
          if (typeof r.B.assets?.iterateAssets === "function") {
            for (const asset of r.B.assets.iterateAssets()) {
              if (asset?.name && asset.id != null) {
                idToName.set(Number(asset.id), asset.name);
                if (isCatalogIcon(asset.name) || /^ic_/.test(asset.name)) nameSet.add(asset.name);
              }
            }
          }
        } catch {
        }
        names = [...nameSet];
        plusIcons = findPlusIcons(r);
        applyAllToTheme();
        r.patch("after", React, "createElement", (args, result) => {
          if (!r.store.enabled || !result?.props || result.props.__mimeIcon) return;
          const type = args[0];
          const Img = RN.Image;
          const isImage = type === Img || type === "RCTImageView" || type?.displayName === "Image" || type?.name === "Image";
          if (!isImage) return;
          return applyImage(result);
        });
      },
      Settings
    };
  }
  IconChanger.defaults = { enabled: true, icons: {}, globalColor: "" };

  // IconChanger.entry.js
  var IconChanger_entry_default = register({ "id": "mime.iconchanger", "name": "IconChanger", "description": "Recolor or replace Discord icons. Plugin overrides win over theme plus.icons.", "version": "1.0.6", "authors": [{ "name": "Mime | N0_.q3", "id": "957164619061932045" }], "license": "MIT", "source": "https://github.com/xMimiez/Snow-Plugins/tree/main/IconChanger" }, IconChanger);
  return __toCommonJS(IconChanger_entry_exports);
})();
