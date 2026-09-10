import { ui } from '../runtime.js';

export default function PauseInvitesForever(r) {
    const { h, React } = r, { Page, Text, Button } = ui(r);
    function rest() {
        return r.find('patch', 'post', 'get', 'put') || r.find('patch', 'get') || r.find('put', 'patch');
    }
    async function setInvites(guildId, pause) {
        const api = rest();
        let features = [];
        try {
            const guild = (typeof api?.get === 'function'
                ? (await api.get({ url: `/guilds/${guildId}` }))?.body
                : (await r.discord(`/guilds/${guildId}`)).json());
            features = Array.from(guild?.features || r.byStore('GuildStore')?.getGuild?.(guildId)?.features || []);
        } catch {
            features = Array.from(r.byStore('GuildStore')?.getGuild?.(guildId)?.features || []);
        }
        features = features.filter(f => f !== 'INVITES_DISABLED');
        if (pause) features.push('INVITES_DISABLED');
        const until = pause ? new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString() : null;
        let lastError;
        if (typeof api?.put === 'function') {
            try {
                await api.put({ url: `/guilds/${guildId}/incident-actions`, body: { invites_disabled_until: until, dms_disabled_until: null } });
            } catch (error) { lastError = error; }
        }
        try {
            await r.discord(`/guilds/${guildId}/incident-actions`, {
                method: 'PUT',
                body: JSON.stringify({ invites_disabled_until: until, dms_disabled_until: null }),
            });
            lastError = null;
        } catch (error) { lastError = lastError || error; }
        if (typeof api?.patch === 'function') {
            try {
                await api.patch({ url: `/guilds/${guildId}`, body: { features } });
                lastError = null;
            } catch (error) { lastError = error; }
        }
        try {
            await r.discord(`/guilds/${guildId}`, { method: 'PATCH', body: JSON.stringify({ features }) });
            lastError = null;
        } catch (error) { lastError = lastError || error; }
        if (lastError) throw new Error(lastError.message || String(lastError));
    }
    function Confirm({ guildId, pause, close }) {
        const [busy, setBusy] = React.useState(false), inFlight = React.useRef(false), mounted = React.useRef(true);
        React.useEffect(() => () => { mounted.current = false; }, []);
        const pausing = pause === true;
        const name = r.byStore('GuildStore')?.getGuild?.(guildId)?.name || guildId;
        return h(Page, { title: pausing ? 'Pause server invites indefinitely?' : 'Resume server invites?', close },
            h(Text, null, `Server: ${name}`),
            h(Button, { text: busy ? 'Saving…' : pausing ? 'Pause invites' : 'Resume invites', disabled: busy, onPress: async () => {
                if (inFlight.current) return; inFlight.current = true; setBusy(true);
                try {
                    await setInvites(guildId, pausing);
                    r.toast(pausing ? 'Invites paused' : 'Invites resumed');
                    if (mounted.current) close();
                } catch (e) { if (r.active) r.error('Server invites', e); }
                finally { inFlight.current = false; if (r.active && mounted.current) setBusy(false); }
            } }));
    }
    function run(pause) {
        return function execute(_options, context) {
            const channel = context?.channel || r.byStore('ChannelStore')?.getChannel?.(context?.channelId || r.channelId(context));
            const guildId = context?.guild?.id || context?.guildId || channel?.guild_id || channel?.guildId
                || r.byStore('SelectedGuildStore')?.getGuildId?.();
            if (!/^\d+$/.test(guildId || '')) throw new Error('Run this in a server channel');
            r.open(pause ? 'pause' : 'resume', Confirm, { guildId, pause });
        };
    }
    return {
        start() {
            r.command({ name: 'pauseinvites', description: 'Pause server invites without a timer', execute: run(true) });
            r.command({ name: 'resumeinvites', description: 'Resume server invites', execute: run(false) });
        },
        Settings() { return h(Page, { title: 'PauseInvitesForever' }, h(Text, null, 'Uses Discord incident-actions and guild features. No client Flux dispatch.')); },
        Confirm,
    };
}
