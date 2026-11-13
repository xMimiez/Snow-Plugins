import { ui } from '../runtime.js';

// Discord shows QUEST_BAR_MOBILE (content 13) in MOBILE_HOME_DOCK_AREA (placement 2),
// the card that sits above the You bar. Hide This dismisses that content. Quest Home
// uses content 12 and stays available.
export const QUEST_BAR_MOBILE = 13;
export const QUEST_BAR_DISMISS_FLAG = 2;
export const POPUP_NAMES = [
    'QuestBar',
    'QuestsBar',
    'MobileQuestBar',
    'QuestBarMobile',
    'MobileQuestDock',
    'QuestDock',
    'QuestHomeDock',
    'QuestPromotion',
    'QuestEntrypoint',
    'QuestsEntrypoint',
    'RunningQuest',
    'ActiveQuestBar',
    'QuestDiscoveryBar',
    'QuestPopup',
    'QuestNudge',
    'QuestUpsell',
    'QuestBanner',
    'QuestCallout',
];

const NAME_RE = /^(Mobile)?Quest(s)?(Bar|BarMobile|Dock|Popup|Promotion|Promo|Entrypoint|Nudge|Upsell|Banner|Callout)$/;
const DOCK_MAPS = ['questAdDecisionByPlacement', 'questToDeliverForPlacement'];
const DOCK_KEYS = [2, '2', 'MOBILE_HOME_DOCK_AREA', QUEST_BAR_MOBILE, 'QUEST_BAR_MOBILE'];
const RETRIES_MS = [800, 2500, 6000, 15000];
const FLUX_EVENTS = [
    'QUESTS_FETCH_QUEST_TO_DELIVER_SUCCESS',
    'QUESTS_FETCH_CURRENT_QUESTS_SUCCESS',
    'QUESTS_USER_STATUS_UPDATE',
    'CONNECTION_OPEN',
];
const MAX_ATTEMPTS = 2;

export function componentName(type) {
    if (!type || typeof type === 'string') return '';
    return type.displayName || type.name || type.type?.displayName || type.type?.name || '';
}

export function isMobileDockKey(value) {
    return value === 2 || value === '2' || value === 'MOBILE_HOME_DOCK_AREA';
}

export function isQuestPopup(type, props) {
    const name = componentName(type);
    if (/ContextMenu|ActionSheet/i.test(name)) return false;
    if (NAME_RE.test(name)) return true;
    if (!props || typeof props !== 'object') return false;
    const content = props.questContent ?? props.sourceQuestContent ?? props.contentType;
    if (content === 13 || content === 'QUEST_BAR_MOBILE' || content === 'quest_bar_mobile') return true;
    const placement = props.placement ?? props.placementArea ?? props.area;
    const placementText = placement == null ? '' : String(placement);
    if (placementText === 'MOBILE_HOME_DOCK_AREA' || placementText === 'MOBILE_QUEST_DOCK') return true;
    if ((placement === 2 || placement === '2') && (props.quest || props.questId || props.questOrQuests)) return true;
    const label = [props.accessibilityLabel, props.testID, props.nativeID].filter(value => typeof value === 'string').join(' ');
    return /quest/i.test(label) && /bar|dock|popup|promo|banner/i.test(`${label} ${name}`);
}

export function blocksDockDelivery(source, args) {
    if (typeof source !== 'string' || !args?.length) return false;
    if (!source.includes('getQuestDeliveryDataForPlacement') && !source.includes('MOBILE_HOME_DOCK_AREA')) return false;
    const arg = args[0];
    return isMobileDockKey(arg) || arg === 13 || arg === 'QUEST_BAR_MOBILE';
}

export function isDismissFunction(fn) {
    if (typeof fn !== 'function') return false;
    const source = functionSource(fn);
    return source.includes('QUESTS_DISMISS_CONTENT_BEGIN') && source.includes('QUESTS_DISMISS_CONTENT');
}

export function questDismissedFromBar(quest) {
    const status = quest?.userStatus || quest?.user_status || quest;
    const flags = Number(status?.dismissedQuestContent ?? status?.dismissed_quest_content ?? 0);
    return (flags & QUEST_BAR_DISMISS_FLAG) === QUEST_BAR_DISMISS_FLAG;
}

export function questIdFromProps(props) {
    return snowflake(idFrom(props));
}

