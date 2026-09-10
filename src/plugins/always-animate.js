import { ui } from '../runtime.js';

function walk(value, visit) {
    if (!value || typeof value !== 'object') return;
    visit(value);
    if (Array.isArray(value)) for (const item of value) walk(item, visit);
    else for (const item of Object.values(value)) walk(item, visit);
}

export default function AlwaysAnimate(r) {
    const { h, React } = r, { Page, Text, Toggle } = ui(r);
    let reduced = false;
    function allowed() { return !(reduced && r.store.respectReducedMotion); }
    function animateUrl(url) {
        if (!allowed() || typeof url !== 'string') return url;
        return url.replace(/\/(avatars|banners|icons|splashes|role-icons)\/([^/]+)\/a_([^/?]+)\.(png|webp|jpg)/i, '/$1/$2/a_$3.gif');
    }
    function forceProps(element) {
        if (!element?.props || !allowed()) return;
        const props = {};
        for (const key of ['canAnimate', 'animate', 'animateEmoji', 'animateGradient', 'loop', 'shouldAnimate', 'animated']) {
            if (key in (element.props || {}) || typeof element.props?.[key] === 'boolean') props[key] = true;
        }
        const src = element.props.source;
        if (src && typeof src === 'object' && typeof src.uri === 'string') {
            const uri = animateUrl(src.uri);
            if (uri !== src.uri) props.source = { ...src, uri };
        }
        return Object.keys(props).length ? React.cloneElement(element, props) : undefined;
    }
    function patchUrlFn(parent, key) {
        r.patch('before', parent, key, args => {
            if (!allowed() || !args) return;
            if (args[0] && typeof args[0] === 'object') Object.assign(args[0], { canAnimate: true, animated: true, animate: true });
            for (let i = 0; i < args.length; i++) if (typeof args[i] === 'boolean') args[i] = true;
        });
        r.patch('after', parent, key, (_args, result) => typeof result === 'string' ? animateUrl(result) : result);
    }
    return {
        async start() {
            try { reduced = !!(await r.RN.AccessibilityInfo?.isReduceMotionEnabled?.()); } catch { reduced = false; }
            const listener = r.RN.AccessibilityInfo?.addEventListener?.('reduceMotionChanged', value => { reduced = !!value; });
            r.own(() => listener?.remove?.());
            for (const name of ['canUseAnimatedEmojis', 'canUseAnimatedAvatar', 'canUseNameplate', 'canUseAnimatedBanner', 'shouldAnimateEmoji', 'isAnimatedAvatarPremiumDisabled']) {
                r.patch('after', r.find(name), name, () => allowed() ? true : undefined);
            }
            for (const key of ['getUserAvatarURL', 'getUserBannerURL', 'getGuildIconURL', 'getGuildBannerURL', 'getGuildSplashURL', 'getAvatarAnimation', 'getGuildIconSource', 'getGuildBannerSource']) {
                const mod = r.find(key);
                if (mod) patchUrlFn(mod, key);
            }
            r.hook([
                'Emoji', 'CustomEmoji', 'AnimatedEmoji', 'Avatar', 'UserAvatar', 'AnimatedAvatar',
                'GuildIcon', 'AnimatedGuildIcon', 'GuildBanner', 'UserBanner', 'ProfileBanner',
                'DisplayBanner', 'Banner', 'Nameplate', 'RoleIcon', 'Image', 'FastImage', 'ExpoImage',
            ], forceProps);
            r.patch('after', React, 'createElement', (args, result) => {
                if (!r.active || !allowed() || !result?.props) return;
                const p = args[1] || {};
                if (p.guild || p.guildId || p.user || p.userId || p.bannerSource || p.icon || p.avatar) {
                    return forceProps(result) ?? result;
                }
            });
            r.patchRows(rows => {
                if (!allowed()) return rows;
                const next = JSON.parse(JSON.stringify(rows));
                walk(next, node => {
                    for (const key of ['animate', 'animated', 'canAnimate', 'animateEmoji', 'shouldAnimate', 'loop']) {
                        if (typeof node[key] === 'boolean' || key in node) node[key] = true;
                    }
                    for (const key of ['url', 'src', 'icon', 'avatar', 'banner', 'guildIcon', 'guildBanner']) {
                        if (typeof node[key] === 'string') node[key] = animateUrl(node[key]);
                    }
                });
                return next;
            });
        },
        Settings() {
            r.useRefresh();
            return h(Page, { title: 'AlwaysAnimate' },
                h(Toggle, { setting: 'respectReducedMotion', label: 'Respect Reduce Motion' }),
                h(Text, null, 'Animates server icons, server banners, user avatars, and user banners when Discord has an animated asset.'));
        },
    };
}
AlwaysAnimate.defaults = { respectReducedMotion: true };
