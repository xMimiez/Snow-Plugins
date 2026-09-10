import { ui } from '../runtime.js';

function walk(value, visit) {
    if (!value || typeof value !== 'object') return;
    visit(value);
    if (Array.isArray(value)) for (const item of value) walk(item, visit);
    else for (const item of Object.values(value)) walk(item, visit);
}

export default function AlwaysAnimate(r) {
    const { h, React, RN } = r, { Page, Text, Toggle } = ui(r);
    function animateUrl(url) {
        if (typeof url !== 'string') return url;
        return url
            .replace(/\/(avatars|banners|guilds\/[^/]+\/banners|icons|splashes|role-icons)\/([^/?]+)\/(a_[^/?]+)\.(?:png|webp|jpg|jpeg)(\?[^#]*)?/gi, '/$1/$2/$3.gif$4')
            .replace(/\/avatars\/(\d+)\/(a_[^/?]+)\.(?:png|webp)(\?[^#]*)?/gi, '/avatars/$1/$2.gif$3')
            .replace(/\/banners\/(\d+)\/(a_[^/?]+)\.(?:png|webp)(\?[^#]*)?/gi, '/banners/$1/$2.gif$3')
            .replace(/\/icons\/(\d+)\/(a_[^/?]+)\.(?:png|webp)(\?[^#]*)?/gi, '/icons/$1/$2.gif$3');
    }
    function animateValue(value) {
        if (typeof value === 'string') return animateUrl(value);
        if (Array.isArray(value)) return value.map(animateValue);
        if (value && typeof value === 'object') {
            const next = { ...value };
            if (typeof next.uri === 'string') next.uri = animateUrl(next.uri);
            if (typeof next.url === 'string') next.url = animateUrl(next.url);
            if (typeof next.src === 'string') next.src = animateUrl(next.src);
            return next;
        }
        return value;
    }
    function forceElement(element) {
        if (!element?.props || element.props.__mimeAnimated) return;
        const props = { __mimeAnimated: true, animate: true, animated: true, canAnimate: true, shouldAnimate: true, loop: true };
        const src = animateValue(element.props.source || element.props.src);
        if (src && src !== element.props.source) props.source = src;
        if (element.props.src) props.src = animateValue(element.props.src);
        return React.cloneElement(element, props);
    }
    function patchUrlFn(parent, key) {
        r.patch('before', parent, key, args => {
            if (!args) return;
            if (args[0] && typeof args[0] === 'object') Object.assign(args[0], { canAnimate: true, animated: true, animate: true });
            for (let i = 0; i < args.length; i++) if (typeof args[i] === 'boolean') args[i] = true;
        });
        r.patch('after', parent, key, (_args, result) => animateValue(result));
    }
    return {
        start() {
            for (const name of ['canUseAnimatedEmojis', 'canUseAnimatedAvatar', 'canUseNameplate', 'canUseAnimatedBanner', 'shouldAnimateEmoji', 'isAnimatedAvatarPremiumDisabled', 'shouldAnimate']) {
                r.patch('after', r.find(name), name, () => true);
            }
            const userStore = r.byStore('UserStore') || r.find('getCurrentUser', 'getUser');
            r.patch('after', userStore, 'getCurrentUser', (_args, user) => {
                if (user && (user.premiumType == null || user.premiumType < 2)) try { user.premiumType = 2; } catch {}
            });
            for (const key of ['getUserAvatarURL', 'getUserBannerURL', 'getGuildIconURL', 'getGuildBannerURL', 'getGuildSplashURL', 'getAvatarAnimation', 'getGuildIconSource', 'getGuildBannerSource', 'getAvatarURL', 'getBannerURL']) {
                const mod = r.find(key);
                if (mod) patchUrlFn(mod, key);
            }
            r.hook(['Emoji', 'Avatar', 'UserAvatar', 'AnimatedAvatar', 'GuildIcon', 'AnimatedGuildIcon', 'GuildBanner', 'UserBanner', 'ProfileBanner', 'Banner', 'Image', 'FastImage', 'ExpoImage'], forceElement);
            r.patch('after', React, 'createElement', (args, result) => {
                if (!r.active || !result?.props || result.props.__mimeAnimated) return;
                const type = args[0];
                const p = args[1] || {};
                const src = p.source?.uri || p.source || p.src || p.uri;
                const url = typeof src === 'string' ? src : src?.uri;
                const isImage = type === RN.Image || type === 'RCTImageView' || /image|avatar|banner|icon|fastimage/i.test(String(type?.displayName || type?.name || type || ''));
                if (typeof url === 'string' && /discord(?:app)?\.com\/(avatars|banners|icons|guilds)\//i.test(url)) return forceElement(result) ?? result;
                if (isImage && url) return forceElement(result) ?? result;
            });
            r.patchRows(rows => {
                const next = JSON.parse(JSON.stringify(rows));
                walk(next, node => {
                    node.animate = true; node.animated = true; node.canAnimate = true;
                    for (const key of Object.keys(node)) {
                        if (typeof node[key] === 'string' && node[key].includes('discord')) node[key] = animateUrl(node[key]);
                    }
                });
                return next;
            });
        },
        Settings() {
            r.useRefresh();
            return h(Page, { title: 'AlwaysAnimate' },
                h(Text, null, 'Rewrites animated avatar, banner, and server icon URLs to .gif and forces canAnimate on Discord helpers.'));
        },
    };
}
AlwaysAnimate.defaults = {};