export function collectDockQuestIds(holder, now = Date.now()) {
    const ids = [];
    const seen = new Set();
    const add = value => {
        const id = snowflake(idFrom(value));
        if (!id || seen.has(id)) return;
        seen.add(id);
        ids.push(id);
    };
    if (!holder || typeof holder !== 'object') return ids;
    for (const key of [...DOCK_MAPS, 'earnedQuestForPlacement']) {
        const map = holder[key];
        if (!map || typeof map.get !== 'function') continue;
        for (const placement of DOCK_KEYS) {
            try { add(map.get(placement)); } catch { /* the store can throw for an unknown key */ }
        }
    }
    let quests = holder.quests;
    if (typeof quests === 'function') {
        try { quests = quests.call(holder); } catch { quests = null; }
    }
    const list = quests instanceof Map ? [...quests.values()] : (quests && typeof quests === 'object' ? Object.values(quests) : []);
    for (const quest of list) {
        if (!quest || typeof quest !== 'object') continue;
        if (questDismissedFromBar(quest) || isExpired(quest, now)) continue;
        add(quest);
    }
    return ids;
}

export async function dismissDockQuest({ discord, dismiss, questId, content = QUEST_BAR_MOBILE, publish } = {}) {
    const id = snowflake(questId);
    if (!id) return false;
    if (typeof dismiss === 'function') {
        try {
            await dismiss(id, content);
            return 'client';
        } catch (error) {
            if (typeof discord !== 'function') throw error;
        }
    }
    if (typeof discord !== 'function') return false;
    const result = await discord(`/quests/${id}/dismissible-content/${content}/dismiss`, { method: 'POST', body: '{}' });
    const body = result && typeof result.json === 'function' ? result.json() : null;
    if (typeof publish === 'function' && body && typeof body === 'object') publish(body);
    return 'http';
}

export function stripQuestPopups(element, React) {
    if (!element || typeof element !== 'object' || !element.props) return element;
    if (isQuestPopup(element.type, element.props)) return false;
    const children = element.props.children;
    if (children == null) return element;
    const list = Array.isArray(children) ? children : [children];
    if (!list.some(child => child && typeof child === 'object' && isQuestPopup(child.type, child.props))) return element;
    const next = list.filter(child => !(child && typeof child === 'object' && isQuestPopup(child.type, child.props)));
    return React.cloneElement(element, { children: Array.isArray(children) ? next : (next[0] ?? null) });
}

function snowflake(value) {
    const text = String(value ?? '');
    return /^\d{15,22}$/.test(text) ? text : '';
}

function idFrom(value) {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value !== 'object') return '';
    const direct = value.questId ?? value.quest_id ?? value.id;
    if (direct != null && typeof direct !== 'object') return String(direct);
    if (value.quest) return idFrom(value.quest);
    const list = value.quests || value.questOrQuests;
    if (Array.isArray(list) && list.length) return idFrom(list[0]);
    return '';
}

function isExpired(quest, now) {
    const raw = quest?.expiresAt ?? quest?.expires_at ?? quest?.config?.expiresAt ?? quest?.config?.expires_at;
    if (!raw) return false;
    const time = new Date(raw).getTime();
    return Number.isFinite(time) && time < now;
}

function functionSource(fn) {
    try { return Function.prototype.toString.call(fn); } catch { return ''; }
}

function eachExport(metro, visit) {
    const seen = new Set();
    const consider = value => {
        if (!value || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) return;
        seen.add(value);
        const target = typeof value === 'function' ? { default: value } : value;
        for (const key of Object.keys(target)) {
            if (typeof target[key] === 'function') visit(target, key, target[key]);
        }
        if (value !== target) consider(value.exports);
        consider(value.publicModule?.exports);
    };
    const maps = [metro?.modules, metro?.cache, metro?.moduleCache];
    if (Array.isArray(metro)) maps.push(metro);
    for (const map of maps) {
        if (!map) continue;
        const values = typeof map.values === 'function' ? map.values() : Object.values(map);
        for (const item of values) consider(item);
    }
}

function findDismissFunction(metro) {
    let found = null;
    eachExport(metro, (_parent, _key, fn) => {
        if (!found && isDismissFunction(fn)) found = fn;
    });
    if (found || typeof metro?.find !== 'function') return found;
    try {
        const mod = metro.find(module => module && typeof module === 'object' && Object.values(module).some(isDismissFunction));
        if (mod) found = Object.values(mod).find(isDismissFunction) || null;
    } catch { /* metro find can throw while modules are still loading */ }
    return found;
}

