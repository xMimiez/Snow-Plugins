// NitroSniper — Snow SDK port of neoarz/NitroSniper (MIT).
// Claim cycle: queue gift link -> redeem (native ladder + REST fallback) ->
// auto-press the Accept/Confirm button of the gift sheet and hCaptcha's mobile
// human-verification interstitial -> toasts at every stage.
import { register, ui, type Any, type Runtime } from "../../../shared/runtime";
import { createCaptchaSolver, captchaErrorInfo } from "./captcha";
export function giftCodes(text: unknown): string[] {
    return [...new Set(Array.from(String(text || "").matchAll(/(?:https?:\/\/)?(?:www\.)?(?:discord\.gift\/|discord(?:app)?\.com\/gifts\/)([A-Za-z0-9]{16,24})(?![A-Za-z0-9])/g), (m) => m[1]))];
}
export function webhookUrl(value: Any): string | null {
    if (!String(value || "").trim()) return null;
    const u = new URL(String(value).trim());
    if (u.protocol !== "https:" || !["discord.com", "canary.discord.com", "ptb.discord.com"].includes(u.hostname) || !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[\w-]+\/?$/.test(u.pathname) || u.username || u.password) throw new Error("Use a Discord HTTPS webhook URL");
    return u.href;
}

function NitroSniper(r: Runtime) {    const { h, React } = r, { Page, Text, Button, Input, Toggle } = ui(r);
    const solver = createCaptchaSolver(r, React);
    const seen = new Map<string, number>(), queue: Any[] = [];
    let running = false, stopped = false, started = Date.now(), waitTimer: Any, releaseWait: Any;

    // --- Native Accept/Confirm-button automation -------------------------------
    // Matches the gift sheet's Accept button AND hCaptcha's mobile TouchUI
    // interstitial: "Wait! Are you human?" / "Please confirm you're not a robot."
    // with a blue Confirm BaseButton. Armed for the whole claim window so a
    // verification sheet that mounts mid-redeem still gets pressed.
    const ACCEPT_BUTTON_RE = /^(accept|redeem(?: now)?|claim|get nitro|confirm|i'?m not a robot|verify)\b/i;
    const autoPress = { armedUntil: 0, fired: false };
    function armAutoPress(ms = 60000) { autoPress.armedUntil = Date.now() + ms; autoPress.fired = false; }
    r.patch("after", React, "createElement", (args: Any[], result: Any) => {
        if (!r.active || stopped || autoPress.fired || Date.now() > autoPress.armedUntil) return result;
        const props = args && args[1];
        const label = String(props?.accessibilityLabel ?? props?.label ?? props?.text ?? "");
        if (typeof props?.onPress !== "function" || !ACCEPT_BUTTON_RE.test(label)) return result;
        autoPress.fired = true;
        const press = props.onPress;
        r.toast(`Pressing "${label.slice(0, 40)}"…`, "ShieldIcon");
        setTimeout(() => { if (r.active && !stopped) { try { press({}); } catch { /* sheet may have closed */ } } }, 350);
        return result;
    });

    function redeemViaActions(actions: Any, code: string): Promise<null | void> {
        // Calls the same module the native Accept button uses. Returns null when
        // the module is unavailable (REST ladder takes over); rejects on real
        // outcomes so callers can distinguish claimed from failed.
        if (typeof actions?.redeemGiftCode !== "function") return Promise.resolve(null);
        return new Promise((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error("native redeem timed out")); } }, 20000);
            const done = (ok: boolean) => (value: Any) => {
                if (settled) return;
                settled = true; clearTimeout(timer);
                if (ok) resolve();
                else {
                    const e = value instanceof Error ? value : new Error(value?.message || "native redeem failed");
                    if (value && typeof value === "object") (e as Any).body = (value as Any).body || value;
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
    function wait(ms: number) { return new Promise<void>(resolve => { releaseWait = resolve; waitTimer = setTimeout(resolve, ms); }); }
    async function webhook(payload: Any) {
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
                        } catch (nativeError: Any) {
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
                            const payload: Any = { channel_id: item.channelId || null };
                            if (captchaKey) {
                                payload.captcha_key = captchaKey;
                                if (captchaRqtoken) payload.captcha_rqtoken = captchaRqtoken;
                            }
                            await r.discord(`/entitlements/gift-codes/${item.code}/redeem`, { method: "POST", body: JSON.stringify(payload) }); break;
                        }
                        catch (e: Any) {
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
                } catch (e: Any) { result = `Claim failed: ${e.message}`; }
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
    function receive(event: Any) {
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
    return { start() { started = Date.now(); r.subscribe("MESSAGE_CREATE", e => { try { receive(e); } catch (err) { r.error("Message handler", err); } }); }, stop() { stopped = true; solver.dispose(); queue.length = 0; clearTimeout(waitTimer); releaseWait?.(); }, Settings, receive, stats };
}
NitroSniper.defaults = { ignoreOwnGiftLinks: false, webhookUrl: "" };

export default register(NitroSniper);
