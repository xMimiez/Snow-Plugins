// Pin DMs mobile port. Copyright 2024 Vendicated and contributors.
// SPDX-License-Identifier: GPL-3.0-or-later
import { ui } from '../runtime.js';
import { appendAction, patchLazySheet } from '../action-sheet.js';
import { createInboxAdapter, HEADER_HEIGHT } from './pin-dms-list.js';
import { createPinData, DEFAULT_COLOR, SWATCHES } from './pin-dms-data.js';

export default function PinDms(r) {
    const { h, React, RN, store } = r, { Page, Text, Input, Button, Toggle } = ui(r);
    const data = createPinData(r);
    const channelStore = () => r.byStore('ChannelStore');
    const isDm = channel => channel && [1, 3].includes(channel.type);
    const getChannel = id => channelStore()?.getChannel?.(id);
    const recent = () => r.byStore('PrivateChannelSortStore')?.getPrivateChannelIds?.() || [];
    // Discord opens sheets at 60% of the screen, which cuts off the last buttons.
    // shortcut: the height is estimated from the button count, measure the content if the Page layout changes.
    const sheet = buttons => ({ height: Math.min((RN.Dimensions?.get?.('window')?.height || 800) * 0.85, 125 + buttons * 70) });
    const openEditor = props => r.open('category-edit', Editor, props, sheet(props.categoryId ? 9 : 8));
    const openCategory = categoryId => r.open('category-actions', CategoryActions, { categoryId }, sheet(6));
    const openChannel = channelId => {
        const list = data.categories(), pinned = list.some(c => c.channels.includes(channelId));
        r.open('channel-actions', ChannelActions, { channelId }, sheet(list.length + 2 + (pinned ? (store.pinOrder === 1 ? 4 : 2) - 1 : 0)));
    };
    const title = id => {
        const channel = getChannel(id);
        return channel?.name || channel?.recipients?.map(id => {
            const user = r.byStore('UserStore')?.getUser?.(id);
            return user?.globalName || user?.global_name || user?.username || 'Unknown user';
        }).join(', ') || 'Direct Message';
    };
    function guard(action, owner = data.userId()) { return async () => {
        if (!r.active) return;
        try {
            if (owner !== data.userId()) throw new Error('Account changed. Reopen this menu.');
            await action();
        } catch (e) { if (r.active) r.error('Pin DMs', e); }
    }; }
    function useStores() {
        r.useRefresh();
        React.useEffect(() => {
            if (!r.active) return;
            const stores = ['UserStore', 'ChannelStore', 'PrivateChannelSortStore'].map(name => r.byStore(name)).filter(Boolean);
            const update = () => { if (r.active) r.changed(); };
            for (const s of stores) s.addChangeListener?.(update);
            let disposed = false;
            const cleanup = () => { if (disposed) return; disposed = true; for (const s of stores) s.removeChangeListener?.(update); };
            r.own(cleanup);
            return cleanup;
        }, []);
    }
    function Editor({ categoryId, channelId, close }) {
        const category = data.categories().find(c => c.id === categoryId);
        const [name, setName] = React.useState(category?.name || `Pin Category ${data.categories().length + 1}`);
        const [color, setColor] = React.useState(`#${(category?.color ?? DEFAULT_COLOR).toString(16).padStart(6, '0')}`);
        const owner = React.useRef(data.userId());
        const [saving, setSaving] = React.useState(false);
        const pending = React.useRef(false);
        const savedId = React.useRef(categoryId);
        return h(Page, { title: categoryId ? 'Edit Category' : 'New Category', close },
            h(Text, null, 'Name'), h(Input, { value: name, onChange: setName }),
            h(Text, null, 'Color (#RRGGBB)'), h(Input, { value: color, onChange: setColor, autoCapitalize: 'none' }),
            h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap' } }, ...SWATCHES.map(c => {
                const hex = '#' + c.toString(16).padStart(6, '0');
                return h(RN.Pressable, { key: c, accessibilityRole: 'button', accessibilityLabel: `Color ${hex}`, onPress: () => setColor(hex), style: { width: 32, height: 32, margin: 4, backgroundColor: hex, borderWidth: color === hex ? 3 : 0, borderColor: '#fff' } });
            })),
            h(Button, { text: saving ? 'Saving…' : 'Save', disabled: saving || !name.trim() || !/^#[0-9a-f]{6}$/i.test(color), onPress: guard(async () => {
                if (pending.current) return;
                if (owner.current !== data.userId()) throw new Error('Account changed. Reopen the category editor.');
                pending.current = true; setSaving(true);
                try {
                    // Retain the new ID while retrying a failed flush, rather than creating twice.
                    savedId.current = data.save(savedId.current, name, parseInt(color.slice(1), 16), channelId);
                    await r.api.storage.flush();
                    if (r.active && owner.current === data.userId()) close?.();
                } finally { pending.current = false; if (r.active) setSaving(false); }
            }) }),
            categoryId ? h(Button, { text: 'Delete category', variant: 'secondary', onPress: guard(() => { data.remove(categoryId); close?.(); }) }) : null);
    }
    function CategoryActions({ categoryId, close }) {
        useStores();
        const list = data.categories(), index = list.findIndex(c => c.id === categoryId), category = list[index];
        if (!category) return h(Page, { title: 'Category no longer exists', close });
        return h(Page, { title: category.name, close },
            h(Button, { text: 'Edit category', onPress: guard(() => { close?.(); openEditor({ categoryId }); }) }),
            h(Button, { text: category.collapsed ? 'Expand category' : 'Collapse category', onPress: guard(() => data.collapse(categoryId)) }),
            h(Button, { text: 'Move up', disabled: index === 0, onPress: guard(() => data.moveCategory(categoryId, -1)) }),
            h(Button, { text: 'Move down', disabled: index === list.length - 1, onPress: guard(() => data.moveCategory(categoryId, 1)) }),
            h(Button, { text: 'Delete category', onPress: guard(() => { data.remove(categoryId); close?.(); }) }));
    }
    function ChannelActions({ channelId, close }) {
        useStores();
        const category = data.categories().find(c => c.channels.includes(channelId));
        const index = category?.channels.indexOf(channelId) ?? -1;
        return h(Page, { title: title(channelId), close },
            category ? h(Button, { text: 'Unpin DM', onPress: guard(() => { data.unpin(channelId); close?.(); }) }) : null,
            category ? h(Button, { text: `Edit ${category.name}`, onPress: guard(() => { close?.(); openEditor({ categoryId: category.id }); }) }) : null,
            category && store.pinOrder === 1 ? h(RN.View, null,
                h(Button, { text: 'Move up', disabled: index <= 0, onPress: guard(() => data.moveChannel(channelId, -1)) }),
                h(Button, { text: 'Move down', disabled: index >= category.channels.length - 1, onPress: guard(() => data.moveChannel(channelId, 1)) })) : null,
            ...data.categories().filter(c => c.id !== category?.id).map(c => h(Button, { key: c.id, text: `Pin in ${c.name}`, onPress: guard(() => { data.pin(channelId, c.id); close?.(); }) })),
            h(Button, { text: 'New category', onPress: guard(() => { close?.(); openEditor({ channelId }); }) }));
    }
    // The category header being dragged; the DM list stops scrolling while one is held.
    let dragId = null;
    const setDrag = id => { dragId = id; r.changed(); };
    // Hold a category header to edit it, hold and drag to reorder. `live` holds the header's current props, since list rows are recycled.
    // A gesture-handler pan is needed: Discord's panel swipe cancels plain touches as soon as the finger moves.
    function dragGesture(Gesture, live) {
        let id = null, moved, base;
        return Gesture.Pan().activateAfterLongPress(350).runOnJS(true)
            .onStart(() => { id = live.current.section.id; moved = false; base = 0; setDrag(id); })
            .onUpdate(({ translationY }) => {
                // shortcut: one place per header height of drag, not the real row positions; measure rows if categories get long.
                const steps = Math.trunc((translationY - base) / HEADER_HEIGHT);
                if (!steps || id == null) return;
                moved = true; base += steps * HEADER_HEIGHT;
                guard(() => { for (let n = Math.abs(steps); n--;) data.moveCategory(id, Math.sign(steps)); })();
            })
            .onEnd(() => { if (!moved) live.current.edit(); })
            .onFinalize(() => { if (id != null && dragId === id) setDrag(null); id = null; });
    }
    function Header({ section }) {
        r.useRefresh();
        const uncategorized = section.id === 'uncategorized', muted = '#B5BAC1';
        const collapse = guard(() => uncategorized ? r.set('dmSectionCollapsed', !store.dmSectionCollapsed) : data.collapse(section.id));
        const edit = guard(() => openEditor({ categoryId: section.id }));
        const live = React.useRef(null);
        live.current = { section, edit };
        const handler = React.useMemo(() => r.find('GestureDetector', 'Gesture'), []);
        const gesture = React.useMemo(() => handler?.Gesture?.Pan ? dragGesture(handler.Gesture, live) : null, [handler]);
        React.useEffect(() => () => { if (dragId === live.current.section.id) setDrag(null); }, []);
        const body = h(RN.Pressable, {
            accessibilityRole: 'button', accessibilityLabel: section.name, accessibilityState: { expanded: !section.collapsed },
            style: { height: HEADER_HEIGHT, paddingLeft: 16, paddingRight: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: dragId === section.id ? '#FFFFFF1A' : undefined },
            onPress: collapse,
            ...(uncategorized ? {} : { onLongPress: gesture ? undefined : edit, accessibilityHint: 'Hold to edit, hold and drag to reorder',
                accessibilityActions: [{ name: 'longpress', label: 'Edit category' }], onAccessibilityAction: edit }),
        },
            h(Text, { heading: true, style: { color: section.color != null ? '#' + section.color.toString(16).padStart(6, '0') : muted, marginLeft: 0, marginBottom: 0 } }, section.name),
            // Equicord's collapse arrow, drawn from two borders: right when collapsed, down when expanded.
            h(RN.View, { style: { width: 7, height: 7, borderRightWidth: 2, borderBottomWidth: 2, borderColor: muted, transform: [{ rotate: section.collapsed ? '-45deg' : '45deg' }] } }));
        return gesture && !uncategorized ? h(handler.GestureDetector, { gesture }, body) : body;
    }
    const adaptList = createInboxAdapter(r, { data, recent, getChannel, Header, dragging: () => dragId != null });
    function menuChannel(props) {
        if (props?.message) return null;
        const channel = props?.channel || getChannel(props?.channelId);
        if (isDm(channel)) return channel;
        const userId = props?.userId || props?.user?.id;
        return userId ? recent().map(getChannel).find(c => c?.type === 1 && c.recipients?.includes(userId)) : null;
    }
    function menuItem(props) {
        const channel = menuChannel(props);
        if (!channel) return null;
        return { key: 'mime-pin-dms', label: 'Pin DMs', iconName: 'PinIcon', onPress: guard(() => openChannel(channel.id)) };
    }
    function patchChannelMenu() {
        // Rain permissionviewer/jumptotop show this module returning a second component.
        // Wrap that returned element, retaining each opening's props and original actions.
        const module = r.byName('ChannelLongPressActionSheet', true);
        const wrappers = new WeakMap();
        return r.patch('after', module, 'default', (_args, element) => {
            if (!r.active || !React.isValidElement(element) || !menuItem(element.props)) return;
            const Original = element.type;
            if (typeof Original !== 'function' || Original.prototype?.isReactComponent) return;
            if (!wrappers.has(Original)) wrappers.set(Original, function WithPinActions(props) {
                const tree = Original(props), item = r.active ? menuItem(props) : null;
                if (!item) return tree;
                return appendAction(r, tree, { ...item, onPress: () => {
                    if (!r.active) return;
                    r.find('hideActionSheet')?.hideActionSheet();
                    item.onPress();
                } });
            });
            const ref = Object.getOwnPropertyDescriptor(element, 'ref')?.value || Object.getOwnPropertyDescriptor(element.props, 'ref')?.value;
            if (ref) return;
            return h(wrappers.get(Original), { ...element.props, key: element.key });
        });
    }
    function Settings({ close }) {
        useStores();
        return h(Page, { title: 'Pin DMs', close },
            h(Button, { text: `Order: ${store.pinOrder === 1 ? 'Custom' : 'Most recent message'}`, onPress: () => r.set('pinOrder', store.pinOrder === 1 ? 0 : 1) }),
            h(Toggle, { setting: 'nativeList', label: 'Categories in compatible native DM lists' }),
            h(Text, { heading: true }, 'Categories'),
            ...data.categories().map(c => h(Button, { key: c.id, text: c.name, variant: 'secondary', onPress: guard(() => openCategory(c.id)) })),
            h(Button, { text: 'New category', onPress: guard(() => openEditor({})) }),
            h(Text, { muted: true }, `Hold a DM and tap Pin DMs to add a category or pin it. ${r.status.nativeList ? 'Categories are connected to your DM list.' : 'Open your DM list to connect categories.'}`));
    }
    return { Settings, ChannelActions, CategoryActions, Editor, data, adaptList, start() {
        r.status.channelMenu = !!patchChannelMenu();
        const lazyMenu = patchLazySheet(r, (_key, props) => menuItem(props));
        r.status.channelMenu = r.status.channelMenu || !!lazyMenu;
        r.hook(['FlatList', 'AnimatedFlatList', 'FlashList'], adaptList);
        // Bind by export identity as well as name: production component names can be minified.
        const FlashList = r.D.FlashList || r.find('FlashList')?.FlashList;
        if (FlashList) r.patch('after', React, 'createElement', (args, result) => args[0] === FlashList ? adaptList(result) : undefined);
        // Discord's Messages tab renders a memo'd LegendList through the JSX runtime, which only an identity hook sees.
        const jsx = r.B.api?.react?.jsx, LegendList = r.find('AnimatedLegendList')?.AnimatedLegendList;
        if (LegendList && jsx?.onJsxCreate && jsx.deleteJsxCreate) {
            const adapt = (_type, element) => r.active ? adaptList(element) : undefined;
            jsx.onJsxCreate(LegendList, adapt); r.own(() => jsx.deleteJsxCreate(LegendList, adapt));
            // The list is already on screen when the plugin starts or stops; this store makes Discord render it again.
            const redraw = () => r.byStore('UserGuildSettingsStore')?.emitChange?.();
            redraw(); r.own(() => setTimeout(redraw));
        }
    } };
}
PinDms.defaults = { pinOrder: 0, dmSectionCollapsed: false, userBasedCategoryList: {}, nativeList: true };
