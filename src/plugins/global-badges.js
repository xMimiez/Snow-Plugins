import { ui } from '../runtime.js';

const EQUI = 'https://badges.equicord.org';
const VAULT = 'https://plugins.obamabot.me/BadgeVault/User';
const EXPIRES = 1000 * 60 * 15;
const cache = new Map();

function asList(mod, entries) {
    if (!Array.isArray(entries)) return [];
    return entries.map(badge => {
        if (typeof badge === 'string') {
            const names = { hunter: 'Bug Hunter', early: 'Early User' };
            const short = badge.replace(mod, '').trim().split(' ')[0] || badge;
            return { name: names[badge] || badge, badge: `${EQUI}/public/badges/${mod}/${short}.png`, custom: false, source: mod };
        }
        const url = badge.badge || badge.url || badge.image;
        const name = badge.name || badge.tooltip || badge.label || mod;
        if (!url || !String(url).startsWith('https://')) return null;
        if (badge.pending) return null;
        return { name, badge: url, custom: true, source: mod };
    }).filter(Boolean);
}

async function fetchEqui(r, id) {
    const data = (await r.request(`${EQUI}/${id}?separated=true&capitalize=true`, {}, 12000)).json();
    const groups = data?.badges && typeof data.badges === 'object' ? data.badges : data;
    const out = {};
    if (!groups || typeof groups !== 'object') return out;
    for (const [mod, entries] of Object.entries(groups)) {
        const list = asList(mod, entries);
        if (list.length) out[mod] = list;
    }
    return out;
}

async function fetchVault(r, id) {
    const data = (await r.request(`${VAULT}/${id}.json`, {}, 12000)).json();
    if (data?.blocked) return { BadgeVault: [] };
    return { BadgeVault: asList('BadgeVault', data?.badges || []) };
}

export async function fetchBadges(r, id) {
    const hit = cache.get(id);
    if (hit && hit.expires > Date.now()) return hit.badges;
    const badges = {};
    const results = await Promise.allSettled([fetchEqui(r, id), fetchVault(r, id)]);
    for (const result of results) {
        if (result.status !== 'fulfilled' || !result.value) continue;
        for (const [mod, list] of Object.entries(result.value)) {
            if (!list.length) continue;
            const existing = badges[mod] || [];
            const urls = new Set(existing.map(b => b.badge));
            for (const badge of list) if (!urls.has(badge.badge)) { existing.push(badge); urls.add(badge.badge); }
            badges[mod] = existing;
        }
    }
    cache.set(id, { badges, expires: Date.now() + EXPIRES });
    return badges;
}

export default function GlobalBadges(r) {
    const { h, React, RN } = r, { Page, Text, Toggle } = ui(r);
    function Badge({ name, img }) {
        return h(RN.Pressable || RN.TouchableOpacity, {
            accessibilityLabel: name,
            onPress: () => r.toast(name),
            style: { alignItems: 'center', justifyContent: 'center', marginHorizontal: 2 },
        }, h(RN.Image, { source: { uri: img }, style: { width: 24, height: 24, resizeMode: 'contain' }, accessibilityLabel: name }));
    }
    function BadgeList({ userId, style }) {
        const [badges, setBadges] = React.useState({});
        React.useEffect(() => {
            let live = true;
            fetchBadges(r, userId).then(value => { if (live) setBadges(value || {}); }).catch(() => {});
            return () => { live = false; };
        }, [userId]);
        const icons = [];
        for (const [mod, list] of Object.entries(badges)) {
            for (const badge of list) {
                if (!r.store.showCustom && badge.custom) continue;
                const clean = String(badge.name || '').replace(new RegExp(mod, 'i'), '').trim() || badge.name;
                const label = badge.custom || !r.store.showPrefix ? badge.name : `${mod} ${clean.charAt(0).toUpperCase()}${clean.slice(1)}`;
                icons.push(h(Badge, { key: `${mod}:${badge.badge}`, name: label, img: badge.badge }));
            }
        }
        if (!icons.length) return null;
        return h(RN.View, {
            style: [{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'flex-end', paddingVertical: 2 }, style],
            accessibilityRole: 'list',
            accessibilityLabel: 'User Badges',
        }, icons);
    }
    function inject(props, res) {
        const userId = props?.user?.id || props?.userId;
        if (!userId) return res;
        const extra = h(BadgeList, { userId, style: props?.style });
        if (!res) return extra;
        try {
            if (Array.isArray(res.props?.badges)) {
                res.props.badges.push(extra);
                return res;
            }
            const kids = React.Children.toArray(res.props?.children);
            kids.push(extra);
            return React.cloneElement(res, { children: kids });
        } catch {
            return h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' } }, res, extra);
        }
    }
    function patchModule(mod) {
        if (!mod) return;
        const key = typeof mod.default === 'function' ? 'default' : typeof mod.type === 'function' ? 'type' : typeof mod === 'function' ? null : null;
        if (key) r.patch('after', mod, key, (args, tree) => inject(args?.[0], tree));
        else if (typeof mod === 'function' && mod.prototype?.render) r.patch('after', mod.prototype, 'render', function (_args, tree) { return inject(this.props, tree); });
    }
    return {
        start() {
            const metro = r.B.metro;
            patchModule(metro.findByName?.('ProfileBadges', false));
            patchModule(metro.findByDisplayName?.('ProfileBadges', false));
            patchModule(metro.findByTypeName?.('ProfileBadges', false));
            patchModule(r.byName('ProfileBadges'));
            r.hook(['ProfileBadges'], element => {
                const Component = element.type;
                function Wrapped(props) {
                    let tree;
                    try { tree = typeof Component === 'function' && !Component.prototype?.render ? Component(props) : h(Component, props); }
                    catch { tree = h(Component, props); }
                    return inject(props, tree);
                }
                return h(Wrapped, element.props);
            });
        },
        Settings() {
            r.useRefresh();
            return h(Page, { title: 'GlobalBadges' },
                h(Toggle, { setting: 'showPrefix', label: 'Prefix', subLabel: 'Shows the client mod as a prefix' }),
                h(Toggle, { setting: 'showCustom', label: 'Custom badges', subLabel: 'Show custom badges from EquiBadges and BadgeVault' }),
                h(Text, { muted: true }, 'Loads badges from badges.equicord.org (all client mods) and plugins.obamabot.me/BadgeVault (ObaWorkshop). Snow’s own badge source is not public yet; Bunny is requested through EquiBadges when present.'));
        },
    };
}
GlobalBadges.defaults = { showPrefix: true, showCustom: true };
