import { ui } from '../runtime.js';

const QUICK = /^(edit message|reply|forward)$/i;
const DELETE = /^(delete|delete message)$/i;
const CONTAINER = /ActionSheet|Modal|Navigator|FlashList|FlatList|SectionList|ScrollView|^(Chat|Channel|Guild|Screen|Home|Page)(Screen|View|Page)?$/i;

function componentName(type) {
    if (!type || typeof type === 'string') return '';
    return type.displayName || type.name || type.type?.displayName || type.type?.name || '';
}

export function rowText(node) {
    const chunks = [];
    const visit = (value, depth) => {
        if (depth > 8 || value == null || value === false || typeof value === 'function') return;
        if (typeof value === 'string' || typeof value === 'number') {
            chunks.push(String(value));
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(entry => visit(entry, depth + 1));
            return;
        }
        if (typeof value === 'object') {
            if (value.props) visit(value.props.children, depth + 1);
            visit(value.message, depth + 1);
            visit(value.content, depth + 1);
            if (!value.props) {
                visit(value.label, depth + 1);
                visit(value.text, depth + 1);
            }
        }
    };
    const props = node?.props || {};
    visit(props.label, 0);
    visit(props.title, 0);
    visit(props.accessibilityLabel, 0);
    visit(props.children, 0);
    return chunks.join(' ').replace(/\s+/g, ' ').trim();
}

function labelId(node) {
    const label = node?.props?.label || node?.props?.accessibilityLabel;
    const id = label?.id || label?.key;
    return id ? String(id).toUpperCase() : '';
}

export function messageIdOf(message) {
    const id = message?.id ?? message?.messageId ?? message?.message_id;
    if (id == null || id === '') return '';
    return String(id);
}

export function messageLike(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (value.author || value.author_id || value.authorId) return true;
    if (typeof value.content === 'string') return true;
    if (Array.isArray(value.attachments) || Array.isArray(value.embeds)) return true;
    return false;
}

export function isTempDeleteRow(node) {
    if (!node || typeof node !== 'object') return false;
    if (node.key === 'mime-temp-delete' || node.props?.key === 'mime-temp-delete') return true;
    return /^temp delete$/i.test(rowText(node));
}

export function isPlainDeleteRow(node) {
    if (!node?.props || isTempDeleteRow(node)) return false;
    const id = labelId(node);
    if (/HIDE|LOGGER|BETTER|SILENT|TEMP/.test(id)) return false;
    if (id === 'DELETE' || id === 'DELETE_MESSAGE' || id === 'MESSAGE_DELETE') return true;
    return DELETE.test(rowText(node));
}

function isQuickRow(node) {
    const id = labelId(node);
    if (/EDIT_MESSAGE|MESSAGE_REPLY|^REPLY$|FORWARD/.test(id)) return true;
    return QUICK.test(rowText(node));
}

function isActionRow(node) {
    if (!node?.props) return false;
    const name = componentName(node.type);
    if (name === 'ButtonRow' || name === 'ActionSheetRow' || name === 'FormRow' || name === 'ContextMenuRow') return true;
    if (typeof node.props.onPress !== 'function' && typeof node.props.action !== 'function') return false;
    return isQuickRow(node) || isPlainDeleteRow(node) || isTempDeleteRow(node);
}

function findNode(node, pred, depth = 0) {
    if (depth > 14 || node == null) return null;
    if (pred(node)) return node;
    if (Array.isArray(node)) {
        for (const child of node) {
            const found = findNode(child, pred, depth + 1);
            if (found) return found;
        }
        return null;
    }
    const children = node?.props?.children;
    return children == null ? null : findNode(children, pred, depth + 1);
}

