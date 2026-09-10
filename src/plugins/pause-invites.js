import { ui } from '../runtime.js';

export default function PauseInvitesForever(r) {
    const { h, React } = r, { Page, Text, Button } = ui(r);
    async function setInvites(guildId, pause) {
        const guild = r.byStore('GuildStore')?.getGuild?.(guildId);
        const current = Array.from(guild?.features || []);
        const features = current.filter(f => f !== 'INVITES_DISABLED');
        if (pause) features.push('INVITES_DISABLED');
        const errors = [];
        try {
            await r.discord(`/guilds/${guildId}/incident-actions`, {
                method: 'PUT',
                body: JSON.stringify({
                    invites_disabled_until: pause ? '2099-12-31T23:59:59.000+00:00' : null,
                    dms_disabled_until: null,
                }),
            });
            return;
        } catch (error) { errors.push(error); }
        const update = r.find('updateGuild')?.updateGuild || r.find('saveGuild')?.saveGuild || r.find('editGuild')?.editGuild;
        if (typeof update === 'function') {
            try { await update(guildId, { features }); return; } catch (error) { errors.push(error); }
        }
        const rest = r.find('patch', 'get') || r.find('put', 'patch');
        if (typeof rest?.patch === 'function') {
            try { await rest.patch({ url: `/guilds/${guildId}`, body: { features } }); return; } catch (error) { errors.push(error); }
        }
        try {
            await r.discord(`/guilds/${guildId}`, { method: 'PATCH', body: JSON.stringify({ features }) });
            return;
        } catch (error) { errors.push(error); }
        const last = errors[errors.length - 1];
        throw new Error(last?.message || 'Could not update invite pause. Need Pause Invites or Manage Server.');
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
        Settings() { return h(Page, { title: 'PauseInvitesForever' }, h(Text, null, 'Uses Discord’s invite-pause (incident-actions) API first, then guild features. Need Pause Invites or Manage Server.')); },
        Confirm,
    };
}
