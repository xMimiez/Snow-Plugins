import { ui } from '../runtime.js';

const EQUI_USERS = 'https://badges.equicord.org/users';
const EQUI_USER = 'https://badges.equicord.org';
const VAULT_USER = 'https://plugins.obamabot.me/BadgeVault/User';
const REFRESH = 1000 * 60 * 30;

const serviceMap = {
    badgevault: 'BadgeVault', nekocord: 'Nekocord', reviewdb: 'ReviewDB', aero: 'Aero',
    aliucord: 'Aliucord', raincord: 'Raincord', velocity: 'Velocity', enmity: 'Enmity',
    paicord: 'Paicord', bunny: 'Bunny', goosemod: 'GooseMod', replugged: 'Replugged',
    betterdiscord: 'BetterDiscord', vendroidenhanced: 'VendroidEnhanced', revenge: 'Revenge',
    record: 'ReCord', vencord: 'Vencord', equicord: 'Equicord', discord: 'Discord',
};

let byUser = {};
const badgeProps = {};
let refreshTimer;

function flattenEquiUser(entries, showPrefix) {
    if (!Array.isArray(entries)) return [];
    return entries.map((b, idx) => {
        const url = b.badge || b.url;
        const mod = b.mod || 'custom';
        if (!url || !String(url).startsWith('https://')) return null;
        const modName = serviceMap[String(mod).toLowerCase()] || mod;
        const tip = b.tooltip || b.name || b.label || modName;
        const label = showPrefix ? `${modName} — ${tip}` : tip;
        return { mod, badge: url, tooltip: label, reason: tip, key: `${mod}-${idx}-${url}` };
    }).filter(Boolean);
}

function mergeUser(id, list) {
    const existing = byUser[id] || [];
    const urls = new Set(existing.map(b => b.badge));
    for (const badge of list) if (!urls.has(badge.badge)) { existing.push(badge); urls.add(badge.badge); }
    if (existing.length) byUser[id] = existing;
}

export async function loadBadges(r, showPrefix) {
    try {
        const data = (await r.request(EQUI_USERS, {}, 20000, 2 * 1024 * 1024)).json();
        const users = data?.users || data || {};
        const next = {};
        for (const [id, entries] of Object.entries(users)) {
            const list = flattenEquiUser(entries, showPrefix);
            if (list.length) next[id] = list;
        }
        byUser = next;
    } catch (error) {
        r.B?.logger?.warn?.('GlobalBadges EquiBadges bulk load failed', error);
    }
}

async function loadUser(r, id, showPrefix) {
    const results = await Promise.allSettled([
        r.request(`${EQUI_USER}/${id}?separated=true`, {}, 10000).then(d => d.json()),
        r.request(`${VAULT_USER}/${id}.json`, {}, 10000).then(d => d.json()),
    ]);
    if (results[0].status === 'fulfilled') {
        const body = results[0].value;
        const groups = body?.badges && typeof body.badges === 'object' && !Array.isArray(body.badges) ? body.badges : null;
        if (groups) {
            const list = [];
            for (const [mod, entries] of Object.entries(groups)) {
                for (const item of flattenEquiUser((entries || []).map(e => ({ ...e, mod })), showPrefix)) list.push(item);
            }
            mergeUser(id, list);
        } else if (Array.isArray(body)) mergeUser(id, flattenEquiUser(body, showPrefix));
    }
    if (results[1].status === 'fulfilled') {
        const vault = results[1].value;
        if (!vault?.blocked) {
            mergeUser(id, asVault(vault?.badges, showPrefix));
        }
    }
}

function asVault(badges, showPrefix) {
    if (!Array.isArray(badges)) return [];
    return badges.filter(b => b && !b.pending && String(b.badge || '').startsWith('https://')).map((b, idx) => ({
        mod: 'badgevault',
        badge: b.badge,
        tooltip: showPrefix ? `BadgeVault — ${b.name}` : b.name,
        reason: b.name,
        key: `vault-${idx}-${b.badge}`,
    }));
}

// Discord's badge rarities are 1, 2, 3 and 5. Only this plugin draws this one.
export const ULTIMATE_RARITY = 99;
const ULTIMATE = { label: 'Ultimate', border: '#f23f43', fill: 'rgba(242, 63, 67, 0.24)', text: '#ff6b6e' };
// Discord's badge ids are positive numbers, so these never collide with one.
const DIRECTORY_ID = -9000;
export const isDirectoryId = id => typeof id === 'number' && id <= DIRECTORY_ID;

// Badge directory entries, shaped like Discord's own untiered badges.
// Donor badges are the ones named so. Custom ones are BadgeVault's and any image stored per user.
export function isShown(badge, userId, store) {
    const mod = String(badge.mod).toLowerCase();
    const vault = mod === 'badgevault' || mod === 'custom';
    if (!vault && /donor|donator/i.test(badge.reason || '')) return store.showDonor !== false;
    return !!store.showCustom || !(vault || String(badge.badge).includes(userId));
}

