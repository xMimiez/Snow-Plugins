import { ui } from '../runtime.js';
export function formatArgument(value) {
    if (typeof value === 'string') return value;
    if (value?.stack) return String(value.stack);
    const seen = new Set();
    try { return JSON.stringify(value, (_key, v) => {
        if (typeof v === 'bigint') return String(v);
        if (v && typeof v === 'object') { if (seen.has(v)) return '[Circular]'; seen.add(v); } return v;
    }, 2) ?? String(value); } catch { return String(value); }
}
export function redact(text) {
    return text.replace(/(https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/)[\w-]+/gi, '$1[redacted]')
        .replace(/(authorization["']?\s*[:=]\s*["']?)(?:Bearer\s+)?[^\s,"'}]+/gi, '$1[redacted]')
        .replace(/(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]+/g, '[redacted]');
}
export default function DebugConsole(r) {
    const { React, RN, h } = r;
    const { Page, Text, Button, Input } = ui(r);
    let entries = []; let id = 0; let timer; let close;
    function notify() { if (timer) return; timer = setTimeout(() => { timer = null; if (r.active) r.changed(); }, 120); }
    function capture(level, args) {
        if (!r.active) return;
        const text = redact(args.map(formatArgument).join(' ')).slice(0, 12000);
        if (/Requested message \S+ does not have a value in the requested locale/i.test(text)) return;
        const last = entries[entries.length - 1];
        if (last?.level === level && last.text === text) { last.count++; last.time = new Date().toLocaleTimeString(); }
        else { entries.push({ id: ++id, level, text, time: new Date().toLocaleTimeString(), count: 1 }); entries = entries.slice(-400); }
        notify();
    }
    function clear() { entries = []; r.changed(); }
    function dump() { return entries.map(e => `[${e.time}] ${e.level}${e.count > 1 ? ` ×${e.count}` : ''}\n${e.text}`).join('\n\n') || 'Console is clear.'; }
    function Panel({ close: onClose }) {
        r.useRefresh(); const [query, setQuery] = React.useState(''); const [errors, setErrors] = React.useState(false);
        const visible = entries.filter(e => (!errors || /warn|error|fatal|reject/.test(e.level)) && e.text.toLowerCase().includes(query.toLowerCase())).slice().reverse();
        return h(Page, { title: 'Debug Console', close: onClose },
            h(Text, { muted: true }, `${visible.length} of ${entries.length} entries · live · newest first`),
            h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } },
                h(Button, { text: 'Clear console', onPress: clear }), h(Button, { text: 'Copy logs', variant: 'secondary', onPress: () => r.copy(dump()) }),
                h(Button, { text: errors ? 'Show all' : 'Warnings & errors', variant: 'secondary', onPress: () => setErrors(!errors) })),
            h(Input, { value: query, onChange: setQuery, placeholder: 'Search logs or plugin name' }),
            h(RN.ScrollView, { style: { maxHeight: 460 }, keyboardShouldPersistTaps: 'handled' }, visible.length ? visible.map(e =>
                h(RN.View, { key: e.id, style: { paddingVertical: 10, gap: 4 } },
                    h(Text, { color: /error|fatal|reject/.test(e.level) ? 'text-danger' : e.level === 'warn' ? 'text-warning' : 'text-muted' }, `${e.level.toUpperCase()} · ${e.time}${e.count > 1 ? ` ×${e.count}` : ''}`),
                    h(Text, { selectable: true, style: { fontFamily: RN.Platform?.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 } }, e.text))) : h(Text, { muted: true }, 'No matching logs.')));
    }
    return {
        start() {
            for (const name of ['log','info','warn','error','debug']) {
                const original = console[name];
                function wrapped(...args) { capture(name, args); return original?.apply(console, args); }
                console[name] = wrapped; r.own(() => { if (console[name] === wrapped) console[name] = original; });
            }
            const errors = globalThis.ErrorUtils;
            if (errors?.getGlobalHandler && errors?.setGlobalHandler) {
                const old = errors.getGlobalHandler(); const handler = (error, fatal) => { capture(fatal ? 'fatal' : 'error', [error]); old?.(error, fatal); };
                errors.setGlobalHandler(handler); r.own(() => { if (errors.getGlobalHandler() === handler) errors.setGlobalHandler(old); });
            }
            if (globalThis.addEventListener && globalThis.removeEventListener) {
                const reject = event => capture('reject', [event.reason]); globalThis.addEventListener('unhandledrejection', reject);
                r.own(() => globalThis.removeEventListener('unhandledrejection', reject));
            }
            r.command({ name: 'console', description: 'Open the live debug console', execute() { close?.(); close = r.open('logs', Panel); } });
            r.command({ name: 'consoleclear', description: 'Clear captured debug logs', execute: clear });
        },
        stop() { clearTimeout(timer); close?.(); entries = []; }, Settings: Panel, capture, clear, dump, getEntries: () => entries
    };
}
