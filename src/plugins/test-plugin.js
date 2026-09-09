import { ui } from '../runtime.js';
import { add } from '../test-math.js';
export default function TestPlugin(r) {
    const { h, React, RN, C, D } = r, { Page, Text, Button } = ui(r); let report = ['Bunny spec 3', 'Bundled sibling module: 2 + 3 = ' + add(2,3)], busy = false;
    async function run() {
        if (busy) return; busy = true; r.changed();
        const lines = [`${r.meta.name} ${r.meta.version} · Snow`, `Bundled module import: ${add(2,3) === 5 ? 'PASS' : 'FAIL'}`];
        try {
            r.set('runs', (Number(r.store.runs) || 0) + 1); await r.api.storage.flush(); lines.push('Storage flush: PASS · run ' + r.store.runs);
            const target = { add(a,b) { return a+b; } }; const unpatch = r.api.patcher.after('add', target, (_args, value) => value+1);
            try { lines.push('Scoped patch: ' + (target.add(2,3) === 6 ? 'PASS' : 'FAIL')); } finally { unpatch(); }
            lines.push('Patch cleanup: ' + (target.add(2,3) === 5 ? 'PASS' : 'FAIL'));
            for (const file of ['data.json','extra.js','lib/math.js']) {
                try { const data = await r.request('https://raw.githubusercontent.com/xMimiez/Snow-Plugins/main/TestPlugin/' + file); if (file === 'data.json') data.json(); lines.push(`${file}: fetched ${data.text.length} characters (not evaluated)`); }
                catch(e) { lines.push(`${file}: ${e.message}`); }
            }
            for (const name of ['UserStore','ChannelStore','PresenceStore','ReadStateStore']) lines.push(`${name}: ${r.byStore(name) ? 'available' : 'unavailable'}`);
            lines.push('Native CSS injection: unavailable in React Native. Use the isolated WebView CSS test.');
        } catch(e) { lines.push('Test error: ' + e.message); }
        finally { report = lines; busy = false; if (r.active) r.changed(); }
    }
    function CssTest({ close }) { const WebView = r.find('WebView')?.WebView || r.byName('WebView'); return h(Page, { title: 'Isolated CSS test', close }, WebView ? h(WebView, { originWhitelist: ['about:blank'], javaScriptEnabled: false, onShouldStartLoadWithRequest: req => req.url === 'about:blank', source: { html: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#202127;color:#eee;font:18px system-ui;padding:24px}.card{border:2px solid #8892ff;border-radius:16px;padding:24px}</style><div class="card">Snow WebView CSS works. This style is isolated from Discord.</div>' }, style: { height: 240 } }) : h(Text, null, 'WebView unavailable')); }
    function alert() {
        const AlertModal = D.AlertModal || C.AlertModal;
        const AlertActions = D.AlertActions || C.AlertActions;
        const AlertActionButton = D.AlertActionButton || C.AlertActionButton;
        if (!AlertModal || !AlertActions || !AlertActionButton) return r.toast('Alert components unavailable');
        r.api.ui.openAlert('test', h(AlertModal, { title: 'Snow alert test', content: 'This alert is owned by TestPlugin and is dismissed when the plugin stops.', actions: h(AlertActions, null, h(AlertActionButton, { text: 'Close', onPress: () => r.api.ui.dismissAlert('test') })) }));
    }
    function Settings({ close }) { r.useRefresh(); return h(Page, { title: 'TestPlugin · Snow', close }, h(Button, { text: busy ? 'Running…' : 'Run compatibility checks', disabled: busy, onPress: run }), h(Button, { text: 'Test native alert', variant: 'secondary', onPress: alert }), h(Button, { text: 'Test sheet and WebView CSS', variant: 'secondary', onPress: () => { try { r.open('css', CssTest); } catch(e) { r.error('CSS test',e); } } }), h(Button, { text: 'Copy report', variant: 'secondary', onPress: () => r.copy(report.join('\n')) }), h(Text, { selectable: true }, report.join('\n'))); }
    return { start() { r.command({ name: 'testplugin', description: 'Open Snow compatibility checks', execute() { r.open('diagnostics', Settings); } }); }, Settings, run };
}
TestPlugin.defaults = { runs: 0 };
