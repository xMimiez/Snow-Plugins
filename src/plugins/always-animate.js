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
        if (source && typeof source === 'object' && typeof source.uri === 'string') {
            const uri = gifUrl(source.uri);
            return uri === source.uri ? source : { ...source, uri };
        }
        return source;
    }
    function rewrite(element) {
        if (!element?.props || element.props.__mimeAnimated) return;
        const next = withGif(element.props.source || element.props.src);
        if (next === (element.props.source || element.props.src) && !/\/a_/.test(String(element.props.source?.uri || element.props.source || ''))) return;
        return React.cloneElement(element, { __mimeAnimated: true, source: next, animate: true, animated: true, canAnimate: true });
    }
    return {
        start() {
            for (const key of ['canUseAnimatedAvatar', 'canUseAnimatedBanner', 'canUseAnimatedEmojis']) {
                r.patch('after', r.find(key), key, () => true);
            }
            for (const key of ['getUserAvatarURL', 'getUserBannerURL', 'getGuildIconURL', 'getGuildBannerURL']) {
                r.patch('before', r.find(key), key, args => {
                    if (args?.[0] && typeof args[0] === 'object') Object.assign(args[0], { canAnimate: true, animated: true });
                    if (args) for (let i = 0; i < args.length; i++) if (typeof args[i] === 'boolean') args[i] = true;
                });
                r.patch('after', r.find(key), key, (_args, result) => typeof result === 'string' ? gifUrl(result) : withGif(result));
            }
            r.hook(['Image', 'Avatar', 'UserAvatar', 'AnimatedAvatar', 'GuildIcon', 'UserBanner', 'ProfileBanner', 'Banner', 'FastImage', 'ExpoImage'], rewrite);
        },
        Settings() {
            return h(Page, { title: 'AlwaysAnimate' },
                h(Text, null, 'Snow/Bunny patcher + JSX hooks. Animated avatar/banner hashes (a_) are requested as .gif.'));
        },
    };
}
AlwaysAnimate.defaults = {};
