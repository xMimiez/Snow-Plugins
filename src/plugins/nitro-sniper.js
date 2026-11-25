// NitroSniper — Snow SDK port of neoarz/NitroSniper (MIT).
// Claim cycle: queue gift link -> redeem (native ladder + REST fallback) ->
// auto-press the Accept/Confirm button of the gift sheet and hCaptcha's mobile
// human-verification interstitial -> toasts at every stage.
import { ui } from "../runtime.js";
import { captchaErrorInfo, createCaptchaSolver } from "./captcha.js";
export function giftCodes(text) {
    return [...new Set(Array.from(String(text || "").matchAll(/(?:https?:\/\/)?(?:www\.)?(?:discord\.gift\/|discord(?:app)?\.com\/gifts\/)([A-Za-z0-9]{16,24})(?![A-Za-z0-9])/g), (m) => m[1]))];
}
export function webhookUrl(value) {
    if (!String(value || "").trim()) return null;
    const u = new URL(String(value).trim());
    if (u.protocol !== "https:" || !["discord.com", "canary.discord.com", "ptb.discord.com"].includes(u.hostname) || !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[\w-]+\/?$/.test(u.pathname) || u.username || u.password) throw new Error("Use a Discord HTTPS webhook URL");
    return u.href;
}

function NitroSniper(r) {    const { h, React } = r, { Page, Text, Button, Input, Toggle } = ui(r);
    const solver = createCaptchaSolver(r, React);
    const seen = new Map(), queue = [];
    let running = false, stopped = false, started = Date.now(), waitTimer, releaseWait;

    // Match committed buttons inside the two known sheets, not similarly named
    // handlers on unrelated dialogs or elements that React hasn't mounted.
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
            armAutoPress(300000);
        }
        return result;
    });

    function findProp(target, key) {
        try {
            const d = Object.getOwnPropertyDescriptor(target, key);
            return d && "value" in d ? d.value : undefined;
        } catch { return undefined; }
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
        const hook = findProp(findProp(globalThis, "__REACT_DEVTOOLS__"), "hook")
            ?? findProp(globalThis, "__REACT_DEVTOOLS_GLOBAL_HOOK__");
        const registry = findProp(hook, "renderers");
        const getFiberRoots = findProp(hook, "getFiberRoots");
        const stats = { hook: !!hook, renderers: registry instanceof Map ? registry.size : 0, roots: 0, fibers: 0, depth: 0 };
        if (typeof getFiberRoots !== "function" || !(registry instanceof Map)) return stats;

        // Follow every committed root. An iterative walk reaches deep bottom
        // sheets without recursive calls or a cap that favors the main app.
        const stack = [];
        for (const [id] of Map.prototype.entries.call(registry)) {
            let roots;
            try { roots = Reflect.apply(getFiberRoots, hook, [id]); } catch { continue; }
            if (!(roots instanceof Set)) continue;
            for (const root of Set.prototype.values.call(roots)) {
                stack.push({ fiber: findProp(root, "current") ?? root, depth: 0 });
                stats.roots++;
            }
        }
        const seen = new Set();
        while (stack.length) {
            let { fiber, sheet, depth } = stack.pop();
            if (!fiber || typeof fiber !== "object" || seen.has(fiber)) continue;
            seen.add(fiber);
            stats.fibers++;
            stats.depth = Math.max(stats.depth, depth);
            const sibling = findProp(fiber, "sibling");
            if (sibling) stack.push({ fiber: sibling, sheet, depth });
            // React 19 Offscreen: a non-null memoized state means hidden.
            if (findProp(fiber, "tag") === 22 && findProp(fiber, "memoizedState") != null) continue;
            const resolvedName = componentName(findProp(fiber, "type"));
            const name = SHEET_RE.test(resolvedName) || BUTTON_RE.test(resolvedName)
                ? resolvedName : componentName(findProp(fiber, "elementType")) || resolvedName;
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
        return stats;
    }
    function scanReport() {
        const sheets = [], handlers = [];
        const stats = walkSheets(
            ({ name, depth }) => sheets.push(`${name}@d${depth}`),
            (sheet, name, props, depth) => {
                if (handlers.length < 24) handlers.push(`${sheet.name}: ${name || "Anonymous"}@d${depth}: ${props.onPress.name || "(anonymous)"}`);
            },
        );
        return [
            `devtools hook: ${stats.hook ? "yes" : "NO"}`,
            `renderers: ${stats.renderers}; roots: ${stats.roots}; fibers walked: ${stats.fibers}; max depth: ${stats.depth}`,
            `sheets: ${sheets.join(", ") || "none"}`,
            `onPress in sheets: ${handlers.join(", ") || "none"}`,
        ].join("\n");
    }
    const pressedSheets = new WeakSet(), loggedSheets = new WeakSet();
    const loggedHandlers = new WeakMap();
    function markSheet(set, fiber) {
        set.add(fiber);
        const alternate = findProp(fiber, "alternate");
        if (alternate) set.add(alternate);
    }
    function scanAndPress() {
        const candidates = [];
        const disabledHandlers = new Map();
        const stats = walkSheets(
            sheet => {
                if (loggedSheets.has(sheet.fiber)) return;
                markSheet(loggedSheets, sheet.fiber);
                console.log("[NitroSniper] fiber scan: entered", sheet.name, "subtree at depth", sheet.depth);
            },
            (sheet, name, props, depth) => {
                if (pressedSheets.has(sheet.fiber) || pressedSheets.has(findProp(sheet.fiber, "alternate"))) return;
                const handler = String(props.onPress.name || "(anonymous)");
                let logged = loggedHandlers.get(sheet.fiber) ?? loggedHandlers.get(findProp(sheet.fiber, "alternate"));
                if (!logged) { logged = new Set(); loggedHandlers.set(sheet.fiber, logged); }
                const key = `${name}:${handler}`;
                if (logged.size < 16 && !logged.has(key)) {
                    logged.add(key);
                    console.log("[NitroSniper] fiber in sheet has onPress:", handler, "fiber:", name || "Anonymous", "depth:", depth);
                }
                if (!BUTTON_RE.test(name)) return;
                const press = props.onPress;
                if (props.disabled || props.loading || props.submitting || props.accessibilityState?.disabled) {
                    let handlers = disabledHandlers.get(sheet);
                    if (!handlers) { handlers = new Set(); disabledHandlers.set(sheet, handlers); }
                    handlers.add(press);
                    return;
                }
                const knownHandler = sheet.name === "CaptchaModal" ? handler === "handleShowCaptcha" : GIFT_HANDLER_RE.test(handler);
                const label = elementText({ props }).trim();
                if (!knownHandler && (sheet.name !== "GiftCodeRedeemModal" || !GIFT_LABEL_RE.test(label))) return;
                candidates.push({ sheet, handler, label, press, rank: (knownHandler ? 2 : 0) + (name === "BaseTextButton" ? 1 : 0) });
            },
        );
        let best;
        for (const candidate of candidates) {
            if (disabledHandlers.get(candidate.sheet)?.has(candidate.press)) continue;
            if (!best || candidate.rank > best.rank) best = candidate;
        }
        if (!best || stopped || !r.active) return { ...stats, pressed: false };
        const { sheet, handler, label, press } = best;
        markSheet(pressedSheets, sheet.fiber); // Same mounted sheet across React's alternating commits.
        const message = `Pressing "${(label || "confirm").slice(0, 40)}"…`;
        console.log("[NitroSniper]", message, sheet.name, handler);
        try {
            const result = press({ nativeEvent: {}, currentTarget: null });
            console.log("[NitroSniper] invoked", handler, "in", sheet.name);
            if (result && typeof result.then === "function") {
                Promise.resolve(result).catch(e => console.log("[NitroSniper] press rejected:", handler, String(e)));
            }
        } catch (e) {
            console.log("[NitroSniper] press failed:", handler, String(e));
            return { ...stats, pressed: false };
        }
        r.toast(message, "ShieldIcon");
        return { ...stats, pressed: true };
    }
    // Stay armed after a press: a gift sheet can be followed by a separate
    // verification sheet. A re-arm extends the deadline, not prior presses.
    let armedUntil = 0, sweeps = 0;
    let scanTimer;
    function stopScan() {
        if (scanTimer != null) clearTimeout(scanTimer);
        scanTimer = undefined;
    }
    function startScan(delay) {
        if (scanTimer != null || !r.active || stopped || Date.now() >= armedUntil) return;
        scanTimer = setTimeout(() => {
            scanTimer = undefined;
            if (!r.active || stopped || Date.now() >= armedUntil) return;
            try {
                const { pressed, roots, fibers, depth } = scanAndPress();
                if (pressed || sweeps < 4) console.log("[NitroSniper] fiber sweep", sweeps, "pressed:", pressed, "roots:", roots, "fibers:", fibers, "max depth:", depth);
            } catch (e) { if (sweeps < 3) r.error("Fiber scan", e); }
            sweeps++;
            startScan(1000);
        }, delay);
    }
    function armAutoPress(ms = 60000) {
        armedUntil = Math.max(armedUntil, Date.now() + ms);
        sweeps = 0;
        console.log("[NitroSniper] armed autoPress for", ms, "ms");
        startScan(350);
    }
    r.own(stopScan);

    function redeemViaActions(actions, code) {
        // Calls the same module the native Accept button uses. Returns null when
        // the module is unavailable (REST ladder takes over); rejects on real
        // outcomes so callers can distinguish claimed from failed.
        if (typeof actions?.redeemGiftCode !== "function") return Promise.resolve(null);
        return new Promise((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error("native redeem timed out")); } }, 20000);
            const done = (ok) => (value) => {
                if (settled) return;
                settled = true; clearTimeout(timer);
                if (ok) resolve();
                else {
                    const e = value instanceof Error ? value : new Error(value?.message || "native redeem failed");
                    if (value && typeof value === "object") e.body = value.body || value;
                    reject(e);
                }
            };
            try { actions.redeemGiftCode({ code, onRedeemed: done(true), onError: done(false) }); }
            catch (e) {
                const err = e instanceof Error ? e : new Error(String(e));
                if (/not a function|undefined|null/.test(err.message)) resolve(null);
                else { settled = true; clearTimeout(timer); reject(err); }
            }
        });
    }

    const stats = { queued: 0, claimed: 0, failed: 0, lastResult: "Waiting for new gift links" };
    function wait(ms) { return new Promise(resolve => { releaseWait = resolve; waitTimer = setTimeout(resolve, ms); }); }
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
                r.toast("Claiming gift…", "GiftIcon");
                armAutoPress();
                try {
                    // Native path first: exactly what pressing the bottom Accept button
                    // does (GiftActions.redeemGiftCode, captcha and all).
                    let nativeCap = null;
                    const nativeActions = r.find("redeemGiftCode");
                    if (typeof nativeActions?.redeemGiftCode === "function") {
                        try {
                            const native = await redeemViaActions(nativeActions, item.code);
                            if (native !== null) { success = true; result = "Gift claimed (native)"; }
                        } catch (nativeError) {
                            // Captcha and rate-limit responses fall through to the REST
                            // ladder; hard failures (invalid/already-redeemed) abort here.
                            nativeCap = captchaErrorInfo(nativeError);
                            if (!nativeCap && nativeError?.status !== 429 && !/timed out/.test(nativeError?.message || "")) throw nativeError;
                        }
                    }
                    if (!success) {
                    let captchaKey, captchaRqtoken;
                    armAutoPress(); // the verification sheet can mount mid-REST-redeem too
                    for (let attempt = 0; ; attempt++) {
                        try {
                            const payload = { channel_id: item.channelId || null };
                            if (captchaKey) {
                                payload.captcha_key = captchaKey;
                                if (captchaRqtoken) payload.captcha_rqtoken = captchaRqtoken;
                            }
                            await r.discord(`/entitlements/gift-codes/${item.code}/redeem`, { method: "POST", body: JSON.stringify(payload) }); break;
                        }
                        catch (e) {
                            const cap = !captchaKey && (captchaErrorInfo(e) || nativeCap);
                            if (cap && cap.sitekey && cap.service === "hcaptcha") {
                                r.toast("Solving captcha…", "ShieldIcon");
                                stats.lastResult = "Solving hCaptcha…"; r.changed();
                                const token = await solver.solve(cap.sitekey, cap.rqtoken);
                                captchaKey = token;
                                captchaRqtoken = cap.rqtoken;
                                armAutoPress(); // verification sheet may follow the captcha
                                attempt--; // don't consume attempts on the captcha round-trip
                                continue;
                            }
                            if (e.status !== 429 || attempt >= 2 || e.retryAfter <= 0 || e.retryAfter > 120) throw e;
                            stats.lastResult = `Rate limited; retrying in ${Math.ceil(e.retryAfter)}s`; r.changed();
                            await wait(e.retryAfter * 1000 + 100);
                            armAutoPress();
                            if (stopped || !r.active) return;
                        }
                    }
                    success = true; result = "Gift claimed";
                    }
                } catch (e) { result = `Claim failed: ${e.message}`; }
                if (stopped || !r.active) return;
                stats[success ? "claimed" : "failed"]++; stats.lastResult = result; r.changed();
                r.toast(result, success ? "NitroWheelIcon" : "CircleXIcon");
                if (r.store.webhookUrl) {
                    try {
                        try { const resolved = (await r.discord(`/entitlements/gift-codes/${item.code}?with_application=false&with_subscription_plan=true`)).json(); giftType = resolved?.subscription_plan?.name || resolved?.store_listing?.sku?.name; } catch { /* Optional enrichment; claim result remains visible. */ }
                        if (!r.active || stopped) return;
                        const fields = [];
                        if (giftType) fields.push({ name: "Gift type", value: String(giftType).slice(0, 1024) });
                        if (item.authorId) fields.push({ name: "Sent by", value: `[${String(item.authorName || item.authorId).replace(/[\[\]\\]/g, "")}](https://discord.com/users/${item.authorId})` });
                        if (item.channelId && item.messageId) fields.push({ name: "Message", value: `https://discord.com/channels/${item.guildId || "@me"}/${item.channelId}/${item.messageId}` });
                        await webhook({ embeds: [{ title: result.slice(0, 256), color: success ? 0x43b581 : 0xf04747, fields, timestamp: new Date().toISOString() }] });
                    } catch (e) { if (r.active) r.error("Webhook delivery failed", e); }
                }
            }
        } finally { running = false; }
    }
    function receive(event) {
        const m = event?.message;
        if (!m || stopped || event.optimistic || event.isPushNotification) return;
        const timestamp = m.timestamp ? new Date(m.timestamp).getTime() : Number(BigInt(m.id || "0") >> 22n) + 1420070400000;
        if (!Number.isFinite(timestamp) || timestamp < started) return;
        const self = r.byStore("UserStore")?.getCurrentUser?.()?.id;
        if (r.store.ignoreOwnGiftLinks && m.author?.id === self) return;
        for (const code of giftCodes(m.content)) {
            if (seen.has(code)) continue;
            seen.set(code, Date.now());
            if (seen.size > 4096) seen.delete(seen.keys().next().value ?? "");
            if (queue.length >= 100) { stats.lastResult = "Queue full; skipped gift"; r.changed(); continue; }
            queue.push({ code, channelId: m.channel_id || m.channelId, guildId: m.guild_id || m.guildId, messageId: m.id, authorId: m.author?.id, authorName: m.author?.globalName || m.author?.global_name || m.author?.username }); stats.queued++;
        }
        r.changed(); void drain().catch(e => r.active && r.error("Gift queue", e));
    }
    function Settings() {
        r.useRefresh(); const [url, setUrl] = React.useState(r.store.webhookUrl || "");
        return h(Page, { title: "NitroSniper" }, h(Toggle, { setting: "ignoreOwnGiftLinks", label: "Ignore my gift links" }),
            h(Text, null, `Queued ${stats.queued} · Claimed ${stats.claimed} · Failed ${stats.failed}`), h(Text, null, stats.lastResult),
            h(Input, { label: "Optional result webhook", value: url, onChange: setUrl, secureTextEntry: true, autoCapitalize: "none" }),
            h(Button, { text: "Save webhook", onPress: async () => { try { webhookUrl(url); r.set("webhookUrl", url.trim()); await r.api.storage.flush(); r.toast("Saved"); } catch (e) { r.error("Webhook", e); } } }),
            h(Button, { text: "Send test webhook", variant: "secondary", onPress: () => webhook({ content: "NitroSniper Snow webhook test" }).then(() => r.toast(r.store.webhookUrl ? "Test sent" : "Set a webhook first")).catch(e => r.error("Webhook test", e)) }),
            h(Text, { muted: true }, "Claim cycle: claim link, auto-press the Accept and human-verification Confirm buttons, solve hCaptcha, and toast each result. Only new live messages are processed."));
    }
    return { start() { started = Date.now(); r.subscribe("MESSAGE_CREATE", e => { try { receive(e); } catch (err) { r.error("Message handler", err); } });
        try { console.log('[NitroSniper] start: arming fiber scanner for stuck sheet'); armAutoPress(300000); } catch (e) { console.log('[NitroSniper] start arm failed', String(e)); }
        try {
            r.command({ name: "nitrosniper-test", description: "Arm the confirm-button scanner and report fiber findings", async execute() {
                armAutoPress(300000);
                await new Promise(res => { setTimeout(() => res(), 1600); });
                const found = scanReport();
                return `Scanner armed.\n${found}`;
            } });
        } catch (e) { r.error("Command registration", e); }
    }, stop() { stopped = true; solver.dispose(); queue.length = 0; clearTimeout(waitTimer); releaseWait?.(); }, Settings, receive, stats };
}
NitroSniper.defaults = { ignoreOwnGiftLinks: false, webhookUrl: "" };

export default NitroSniper;
