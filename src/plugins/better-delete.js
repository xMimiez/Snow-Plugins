/*
 * BetterDelete for Snow
 * Hide-from-message-loggers behavior from Equicord messageLoggerEnhanced
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ui } from '../runtime.js';

const QUICK = /^(edit message|reply|forward)$/i;
const DELETE = /^(delete|delete message)$/i;

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
            visit(value.defaultMessage, depth + 1);
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

export function labelId(node) {
    const label = node?.props?.label || node?.props?.accessibilityLabel;
    const id = label?.id || label?.key;
    return id ? String(id).toUpperCase() : '';
}

export function isQuickRow(node) {
    const id = labelId(node);
    if (/EDIT_MESSAGE|MESSAGE_REPLY|^REPLY$|FORWARD/.test(id)) return true;
    return QUICK.test(rowText(node));
}

export function isPlainDeleteRow(node) {
    if (!isActionRow(node)) return false;
    const id = labelId(node);
    if (/HIDE|LOGGER|BETTER/.test(id)) return false;
    if (id === 'DELETE' || id === 'DELETE_MESSAGE' || id === 'MESSAGE_DELETE') return true;
    return DELETE.test(rowText(node));
}

export function isActionRow(node) {
    if (!node || typeof node !== 'object' || !node.props) return false;
    const type = node.type;
    const name = type?.displayName || type?.name || type?.type?.displayName || type?.type?.name || '';
    if (name === 'ButtonRow' || name === 'ActionSheetRow' || name === 'FormRow' || name === 'ContextMenuRow') return true;
    if (typeof node.props.onPress !== 'function' && typeof node.props.action !== 'function') return false;
    const id = labelId(node);
    return QUICK.test(rowText(node)) || DELETE.test(rowText(node)) || /^BETTER DELETE$/i.test(rowText(node)) || /EDIT_MESSAGE|REPLY|FORWARD|DELETE/.test(id);
}

function childList(children) {
    if (children == null || children === false) return [];
    return Array.isArray(children) ? children : [children];
}

function relabel(React, row, key, label, onPress, clearIcon) {
    const props = {
        key,
        label,
        title: label,
        accessibilityLabel: label,
        onPress,
    };
    if (clearIcon) {
        props.icon = null;
        props.leading = null;
        props.IconComponent = null;
        props.children = label;
    } else if (typeof row.props.children === 'string' || typeof row.props.children === 'number') {
        props.children = label;
    } else if (row.props.children != null) {
        props.children = replaceMenuText(React, row.props.children, label);
    }
    return React.cloneElement(row, props);
}

function replaceMenuText(React, node, label) {
    if (typeof node === 'string' || typeof node === 'number') {
        const text = String(node).trim();
        return DELETE.test(text) || QUICK.test(text) ? label : node;
    }
    if (Array.isArray(node)) return node.map(child => replaceMenuText(React, child, label));
    if (!React.isValidElement(node) || node.props?.children == null) return node;
    const children = replaceMenuText(React, node.props.children, label);
    if (children === node.props.children) return node;
    return React.cloneElement(node, { children });
}

function stripDeletes(React, node, captured) {
    if (isPlainDeleteRow(node)) {
        captured.push(node);
        return null;
    }
    if (Array.isArray(node)) {
        let changed = false;
        const next = [];
        for (const child of node) {
            const walked = stripDeletes(React, child, captured);
            if (walked !== child) changed = true;
            if (walked != null) next.push(walked);
        }
        return changed ? next : node;
    }
    if (!React.isValidElement(node) || node.props == null) return node;
    let changed = false;
    const props = {};
    for (const key of Object.keys(node.props)) {
        const value = node.props[key];
        if (value == null) continue;
        if (key !== 'children' && !Array.isArray(value) && !React.isValidElement(value)) continue;
        const mapped = stripDeletes(React, value, captured);
        if (mapped !== value) {
            props[key] = mapped;
            changed = true;
        }
    }
    if (!changed) return node;
    const children = Object.prototype.hasOwnProperty.call(props, 'children') ? props.children : node.props.children;
    const original = childList(node.props.children);
    const remaining = childList(children).filter(child => child != null);
    if (original.length && original.every(isActionRow) && !remaining.length) return null;
    return React.cloneElement(node, props);
}

function spliceActions(React, rows, captured, options) {
    const presentDelete = rows.some(isPlainDeleteRow);
    const presentBetter = rows.some(row => row?.key === 'mime-better-delete' || row?.props?.key === 'mime-better-delete' || /^better delete$/i.test(rowText(row)));
    const additions = [];
    if (!presentDelete && captured[0]) additions.push(captured[0]);
    else if (!presentDelete && options.canDelete && options.onDelete) {
        const sample = rows.find(isActionRow);
        if (sample) additions.push(relabel(React, sample, 'mime-delete', 'Delete Message', options.onDelete, true));
    }
    if (options.showBetter && !presentBetter && options.onBetter) {
        const template = captured[0] || rows.find(isActionRow);
        if (template) additions.push(relabel(React, template, 'mime-better-delete', 'Better Delete', options.onBetter, !captured[0]));
    }
    if (!additions.length) return rows;
    let anchor = -1;
    rows.forEach((row, index) => { if (isQuickRow(row)) anchor = index; });
    const copy = rows.slice();
    copy.splice(anchor + 1, 0, ...additions);
    return copy;
}

function insertActions(React, node, captured, options, want, state) {
    if (node == null || isActionRow(node)) return node;
    if (Array.isArray(node)) {
        let nested = false;
        const walked = node.map(child => {
            const next = insertActions(React, child, captured, options, want, state);
            if (next !== child) nested = true;
            return next;
        });
        if (nested || state.done) return nested ? walked : node;
        const rows = walked.filter(isActionRow);
        if (!rows.length) return walked.some((child, index) => child !== node[index]) ? walked : node;
        if (want === 'quick' && !rows.some(isQuickRow)) return walked.some((child, index) => child !== node[index]) ? walked : node;
        state.done = true;
        return spliceActions(React, walked, captured, options);
    }
    if (!React.isValidElement(node) || node.props == null) return node;
    let changed = false;
    const props = {};
    for (const key of Object.keys(node.props)) {
        const value = node.props[key];
        if (value == null) continue;
        if (key !== 'children' && !Array.isArray(value) && !React.isValidElement(value)) continue;
        const mapped = insertActions(React, value, captured, options, want, state);
        if (mapped !== value) {
            props[key] = mapped;
            changed = true;
        }
    }
    return changed ? React.cloneElement(node, props) : node;
}

export function placeMessageActions(React, tree, options) {
    const captured = [];
    const stripped = stripDeletes(React, tree, captured);
    const quick = { done: false };
    const withQuick = insertActions(React, stripped, captured, options, 'quick', quick);
    if (quick.done) return withQuick;
    return insertActions(React, withQuick, captured, options, 'first', { done: false });
}

export function messageActions(r) {
    return r.find('deleteMessage', '_sendMessage')
        || r.find('deleteMessage', 'sendMessage')
        || r.find('deleteMessage', 'startEditMessage')
        || r.find('deleteMessage');
}

export function myId(r) {
    const users = r.byStore('UserStore');
    const auth = r.byStore('AuthenticationStore');
    return users?.getCurrentUser?.()?.id || auth?.getId?.() || r.find('getCurrentUser')?.getCurrentUser?.()?.id || null;
}

export function isOwnMessage(r, message) {
    const me = myId(r);
    const author = message?.author?.id || message?.authorId;
    return !!me && author === me && message?.deleted !== true;
}

export function replacementText(value) {
    const text = String(value ?? '').trim();
    return (text || 'redacted eh').slice(0, 2000);
}

export async function runBetterDelete(api, discord, channelId, messageId, content) {
    const text = replacementText(content);
    const payload = { content: text, tts: false, invalidEmojis: [], validNonShortcutEmojis: [] };
    if (typeof api?.deleteMessage === 'function') await api.deleteMessage(channelId, messageId);
    else if (typeof discord === 'function') await discord(`/channels/${channelId}/messages/${messageId}`, { method: 'DELETE' });
    else throw new Error('Delete is unavailable');
    if (typeof api?._sendMessage === 'function') {
        await api._sendMessage(channelId, payload, { nonce: messageId });
        return text;
    }
    if (typeof api?.sendMessage === 'function') {
        await api.sendMessage(channelId, { ...payload, nonce: messageId }, true, { nonce: messageId });
        return text;
    }
    if (typeof discord === 'function') {
        await discord(`/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify({ ...payload, nonce: messageId }) });
        return text;
    }
    throw new Error('Replacement send is unavailable');
}

function patchMessageSheet(r, transform) {
    const sheets = r.find('openLazy', 'hideActionSheet');
    if (!sheets || !r.api.patcher?.before) return false;
    return r.patch('before', sheets, 'openLazy', args => {
        const [pending, key] = args;
        if (key !== 'MessageLongPressActionSheet' || !pending?.then) return;
        args[0] = pending.then(module => {
            if (!r.active || typeof module?.default !== 'function' || module.default.prototype?.isReactComponent) return module;
            const Original = module.default;
            function WithDeleteActions(screenProps) {
                const tree = Original(screenProps);
                if (!r.active) return tree;
                const message = screenProps?.message;
                try {
                    return transform(tree, message, () => sheets.hideActionSheet()) ?? tree;
                } catch (error) {
                    r.error('Message menu', error);
                    return tree;
                }
            }
            return { ...module, default: WithDeleteActions };
        });
    });
}

export default function BetterDelete(r) {
    const { h } = r;
    const { Page, Text, Toggle, Input } = ui(r);
    const busy = new Set();
    async function hide(message) {
        const channelId = String(message?.channel_id || message?.channelId || '');
        const messageId = String(message?.id || '');
        if (!/^\d{5,}$/.test(channelId) || !/^\d{5,}$/.test(messageId)) throw new Error('This message cannot be deleted');
        if (busy.has(messageId)) return;
        busy.add(messageId);
        try {
            await runBetterDelete(messageActions(r), r.discord.bind(r), channelId, messageId, r.store.replacement);
        } finally {
            busy.delete(messageId);
        }
    }
    async function remove(message) {
        const channelId = String(message?.channel_id || message?.channelId || '');
        const messageId = String(message?.id || '');
        const api = messageActions(r);
        if (typeof api?.deleteMessage === 'function') {
            await api.deleteMessage(channelId, messageId);
            return;
        }
        await r.discord(`/channels/${channelId}/messages/${messageId}`, { method: 'DELETE' });
    }
    return {
        Settings() {
            r.useRefresh();
            return h(Page, { title: 'Better Delete' },
                h(Toggle, {
                    setting: 'enabled',
                    label: 'Better Delete',
                    subLabel: 'Deletes your message, then sends the replacement with the same nonce so other message loggers keep the replacement.',
                }),
                h(Input, {
                    label: 'Replacement message',
                    value: r.store.replacement,
                    onChange: value => r.set('replacement', String(value).slice(0, 2000)),
                }),
                h(Text, { muted: true }, 'Delete and Better Delete are placed in the Edit, Reply, and Forward group. Better Delete only appears on your own messages and deletes immediately. Might not be safe; use at your own risk.'));
        },
        start() {
            const patched = patchMessageSheet(r, (tree, message, hideSheet) => {
                const own = isOwnMessage(r, message);
                const press = action => () => {
                    try { hideSheet(); } catch {}
                    Promise.resolve().then(action).catch(error => { if (r.active) r.error('Better Delete', error); });
                };
                return placeMessageActions(r.React, tree, {
                    showBetter: !!r.store.enabled && own,
                    canDelete: own,
                    onBetter: press(() => hide(message)),
                    onDelete: press(() => remove(message)),
                });
            });
            r.status.messageMenu = patched ? 'patched' : 'unavailable';
        },
    };
}

BetterDelete.defaults = { enabled: true, replacement: 'redacted eh' };
