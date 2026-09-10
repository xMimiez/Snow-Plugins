import { ui } from '../runtime.js';

export default function VolumeBooster(r) {
    const { h } = r, { Page, Text, Toggle, Button } = ui(r);
    function apply(percent) {
        if (!r.store.enabled) return 0;
        const gain = Math.max(1, Math.min(5, Number(percent) / 100));
        const modules = r.RN.NativeModules || {};
        const candidates = [
            r.find('setOutputVolume'),
            r.find('setLocalVolume'),
            modules.VoiceEngine,
            modules.MediaEngine,
        ].filter(Boolean);
        let applied = 0;
        for (const mod of candidates) {
            try {
                if (typeof mod.setOutputVolume === 'function') { mod.setOutputVolume(gain); applied++; }
            } catch {}
        }
        r.status.support = applied
            ? `Applied ${percent}% via ${applied} output method(s).`
            : 'No safe mobile volume hook found. Discord’s slider is left unchanged to avoid crashes.';
        r.changed();
        return applied;
    }
    function bump(delta) {
        const next = Math.max(100, Math.min(500, Number(r.store.percent || 200) + delta));
        r.set('percent', next);
        apply(next);
    }
    return {
        start() {
            try { if (r.store.enabled) apply(r.store.percent || 200); } catch {}
        },
        Settings() {
            r.useRefresh();
            return h(Page, { title: 'VolumeBooster' },
                h(Toggle, { setting: 'enabled', label: 'Boost voice output volume' }),
                h(Text, null, `Boost: ${r.store.percent}%`),
                h(Button, { text: '− 25%', variant: 'secondary', onPress: () => bump(-25) }),
                h(Button, { text: '+ 25%', variant: 'secondary', onPress: () => bump(25) }),
                h(Text, { muted: true }, r.status.support || 'Uses VoiceEngine/MediaEngine setOutputVolume only. Discord volume sliders are not patched.'));
        },
    };
}
VolumeBooster.defaults = { enabled: false, percent: 200 };
