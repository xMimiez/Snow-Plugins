import { ui } from '../runtime.js';

function sessionToken(r) {
    const token = r.find('getToken')?.getToken?.()
        || r.byStore('AuthenticationStore')?.getToken?.()
        || r.find('getToken', 'setToken')?.getToken?.();
    if (!token) throw new Error('Session token unavailable');
    return String(token);
}

function arg(args, name) {
    const found = (args || []).find(item => item && item.name === name);
    return found && found.value != null ? String(found.value).trim() : '';
}

export default function TokenUtils(r) {
    const { h, D, C } = r, { Page, Text } = ui(r);
    const AlertModal = D.AlertModal || C.AlertModal;
    const AlertActions = D.AlertActions || C.AlertActions;
    const AlertActionButton = D.AlertActionButton || C.AlertActionButton;
    function alert(id, title, body, actions) {
        if (!AlertModal || !AlertActions || !AlertActionButton) {
            r.toast(body);
            return;
        }
        r.api.ui.openAlert(id, h(AlertModal, {
            title,
            content: body,
            actions: h(AlertActions, null, ...actions.map(action => h(AlertActionButton, action))),
        }));
    }
    function close(id) { r.api.ui.dismissAlert(id); }
    function showToken() {
        const token = sessionToken(r);
        alert('token-utils-get', 'Authorization token', token, [
            { text: 'Copy token', onPress: () => { r.copy(token); close('token-utils-get'); } },
            { text: 'Close', variant: 'secondary', onPress: () => close('token-utils-get') },
        ]);
    }
    async function showInfo(token) {
        const auth = token || sessionToken(r);
        const data = (await r.request('https://discord.com/api/v9/users/@me', {
            headers: { Authorization: auth },
        })).json();
        const username = data?.username || 'unknown';
        const display = data?.global_name || data?.globalName || username;
        const email = data?.email || 'none';
        const number = data?.phone || 'none';
        const body = `Username: ${username}\nDisplay name: ${display}\nEmail: ${email}\nNumber: ${number}`;
        alert('token-utils-info', 'Token info', body, [
            { text: 'Copy info', onPress: () => { r.copy(body); close('token-utils-info'); } },
            { text: 'Close', variant: 'secondary', onPress: () => close('token-utils-info') },
        ]);
    }
    function Settings() {
        return h(Page, { title: 'TokenUtils' },
            h(Text, null, '/get-token shows the current session Authorization token with a copy button.'),
            h(Text, null, '/token-info token: looks up username, display name, email, and number for that token. Omit the option to use the current session.'));
    }
    return {
        start() {
            r.command({
                name: 'get-token',
                description: 'Show the current Authorization token',
                execute() { showToken(); },
            });
            r.command({
                name: 'token-info',
                description: 'Show username, display name, email, and number for a token',
                options: [{ name: 'token', description: 'Authorization token', type: 3, required: false }],
                async execute(args) {
                    await showInfo(arg(args, 'token'));
                },
            });
        },
        Settings,
    };
}
