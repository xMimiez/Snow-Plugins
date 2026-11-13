import { ui } from '../runtime.js';

// Discord shows QUEST_BAR_MOBILE (content 13) in MOBILE_HOME_DOCK_AREA (placement 2),
// the card that sits above the You bar. Quest Home uses content 12 and stays available.
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

export function componentName(type) {
    if (!type || typeof type === 'string') return '';
    return type.displayName || type.name || type.type?.displayName || type.type?.name || '';
}

export function isMobileDockKey(value) {
    return value === 2 || value === '2' || value === 'MOBILE_HOME_DOCK_AREA';
}

export function isQuestPopup(type, props) {
    const name = componentName(type);
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
    for (const map of [metro?.modules, metro?.cache, metro?.moduleCache]) {
        if (!map) continue;
        const values = typeof map.values === 'function' ? map.values() : Object.values(map);
        for (const item of values) consider(item);
    }
}

export default function HideQuestPopup(r) {
    const { h, React } = r;
    const { Page, Text } = ui(r);
    return {
        start() {
            r.patch('after', React, 'createElement', (_args, result) => {
                if (!r.active || result == null || result === false) return;
                const next = stripQuestPopups(result, React);
                if (next !== result) return next;
            });
            const jsx = r.B.api?.react?.jsx;
            if (jsx?.onJsxCreate && jsx?.deleteJsxCreate) {
                for (const name of POPUP_NAMES) {
                    const callback = (_component, element) => {
                        if (!r.active) return;
                        const next = stripQuestPopups(element, React);
                        if (next !== element) return next;
                    };
                    jsx.onJsxCreate(name, callback);
                    r.own(() => jsx.deleteJsxCreate(name, callback));
                }
            }
            const holder = r.find(...DOCK_MAPS) || r.find(DOCK_MAPS[0]) || r.find(DOCK_MAPS[1])
                || r.byStore('QuestsStore') || r.byStore('QuestStore');
            let maps = 0;
            if (holder) {
                for (const key of DOCK_MAPS) {
                    const map = holder[key];
                    if (map && typeof map.get === 'function' && r.patch('instead', map, 'get', (args, next) => {
                        if (isMobileDockKey(args?.[0])) return undefined;
                        return next(...args);
                    })) maps++;
                }
            }
            let readers = 0;
            eachExport(r.metro, (parent, key, fn) => {
                const source = functionSource(fn);
                if (source.length > 8000 || source === '') return;
                if (!source.includes('getQuestDeliveryDataForPlacement') && !source.includes('MOBILE_HOME_DOCK_AREA')) return;
                if (r.patch('instead', parent, key, (args, next) => blocksDockDelivery(source, args) ? null : next(...args))) readers++;
            });
            r.status.support = maps || readers
                ? `You bar quest dock hidden (${maps} placement map${maps === 1 ? '' : 's'}, ${readers} reader${readers === 1 ? '' : 's'})`
                : 'You bar quest dock hidden by component';
        },
        Settings() {
            return h(Page, { title: 'HideQuestPopup' },
                h(Text, null, 'The quest popup above the You bar is always hidden.'),
                h(Text, { muted: true }, 'Quest Home and the Quests button on your profile stay available.'));
        },
    };
}
