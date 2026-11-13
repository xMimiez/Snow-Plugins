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

export function selectsDockQuest(source) {
    if (typeof source !== 'string' || source === '' || source.length > 8000) return false;
    return source.includes('getQuestDeliveryDataForPlacement')
        || source.includes('MOBILE_HOME_DOCK_AREA')
        || source.includes('questToDeliverForPlacement')
        || /\.get\([^)]*\)[\s\S]{0,180}\.quest\.id/.test(source);
}

export function blocksDockDelivery(source, args) {
    if (!selectsDockQuest(source) || !args?.length) return false;
    return args.some(arg => isMobileDockKey(arg) || arg === 13 || arg === 'QUEST_BAR_MOBILE');
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

export function readPlacement(map, key, rawGets) {
    const raw = rawGets?.get?.(map);
    try { return typeof raw === 'function' ? raw.call(map, key) : map.get(key); } catch { return undefined; }
}

export function collectDockQuestIds(holder, now = Date.now(), rawGets) {
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
        for (const placement of DOCK_KEYS) add(readPlacement(map, placement, rawGets));
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

export function isYouCluster(element) {
    return /(^|\s)You(\s|$)/.test(nodeText(element, 0));
}

function isPage(element) {
    const type = element?.type;
    const name = typeof type === 'string' ? type : componentName(type);
    return /Scroll|List|Flash|Flat|Section|Home|Screen|Page/i.test(name);
}

export function isDockCard(element) {
    if (!element || typeof element !== 'object' || isYouCluster(element) || isPage(element)) return false;
    if (isQuestPopup(element.type, element.props)) return true;
    const ids = new Set();
    collectQuestSignals(element, 0, ids);
    if (ids.size > 1) return false;
    const text = nodeText(element, 0);
    return /get reward/i.test(text) && text.length < 320;
}

export function stripQuestPopups(element, React) {
    if (!element || typeof element !== 'object' || !element.props) return element;
    if (isQuestPopup(element.type, element.props)) return false;
    const children = element.props.children;
    if (children == null) return element;
    const list = Array.isArray(children) ? children : [children];
    const besideYou = list.some(child => child && typeof child === 'object' && isYouCluster(child));
    if (!list.some(child => child && typeof child === 'object' && (isQuestPopup(child.type, child.props) || (besideYou && isDockCard(child))))) return element;
    const next = list.filter(child => !(child && typeof child === 'object' && (isQuestPopup(child.type, child.props) || (besideYou && isDockCard(child) && !isYouCluster(child)))));
    return React.cloneElement(element, { children: Array.isArray(children) ? next : (next[0] ?? null) });
}

function nodeText(element, depth) {
    if (element == null || depth > 5) return '';
    if (typeof element === 'string' || typeof element === 'number') return ` ${element} `;
    if (Array.isArray(element)) return element.map(child => nodeText(child, depth + 1)).join(' ');
    if (typeof element !== 'object') return '';
    const props = element.props || {};
    const bits = [props.accessibilityLabel, props.testID, props.nativeID, props.title, props.label]
        .filter(value => typeof value === 'string')
        .join(' ');
    return ` ${bits} ${nodeText(props.children, depth + 1)} `;
}

function collectQuestSignals(element, depth, ids) {
    if (!element || depth > 6) return;
    if (Array.isArray(element)) {
        for (const child of element) collectQuestSignals(child, depth, ids);
        return;
    }
    if (typeof element !== 'object') return;
    const props = element.props;
    if (!props || typeof props !== 'object') return;
    for (const candidate of [props.quest, props.questOrQuests]) {
        const id = snowflake(idFrom(candidate));
        if (id && (candidate.config || candidate.userStatus || candidate.user_status || candidate.assets)) ids.add(id);
    }
    collectQuestSignals(props.children, depth + 1, ids);
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

function looksLikeQuestStore(value) {
    if (!value || typeof value !== 'object') return false;
    try {
        return typeof value.getQuest === 'function'
            || value.quests instanceof Map
            || value.questToDeliverForPlacement instanceof Map
            || value.questAdDecisionByPlacement instanceof Map;
    } catch { return false; }
}

function findHolders(r) {
    const found = [];
    const push = value => {
        if (looksLikeQuestStore(value) && !found.includes(value)) found.push(value);
    };
    push(r.find(...DOCK_MAPS));
    push(r.find(DOCK_MAPS[0]));
    push(r.find(DOCK_MAPS[1]));
    push(r.byStore('QuestsStore'));
    push(r.byStore('QuestStore'));
    push(r.find('quests'));
    const seen = new Set();
    const consider = value => {
        if (!value || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) return;
        seen.add(value);
        push(value);
        if (typeof value === 'object') {
            push(value.default);
            push(value.A);
            push(value.Z);
            consider(value.exports);
            consider(value.publicModule?.exports);
        }
    };
    for (const map of [r.metro?.modules, r.metro?.cache, r.metro?.moduleCache]) {
        if (!map) continue;
        const values = typeof map.values === 'function' ? map.values() : Object.values(map);
        for (const item of values) consider(item);
    }
    return found;
}

function noteQuestIds(element, ids, depth = 0) {
    if (!element || depth > 6 || typeof element !== 'object') return;
    if (Array.isArray(element)) {
        for (const child of element) noteQuestIds(child, ids, depth);
        return;
    }
    const id = questIdFromProps(element.props);
    if (id) ids.add(id);
    noteQuestIds(element.props?.children, ids, depth + 1);
}

export default function HideQuestPopup(r) {
    const { h, React } = r;
    const { Page, Text } = ui(r);
    const extraIds = new Set();
    const attempts = new Map();
    const inflight = new Set();
    const rawGets = new WeakMap();
    let dismissFn = null;
    let queued = false;
    let holders = [];

    const publish = body => {
        const dispatcher = r.common?.FluxDispatcher;
        if (typeof dispatcher?.dispatch === 'function') {
            try { dispatcher.dispatch({ type: 'QUESTS_DISMISS_CONTENT_SUCCESS', dismissedQuestUserStatus: body }); } catch { /* the reducer owns this payload */ }
        }
    };

    async function hide() {
        if (!r.active) return;
        if (!holders.length) holders = findHolders(r);
        const ids = [];
        for (const holder of holders) {
            for (const id of collectDockQuestIds(holder, Date.now(), rawGets)) {
                if (!ids.includes(id)) ids.push(id);
            }
        }
        for (const id of extraIds) if (!ids.includes(id)) ids.push(id);
        if (!dismissFn) dismissFn = findDismissFunction(r.metro);
        let dismissed = 0;
        for (const id of ids) {
            if (!r.active || inflight.has(id)) continue;
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
                if (how) {
                    dismissed++;
                    for (const holder of holders) {
                        const quest = (holder.quests ? readPlacement(holder.quests, id, rawGets) : undefined) || holder.getQuest?.(id);
                        if (quest?.userStatus && typeof quest.userStatus === 'object') {
                            const flags = Number(quest.userStatus.dismissedQuestContent) || 0;
                            quest.userStatus.dismissedQuestContent = flags | QUEST_BAR_DISMISS_FLAG;
                        }
                        try { holder.emitChange?.(); } catch { /* a plain module has no flux emitter */ }
                    }
                }
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
                    noteQuestIds(result, extraIds);
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
                            noteQuestIds(element, extraIds);
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
                if (!selectsDockQuest(source)) return;
                r.patch('instead', parent, key, (args, next) => blocksDockDelivery(source, args) ? null : next(...args));
            });
            holders = findHolders(r);
            for (const holder of holders) {
                for (const key of [...DOCK_MAPS, 'earnedQuestForPlacement']) {
                    const map = holder[key];
                    if (!map || typeof map.get !== 'function' || rawGets.has(map)) continue;
                    rawGets.set(map, map.get);
                    r.patch('instead', map, 'get', (args, next) => isMobileDockKey(args?.[0]) || args?.[0] === QUEST_BAR_MOBILE || args?.[0] === 'QUEST_BAR_MOBILE' ? undefined : next(...args));
                }
            }
            const holder = holders[0];
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
                h(Text, null, 'The quest card on the You bar is removed, and Hide This is pressed for that quest.'),
                h(Text, { muted: true }, 'Quest Home and the Quests button on your profile stay available.'));
        },
    };
}