function insertAt(React, node, row, mode, state, depth = 0) {
    if (state.done || depth > 14 || node == null) return node;
    if (Array.isArray(node)) {
        let changed = false;
        const mapped = [];
        for (const child of node) {
            if (state.done) {
                mapped.push(child);
                continue;
            }
            const next = insertAt(React, child, row, mode, state, depth + 1);
            if (next !== child) changed = true;
            mapped.push(next);
        }
        if (state.done) return changed ? mapped : node;
        if (mode === 'delete') {
            const index = mapped.findIndex(isPlainDeleteRow);
            if (index >= 0) {
                state.done = true;
                const copy = mapped.slice();
                copy.splice(index + 1, 0, row);
                return copy;
            }
        }
        if (mode === 'quick') {
            let anchor = -1;
            mapped.forEach((child, index) => { if (isQuickRow(child)) anchor = index; });
            if (anchor >= 0) {
                state.done = true;
                const copy = mapped.slice();
                copy.splice(anchor + 1, 0, row);
                return copy;
            }
        }
        if (mode === 'first' && mapped.some(isActionRow)) {
            state.done = true;
            return mapped.concat(row);
        }
        return changed ? mapped : node;
    }
    if (!React.isValidElement(node) || node.props == null) return node;
    let changed = false;
    const props = {};
    for (const key of Object.keys(node.props)) {
        const value = node.props[key];
        if (value == null) continue;
        const single = key === 'children' && !Array.isArray(value) && React.isValidElement(value);
        if (!single && !Array.isArray(value) && !React.isValidElement(value)) continue;
        const target = single ? [value] : value;
        const next = insertAt(React, target, row, mode, state, depth + 1);
        if (next !== target) {
            props[key] = next;
            changed = true;
        }
    }
    return changed ? React.cloneElement(node, props) : node;
}

export function placeTempDelete(React, tree, onPress) {
    if (!tree || typeof onPress !== 'function' || findNode(tree, isTempDeleteRow)) return tree;
    const sample = findNode(tree, isPlainDeleteRow) || findNode(tree, isActionRow);
    if (!sample?.type) return tree;
    const row = React.createElement(sample.type, {
        key: 'mime-temp-delete',
        label: 'Temp Delete',
        title: 'Temp Delete',
        accessibilityLabel: 'Temp Delete',
        onPress,
    });
    const state = { done: false };
    const withDelete = insertAt(React, tree, row, 'delete', state);
    if (state.done) return withDelete;
    const withQuick = insertAt(React, withDelete, row, 'quick', state);
    if (state.done) return withQuick;
    const withFirst = insertAt(React, withQuick, row, 'first', state);
    return state.done ? withFirst : tree;
}

function recordId(item) {
    if (!item || typeof item !== 'object') return '';
    if (messageLike(item)) return messageIdOf(item);
    if (item.message && messageLike(item.message)) return messageIdOf(item.message);
    return '';
}

export function filterBucket(bucket, hidden) {
    if (!bucket || !hidden?.size) return bucket;
    const keep = list => list.filter(item => {
        const id = recordId(item);
        return !id || !hidden.has(id);
    });
    if (Array.isArray(bucket)) {
        const next = keep(bucket);
        return next.length === bucket.length ? bucket : next;
    }
    const key = Array.isArray(bucket._array) ? '_array' : Array.isArray(bucket.messages) ? 'messages' : '';
    if (!key) return bucket;
    const next = keep(bucket[key]);
    if (next.length === bucket[key].length) return bucket;
    const copy = Object.assign(Object.create(Object.getPrototypeOf(bucket)), bucket);
    copy[key] = next;
    return copy;
}

export function dropStoredMessage(bucket, id) {
    const list = Array.isArray(bucket) ? bucket : Array.isArray(bucket?._array) ? bucket._array : Array.isArray(bucket?.messages) ? bucket.messages : null;
    if (!list) return false;
    const index = list.findIndex(item => recordId(item) === id);
    if (index < 0) return false;
    list.splice(index, 1);
    return true;
}

export function isHiddenRecord(value, hidden) {
    if (!value || typeof value !== 'object' || !hidden?.size) return false;
    if (messageLike(value) && hidden.has(messageIdOf(value))) return true;
    if (value.message && messageLike(value.message) && hidden.has(messageIdOf(value.message))) return true;
    return false;
}