export function directoryBadges(extras, userId, store) {
    const list = [];
    (extras || []).forEach((badge, idx) => {
        if (!isShown(badge, userId, store)) return;
        const reason = badge.reason || badge.tooltip;
        list.push({
            badge_id: DIRECTORY_ID - idx,
            name: reason,
            description: `unlocked by ${reason}`,
            rarity: ULTIMATE_RARITY,
            simple_icon_raster_url: badge.badge,
            complex_icon_animated_url: badge.badge,
            is_earnable: false,
            owned: true,
            hidden: false,
        });
    });
    return list;
}

export default function GlobalBadges(r) {
    const { h, React, RN } = r, { Page, Text, Toggle } = ui(r);
    function UltimatePill() {
        return h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, minHeight: 20, borderRadius: 999, borderWidth: 1, backgroundColor: ULTIMATE.fill, borderColor: ULTIMATE.border } },
            h(RN.Text, { style: { color: ULTIMATE.text, fontSize: 12, lineHeight: 16, fontWeight: '600', textTransform: 'uppercase' } }, ULTIMATE.label));
    }
    function applyBadgeProps(element) {
        const id = element?.props?.id;
        if (typeof id !== 'string' || !id.startsWith('gb-')) return;
        const cached = badgeProps[id];
        if (!cached) return;
        return React.cloneElement(element, {
            source: cached.source,
            label: cached.label,
            id: cached.id,
        });
    }
    return {
        async start() {
            await loadBadges(r, r.store.showPrefix);
            refreshTimer = setInterval(() => { loadBadges(r, r.store.showPrefix).catch(() => {}); }, REFRESH);
            r.own(() => { clearInterval(refreshTimer); refreshTimer = null; });
            r.hook(['ProfileBadge', 'RenderBadge'], applyBadgeProps);
            r.hook(['BadgeRarityPill'], element => element?.props?.rarity === ULTIMATE_RARITY ? h(UltimatePill) : undefined);
            const directory = r.byStore('BadgeDirectoryStore');
            if (directory) {
                r.patch('after', directory, 'getBadges', (args, result) => {
                    const userId = args?.[0];
                    if (!userId || !Array.isArray(result)) return;
                    const extra = directoryBadges(byUser[userId], userId, r.store);
                    return extra.length ? result.concat(extra) : undefined;
                });
                r.patch('after', directory, 'getBadgeById', (args, result) => {
                    if (result || !isDirectoryId(args?.[0])) return;
                    const userId = args[1] || r.byStore('UserStore')?.getCurrentUser?.()?.id;
                    return directoryBadges(byUser[userId], userId, r.store).find(badge => badge.badge_id === args[0]);
                });
            }
            const badgeModule = r.B.metro.findByName?.('useBadges', false);
            if (!badgeModule || typeof badgeModule.default !== 'function') {
                r.B.logger?.warn?.('GlobalBadges: useBadges was not found');
                return;
            }
            r.patch('after', badgeModule, 'default', (args, result) => {
                const userId = args?.[0]?.userId || args?.[0]?.id || args?.[0]?.user?.id;
                if (!userId || !Array.isArray(result)) return result;
                if (!byUser[userId]) loadUser(r, userId, r.store.showPrefix).catch(() => {});
                const extras = byUser[userId];
                if (!extras?.length) return result;
                const seen = new Set(result.map(b => b?.id).filter(Boolean));
                const next = result.slice();
                extras.forEach((badge, idx) => {
                    if (!isShown(badge, userId, r.store)) return;
                    const id = `gb-${userId}-${idx}`;
                    if (seen.has(id)) return;
                    badgeProps[id] = { id, source: { uri: badge.badge }, label: badge.tooltip, userId };
                    const item = { id, description: badge.tooltip, icon: 'dummy' };
                    if (r.store.placeLeft) next.unshift(item);
                    else next.push(item);
                    seen.add(id);
                });
                return next;
            });
        },
        Settings() {
            r.useRefresh();
            return h(Page, { title: 'GlobalBadges' },
                h(Toggle, { setting: 'showPrefix', label: 'Prefix', subLabel: 'Show the client mod name in the badge label' }),
                h(Toggle, { setting: 'placeLeft', label: 'Place on the left', subLabel: 'Insert badges at the start of the Discord badge bar' }),
                h(Toggle, { setting: 'showCustom', label: 'Custom / BadgeVault', subLabel: 'Include ObaWorkshop BadgeVault and personal custom badges' }),
                h(Toggle, { setting: 'showDonor', label: 'Donor badges', subLabel: 'Include donor badges such as Equicord Donor' }),
                h(Text, { muted: true }, 'Uses Discord’s useBadges list plus ProfileBadge/RenderBadge JSX hooks (Rain/Bunny). Data from badges.equicord.org and plugins.obamabot.me/BadgeVault.'));
        },
    };
}
GlobalBadges.defaults = { showPrefix: true, showCustom: true, showDonor: true, placeLeft: false };