function findHolder(r) {
    return r.find(...DOCK_MAPS) || r.find(DOCK_MAPS[0]) || r.find(DOCK_MAPS[1])
        || r.byStore('QuestsStore') || r.byStore('QuestStore') || r.find('quests');
}

export default function HideQuestPopup(r) {
    const { h, React } = r;
    const { Page, Text } = ui(r);
    const extraIds = new Set();
    const attempts = new Map();
    const inflight = new Set();
    let dismissFn = null;
    let queued = false;

    const publish = body => {
        const dispatcher = r.common?.FluxDispatcher;
        if (typeof dispatcher?.dispatch === 'function') {
            try { dispatcher.dispatch({ type: 'QUESTS_DISMISS_CONTENT_SUCCESS', dismissedQuestUserStatus: body }); } catch { /* the reducer owns this payload */ }
        }
    };

    async function hide() {
        if (!r.active) return;
        const holder = findHolder(r);
        const ids = collectDockQuestIds(holder);
        for (const id of extraIds) if (!ids.includes(id)) ids.push(id);
        if (!dismissFn) dismissFn = findDismissFunction(r.metro);
        let dismissed = 0;
        for (const id of ids) {
            if (!r.active || inflight.has(id)) continue;
            const known = holder?.quests?.get?.(id) || holder?.getQuest?.(id);
            if (known && questDismissedFromBar(known)) continue;
            const tries = attempts.get(id) || 0;
            if (tries >= MAX_ATTEMPTS) continue;
            attempts.set(id, tries + 1);
            inflight.add(id);
            try {
                const how = await dismissDockQuest({
                    discord: (path, options) => r.discord(path, options),
                    dismiss: dismissFn,
                    questId: id,
                    publish,
                });
                if (how) dismissed++;
            } catch (error) {
                r.status.lastError = error?.message || String(error);
            } finally {
                inflight.delete(id);
            }
        }
        if (dismissed) r.status.support = `Hide This sent for ${dismissed} quest${dismissed === 1 ? '' : 's'}`;
    }

    function requestHide() {
        if (!r.active || queued) return;
        queued = true;
        Promise.resolve().then(() => {
            queued = false;
            void hide();
        });
    }

    return {
        start() {
            r.patch('after', React, 'createElement', (_args, result) => {
                if (!r.active || result == null || result === false) return;
                const next = stripQuestPopups(result, React);
                if (next !== result) {
                    const id = questIdFromProps(result.props);
                    if (id) extraIds.add(id);
                    requestHide();
                    return next;
                }
            });
            const jsx = r.B.api?.react?.jsx;
            if (jsx?.onJsxCreate && jsx?.deleteJsxCreate) {
                for (const name of POPUP_NAMES) {
                    const callback = (_component, element) => {
                        if (!r.active) return;
                        const next = stripQuestPopups(element, React);
                        if (next !== element) {
                            const id = questIdFromProps(element?.props);
                            if (id) extraIds.add(id);
                            requestHide();
                            return next;
                        }
                    };
                    jsx.onJsxCreate(name, callback);
                    r.own(() => jsx.deleteJsxCreate(name, callback));
                }
            }
            eachExport(r.metro, (parent, key, fn) => {
                if (!dismissFn && isDismissFunction(fn)) dismissFn = fn;
                const source = functionSource(fn);
                if (source.length > 8000 || source === '') return;
                if (!source.includes('getQuestDeliveryDataForPlacement') && !source.includes('MOBILE_HOME_DOCK_AREA')) return;
                r.patch('instead', parent, key, (args, next) => blocksDockDelivery(source, args) ? null : next(...args));
            });
            const holder = findHolder(r);
            if (typeof holder?.addChangeListener === 'function') {
                const listener = () => requestHide();
                try {
                    holder.addChangeListener(listener);
                    r.own(() => holder.removeChangeListener?.(listener));
                } catch { /* some stores reject listeners before login */ }
            }
            for (const type of FLUX_EVENTS) {
                try { r.subscribe(type, () => requestHide()); }
                catch { break; }
            }
            for (const delay of RETRIES_MS) {
                const timer = setTimeout(() => requestHide(), delay);
                r.own(() => clearTimeout(timer));
            }
            requestHide();
            r.status.support = 'Hide This runs for the You bar quest';
        },
        Settings() {
            return h(Page, { title: 'HideQuestPopup' },
                h(Text, null, 'Hide This runs on its own for the quest above the You bar.'),
                h(Text, { muted: true }, 'Quest Home and the Quests button on your profile stay available.'));
        },
    };
}
