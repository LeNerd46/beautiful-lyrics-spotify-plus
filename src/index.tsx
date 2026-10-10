import { ExtensionSetting, SpotifyPlus } from 'spotifyplus';
import { LyricsOpenTrigger, LyricsOverlay } from './Components/lyrics-overlay';

const animationSetting: Extract<ExtensionSetting, { type: 'select' }> = {
    id: 'lyrics-animation-style', type: 'select', label: 'Word animation',
    description: 'Applies to word-by-word lyrics.',
    value: SpotifyPlus.Platform.Storage.get('lyrics-animation-style') === 'apple' ? 'apple' : 'beautiful',
    options: [{ label: 'Beautiful Lyrics', value: 'beautiful' }, { label: 'Apple Music', value: 'apple' }]
};

SpotifyPlus.Settings.registerSetting({ title: 'Lyrics', items: [animationSetting] });

SpotifyPlus.on('settings.changed', (payload: unknown) => {
    const setting = payload as ExtensionSetting | undefined;

    if (setting?.id === 'lyrics-animation-style' && setting.type === 'select') {
        animationSetting.value = setting.value === 'apple' ? 'apple' : 'beautiful';
        SpotifyPlus.Platform.Storage.set(setting.id, animationSetting.value);
    }
});

const toggleAnimationStyle = () => {
    animationSetting.value = animationSetting.value === 'apple' ? 'beautiful' : 'apple';
    SpotifyPlus.Platform.Storage.set(animationSetting.id, animationSetting.value);

    SpotifyPlus.Events.emit('lyrics.animationStyleChanged', animationSetting.value);
    SpotifyPlus.toast(`${animationSetting.value === 'apple' ? 'Apple Music' : 'Beautiful Lyrics'} word animation`);
};

new SpotifyPlus.ContextMenu('Beautiful Lyrics', toggleAnimationStyle, () => animationSetting.value !== 'apple', false, 'track').register();
new SpotifyPlus.ContextMenu('Apple Music', toggleAnimationStyle, () => animationSetting.value === 'apple', false, 'track').register();

SpotifyPlus.UI.overlay('nowPlaying.page', LyricsOverlay);
SpotifyPlus.UI.replace('lyrics.page', LyricsOpenTrigger);
