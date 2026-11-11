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
    if (/HIDE|LOGGER|BETTER|SILENT/.test(id)) return false;
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
    return QUICK.test(rowText(node)) || DELETE.test(rowText(node)) || /^SILENT DELETE MESSAGE$/i.test(rowText(node)) || /EDIT_MESSAGE|REPLY|FORWARD|DELETE/.test(id);
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
    const presentBetter = rows.some(row => row?.key === 'mime-silent-delete' || row?.props?.key === 'mime-silent-delete' || /^silent delete message$/i.test(rowText(row)));
    const additions = [];
    if (!presentDelete && captured[0]) additions.push(captured[0]);
    else if (!presentDelete && options.canDelete && options.onDelete) {
        const sample = rows.find(isActionRow);
        if (sample) additions.push(relabel(React, sample, 'mime-delete', 'Delete Message', options.onDelete, true));
    }
    if (options.showBetter && !presentBetter && options.onBetter) {
        const template = captured[0] || rows.find(isActionRow);
        if (template) additions.push(relabel(React, template, 'mime-silent-delete', 'Silent Delete Message', options.onBetter, !captured[0]));
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

const AFTER_ACK_MS = 300;
const LOOKUP_TRIES = 8;
const LOOKUP_GAP_MS = 150;

function missingHttp(error) {
    return /unavailable|Invalid Discord API path/i.test(String(error?.message || error || ''));
}

function alreadyGone(error) {
    return error?.status === 404 || /unknown message/i.test(String(error?.message || error?.body?.message || ''));
}

async function deleteOnServer(api, discord, channelId, id) {
    let clientOk = false;
    let clientError;
    if (typeof api?.deleteMessage === 'function') {
        try {
            await api.deleteMessage(channelId, id);
            clientOk = true;
        } catch (error) {
            if (alreadyGone(error)) clientOk = true;
            else clientError = error;
        }
    }
    let restOk = false;
    if (typeof discord === 'function') {
        try {
            await discord(`/channels/${channelId}/messages/${id}`, { method: 'DELETE' });
            restOk = true;
        } catch (error) {
            if (alreadyGone(error)) restOk = true;
            else if (!missingHttp(error) && !clientOk) throw error;
        }
    }
    if (!clientOk && !restOk) throw clientError || new Error('Delete is unavailable');
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function listedMessages(bucket) {
    if (!bucket) return [];
    if (Array.isArray(bucket)) return bucket;
    if (Array.isArray(bucket._array)) return bucket._array;
    if (Array.isArray(bucket.messages)) return bucket.messages;
    if (Array.isArray(bucket.body)) return bucket.body;
    if (typeof bucket.toArray === 'function') {
        const list = bucket.toArray();
        if (Array.isArray(list)) return list;
    }
    return [];
}

// The optimistic message uses the nonce as its id. That id is the original message, which is already gone.
export function replacementIdFrom(bucket, nonce) {
    const nonceText = String(nonce);
    for (const message of listedMessages(bucket)) {
        const id = message?.id == null ? '' : String(message.id);
        if (!id || id === nonceText) continue;
        if (String(message?.nonce ?? '') === nonceText) return id;
    }
    return '';
}

function messageIdOf(result) {
    if (result == null || result === false) return '';
    if (typeof result === 'string' || typeof result === 'number') return String(result);
    const id = result.id ?? result.body?.id ?? result.message?.id ?? result.body?.message?.id;
    return id == null ? '' : String(id);
}

// Equicord puts the nonce only in the third argument. Discord then tells message loggers
// this create belongs to the message that was just deleted. The returned id is a new message.
async function sendReplacement(api, discord, channelId, payload, messageId) {
    const nonce = messageId;
    if (typeof api?._sendMessage === 'function') return api._sendMessage(channelId, payload, { nonce });
    if (typeof api?.sendMessage === 'function') return api.sendMessage(channelId, payload, true, { nonce });
    if (typeof discord === 'function') {
        const result = await discord(`/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify({ content: payload.content, tts: false, nonce: String(nonce) }) });
        return typeof result?.json === 'function' ? result.json() : result;
    }
    throw new Error('Replacement send is unavailable');
}

function idFromLookup(found, nonce) {
    if (typeof found === 'string' || typeof found === 'number') {
        const id = String(found);
        return id && id !== String(nonce) ? id : '';
    }
    return replacementIdFrom(found, nonce);
}

async function findReplacementId(discord, channelId, nonce, lookup) {
    if (typeof lookup === 'function') {
        try {
            const id = idFromLookup(await lookup(), nonce);
            if (id) return id;
        } catch { /* The store can still be swapping the optimistic message. */ }
    }
    if (typeof discord !== 'function') return '';
    try {
        const result = await discord(`/channels/${channelId}/messages?limit=15`);
        const body = typeof result?.json === 'function' ? await result.json() : result;
        return replacementIdFrom(body, nonce);
    } catch {
        return '';
    }
}

async function waitForReplacementId(result, discord, channelId, nonce, lookup) {
    const nonceText = String(nonce);
    const immediate = messageIdOf(result);
    if (immediate && immediate !== nonceText) return immediate;
    for (let attempt = 0; attempt < LOOKUP_TRIES; attempt++) {
        const found = await findReplacementId(discord, channelId, nonce, lookup);
        if (found && found !== nonceText) return found;
        if (attempt < LOOKUP_TRIES - 1) await delay(LOOKUP_GAP_MS);
    }
    return '';
}

async function deleteReplacement(api, discord, channelId, id) {
    if (typeof api?.deleteMessage === 'function') {
        try {
            await api.deleteMessage(channelId, id);
            return;
        } catch (error) {
            if (alreadyGone(error)) return;
            if (typeof discord !== 'function') throw error;
        }
    }
    if (typeof discord !== 'function') throw new Error('The replacement was sent, but it could not be deleted');
    try {
        await discord(`/channels/${channelId}/messages/${id}`, { method: 'DELETE' });
    } catch (error) {
        if (alreadyGone(error) || missingHttp(error)) return;
        throw error;
    }
}

export async function runBetterDelete(api, discord, channelId, messageId, content, lookup) {
    const text = replacementText(content);
    const payload = { content: text, tts: false, invalidEmojis: [], validNonShortcutEmojis: [] };
    if (typeof api?.deleteMessage === 'function') await api.deleteMessage(channelId, messageId);
    else await deleteOnServer(api, discord, channelId, messageId);
    const sent = await sendReplacement(api, discord, channelId, payload, messageId);
    const replacementId = await waitForReplacementId(sent, discord, channelId, messageId, lookup);
    if (!replacementId || replacementId === String(messageId)) throw new Error('The replacement was sent, but its new id was not found');
    // Other clients need the nonce create before this delete, or their logger keeps the original.
    await delay(AFTER_ACK_MS);
    await deleteReplacement(api, discord, channelId, replacementId);
    return text;
}

function messagesInChannel(r, channelId) {
    const store = r.byStore('MessageStore') || r.find('getMessages');
    return store?.getMessages?.(channelId);
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
            await runBetterDelete(messageActions(r), r.discord.bind(r), channelId, messageId, r.store.replacement, () => messagesInChannel(r, channelId));
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
            return h(Page, { title: 'Silent Delete' },
                h(Toggle, {
                    setting: 'enabled',
                    label: 'Silent Delete',
                    subLabel: 'Deletes the message, sends the replacement with that id as the nonce, then deletes the replacement.',
                }),
                h(Input, {
                    label: 'Replacement message',
                    value: r.store.replacement,
                    onChange: value => r.set('replacement', String(value).slice(0, 2000)),
                }),
                h(Text, { muted: true }, 'Delete and Silent Delete Message are placed in the Edit, Reply, and Forward group. Silent Delete only appears on your own messages and deletes immediately. Might not be safe; use at your own risk.'));
        },
        start() {
            const patched = patchMessageSheet(r, (tree, message, hideSheet) => {
                const own = isOwnMessage(r, message);
                const press = action => () => {
                    try { hideSheet(); } catch {}
                    Promise.resolve().then(action).catch(error => { if (r.active) r.error('Silent Delete', error); });
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
