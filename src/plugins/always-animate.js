import { ui } from '../runtime.js';

export default function AlwaysAnimate(r) {
    const { h, React } = r, { Page, Text } = ui(r);
    function gifUrl(url) {
        if (typeof url !== 'string') return url;
        return url.replace(
            /\/(avatars|banners|icons|splashes)\/(\d+)\/(a_[A-Za-z0-9]+)\.(?:webp|png|jpg|jpeg)/gi,
            '/$1/$2/$3.gif'
        );
    }
    function withGif(source) {
        if (typeof source === 'string') return gifUrl(source);
        if (source && typeof source === 'object' && typeof source.uri === 'string') return { ...source, uri: gifUrl(source.uri) };
        return source;
    }
    function rewrite(element) {
        if (!element?.props || element.props.__mimeAnimated) return;
        const source = withGif(element.props.source || element.props.src);
        return React.cloneElement(element, {
            __mimeAnimated: true,
            source,
            src: withGif(element.props.src),
            animate: true,
            animated: true,
            canAnimate: true,
        });
    }
    return {
        start() {
            for (const key of ['canUseAnimatedAvatar', 'canUseAnimatedBanner', 'canUseAnimatedEmojis', 'shouldAnimate']) {
                r.patch('after', r.find(key), key, () => true);
            }
            for (const key of ['getUserAvatarURL', 'getUserBannerURL', 'getGuildIconURL', 'getGuildBannerURL', 'getAvatarURL', 'getBannerURL']) {
                const mod = r.find(key);
                r.patch('before', mod, key, args => {
                    if (!args) return;
                    if (args[0] && typeof args[0] === 'object') Object.assign(args[0], { canAnimate: true, animated: true });
                    for (let i = 0; i < args.length; i++) if (typeof args[i] === 'boolean') args[i] = true;
                });
                r.patch('after', mod, key, (_args, result) => typeof result === 'string' ? gifUrl(result) : withGif(result));
            }
            r.hook(['Image', 'Avatar', 'UserAvatar', 'AnimatedAvatar', 'GuildIcon', 'UserBanner', 'ProfileBanner', 'Banner', 'FastImage'], rewrite);
        },
        Settings() {
            return h(Page, { title: 'AlwaysAnimate' },
                h(Text, null, 'Uses Snow/Bunny Metro finders, patcher, and JSX hooks so animated avatar and banner URLs request .gif instead of static webp.'));
        },
    };
}
AlwaysAnimate.defaults = {};