export function stripHiddenRows(rows, hidden) {
    if (!hidden?.size || rows == null) return rows;
    const walk = (value, depth) => {
        if (depth > 8 || value == null) return value;
        if (Array.isArray(value)) {
            let changed = false;
            const next = [];
            for (const item of value) {
                const child = walk(item, depth + 1);
                if (child == null) { changed = true; continue; }
                if (child !== item) changed = true;
                next.push(child);
            }
            return changed ? next : value;
        }
        if (typeof value !== 'object') return value;
        return isHiddenRecord(value, hidden) ? null : value;
    };
    return walk(rows, 0);
}

export function isHiddenMessageElement(element, hidden) {
    if (!element?.props || !hidden?.size) return false;
    const name = componentName(element.type);
    if (name && CONTAINER.test(name)) return false;
    const props = element.props;
    const candidates = [props.message, props.item];
    for (const item of candidates) {
        if (messageLike(item) && hidden.has(messageIdOf(item))) return true;
    }
    return false;
}

function channelIdOf(message) {
    const value = message?.channel_id || message?.channelId || message?.getChannelId?.() || '';
    return value == null ? '' : String(value);
}

export default function TempDelete(r) {
    const { h } = r;
    const { Page, Text } = ui(r);
    const hidden = new Set();
    let rawGetMessages = null;
    let messageStore = null;

    function hide(message) {
        const id = messageIdOf(message);
        if (!id || !r.active) return;
        hidden.add(id);
        const channelId = channelIdOf(message);
        if (rawGetMessages && channelId) {
            try { dropStoredMessage(rawGetMessages(channelId), id); } catch (error) { r.error('Temp Delete', error); }
        }
        try { messageStore?.emitChange?.(); } catch (error) { r.error('Temp Delete', error); }
    }

    return {
        hide,
        Settings() {
            return h(Page, { title: 'Temp Delete' },
                h(Text, null, 'Temp Delete sits under Delete Message on every message, including messages you did not send.'),
                h(Text, { muted: true }, 'The message is removed on this device only. It comes back the next time Discord starts. Nothing is deleted on Discord’s servers.'));
        },
        start() {
            messageStore = r.byStore('MessageStore') || r.find('getMessages', 'getMessage') || r.find('getMessages');
            if (typeof messageStore?.getMessages === 'function') rawGetMessages = messageStore.getMessages.bind(messageStore);
            if (messageStore && rawGetMessages) {
                r.patch('after', messageStore, 'getMessages', (_args, result) => {
                    if (!r.active) return;
                    const next = filterBucket(result, hidden);
                    return next === result ? undefined : next;
                });
            }
            if (messageStore && typeof messageStore.getMessage === 'function') {
                r.patch('instead', messageStore, 'getMessage', (args, original) => {
                    const result = original(...args);
                    if (!r.active || !result) return result;
                    return hidden.has(messageIdOf(result)) ? undefined : result;
                });
            }
            r.patchRows(rows => stripHiddenRows(rows, hidden));
            r.patch('after', r.React, 'createElement', (_args, result) => {
                if (!r.active || !isHiddenMessageElement(result, hidden)) return;
                return false;
            });
            const sheets = r.find('openLazy', 'hideActionSheet');
            const patched = !!(sheets && r.patch('after', sheets, 'openLazy', (args, result) => {
                if (args?.[1] !== 'MessageLongPressActionSheet' || !result?.then) return;
                return result.then(module => {
                    if (!r.active || typeof module?.default !== 'function' || module.default.prototype?.isReactComponent) return module;
                    const Original = module.default;
                    function WithTempDelete(screenProps) {
                        const tree = Original(screenProps);
                        if (!r.active) return tree;
                        const message = screenProps?.message;
                        const press = () => {
                            try { sheets.hideActionSheet?.(); } catch { /* The sheet can already be gone. */ }
                            Promise.resolve().then(() => { if (r.active) hide(message); }).catch(error => { if (r.active) r.error('Temp Delete', error); });
                        };
                        try { return placeTempDelete(r.React, tree, press) ?? tree; }
                        catch (error) { r.error('Temp Delete', error); return tree; }
                    }
                    return { ...module, default: WithTempDelete };
                });
            }));
            r.status.messageMenu = patched ? 'patched' : 'unavailable';
        },
    };
}
