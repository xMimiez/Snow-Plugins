import { ui } from '../runtime.js';

export default function PauseInvitesForever(r) {
    const { h, React } = r, { Page, Text, Button } = ui(r);
    function hasFlag(features, pause) {
        const list = Array.from(features || []);
        return pause ? list.includes('INVITES_DISABLED') : !list.includes('INVITES_DISABLED');
    }
    async function setInvites(guildId, pause) {
        const guild = r.byStore('GuildStore')?.getGuild?.(guildId) || {};
        const features = Array.from(guild.features || []).filter(f => f !== 'INVITES_DISABLED');
        if (pause) features.push('INVITES_DISABLED');
        const rest = r.find('patch', 'post', 'get') || r.find('put', 'patch', 'get');
        let lastError;
        if (typeof rest?.patch === 'function') {
            try { await rest.patch({ url: `/guilds/${guildId}`, body: { features } }); }
            catch (error) { lastError = error; }
        }
        if (lastError || !rest?.patch) {
            try {
                await r.discord(`/guilds/${guildId}`, { method: 'PATCH', body: JSON.stringify({ features }) });
                lastError = null;
            } catch (error) { lastError = error; }
        }
        r.common.FluxDispatcher?.dispatch?.({ type: 'GUILD_UPDATE', guild: { id: guildId, features } });
        let confirmed = hasFlag(r.byStore('GuildStore')?.getGuild?.(guildId)?.features, pause);
        if (!confirmed) {
            try {
                const fresh = (await r.discord(`/guilds/${guildId}`)).json();
                confirmed = hasFlag(fresh?.features, pause);
            } catch {}
        }
        if (!confirmed) throw new Error(lastError?.message || 'Discord did not change invite pause. Need Pause Invites / Manage Server, and a community server.');
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
        Settings() { return h(Page, { title: 'PauseInvitesForever' }, h(Text, null, 'Sets the INVITES_DISABLED guild feature and checks Discord actually applied it.')); },
        Confirm,
    };
}
