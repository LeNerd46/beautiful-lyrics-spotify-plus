import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommonViewProps, Image, createNativeComponent, Text, View } from 'spotifyplus/react';
import Animated, { measure, useAnimatedStyle, useFrameCallback, usePlaybackClock, useReducedMotion, useSharedValue, withTiming } from 'spotifyplus/react/Animated';
import { SpotifyTrack } from 'spotifyplus/entities';
import { ExtensionSetting, SpotifyPlus } from 'spotifyplus';
import { TransformedLyrics, transformLyrics } from './Lyrics/lyric-utilities';
import LyricsView from './Lyrics/lyrics-view';
import LyricsSkeleton from './Components/lyrics-skeleton';
import { AnimationStyle } from './Entities/animation-style';
import { ChromeButton, LyricsInset, LyricsTitle, PlayerControls } from './Components/player-chrome';
import { CONTROLS_FADE_MS, ControlsVisibility } from './Components/player-model';
import { GestureDetector } from 'spotifyplus/react/Gesture';

const AnimatedBackground = createNativeComponent<CommonViewProps & { imageUrl?: string }>('AnimatedBackground');

const App = ({ headerRef, headerGesture }: { headerRef?: React.Ref<View>; headerGesture?: React.ComponentProps<typeof GestureDetector>['gesture'] } = {}) => {
    const [lyrics, setLyrics] = useState<TransformedLyrics>();
    const [track, setTrack] = useState<SpotifyTrack>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>();
    const [songRevision, setSongRevision] = useState(0);
    const [paused, setPaused] = useState(() => SpotifyPlus.Player.getState().isPaused);
    const [liked, setLiked] = useState(false);
    const [animationStyle, setAnimationStyle] = useState<AnimationStyle>(() => SpotifyPlus.Platform.Storage.get('lyrics-animation-style') === 'apple' ? 'apple' : 'beautiful');
    const [controlsVisible, setControlsVisible] = useState(paused);

    const likedRef = useRef(false);
    const panel = useRef<View | null>(null);
    const densityProbe = useRef<View | null>(null);

    const controlsShown = useSharedValue(paused);
    const controlsOpacity = useSharedValue(paused ? 1 : 0);
    const controlsHeight = useSharedValue(210);

    const playbackMs = usePlaybackClock({ unit: 'ms' });
    const reducedMotion = useReducedMotion();

    const panelMeasure = useMemo(() => ({ last: -1 }), []);
    const visibility = useMemo(() => new ControlsVisibility(paused, visible => {
        controlsShown.value = visible;
        setControlsVisible(visible);
    }), [controlsShown]);

    const updateLiked = useCallback((value: boolean) => { likedRef.current = value; setLiked(value); }, []);
    const revealControls = useCallback(() => visibility.reveal(), [visibility]);
    const holdControls = useCallback(() => visibility.hold(), [visibility]);
    const releaseControls = useCallback(() => visibility.release(), [visibility]);
    const seekInteraction = useCallback(() => visibility.interact(), [visibility]);

    useEffect(() => {
        controlsOpacity.value = withTiming(controlsVisible ? 1 : 0, { duration: reducedMotion ? 0 : CONTROLS_FADE_MS });
    }, [controlsVisible, controlsOpacity, reducedMotion]);

    useEffect(() => { visibility.setPaused(paused); }, [paused, visibility]);
    useEffect(() => () => visibility.dispose(), [visibility]);

    useEffect(() => {
        const playPause = (event: { isPaused: boolean }) => { visibility.setPaused(event.isPaused); setPaused(event.isPaused); };
        const songChanged = () => setSongRevision(value => value + 1);

        SpotifyPlus.Events.on('playPause', playPause);
        SpotifyPlus.Events.on('songChanged', songChanged);

        return () => {
            SpotifyPlus.Events.off('playPause', playPause);
            SpotifyPlus.Events.off('songChanged', songChanged);
        };
    }, [visibility]);

    useEffect(() => {
        const settingChanged = (payload: unknown) => {
            const setting = payload as ExtensionSetting | undefined;
            if (setting?.id === 'lyrics-animation-style' && setting.type === 'select') {
                setAnimationStyle(setting.value === 'apple' ? 'apple' : 'beautiful');
            }
        };

        const styleChanged = (style: unknown) => setAnimationStyle(style === 'apple' ? 'apple' : 'beautiful');
        SpotifyPlus.Events.on('lyrics.animationStyleChanged', styleChanged);
        SpotifyPlus.on('settings.changed', settingChanged);

        return () => {
            SpotifyPlus.off('settings.changed', settingChanged);
            SpotifyPlus.Events.off('lyrics.animationStyleChanged', styleChanged);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        const loadLyrics = async () => {
            setLoading(true); setError(undefined); setLyrics(undefined);

            try {
                const current = SpotifyPlus.Player.getCurrentTrack();
                if (!current) throw new Error('No track is playing');

                setTrack(current);

                try {
                    updateLiked(SpotifyPlus.Library.isLiked(current));
                }
                catch (e) {
                    console.log('Could not read liked state', String(e)); updateLiked(false);
                }

                const response = await fetch(`https://spotifyplus-api.devon-shoutz.workers.dev/api/lyrics/${current.id}`);
                if (!response.ok) throw new Error('Lyrics are unavailable for this song');

                const transformed = transformLyrics(await response.json() as any);
                if (!cancelled) setLyrics(transformed);
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadLyrics();

        return () => { cancelled = true; };
    }, [songRevision, updateLiked]);

    useFrameCallback(useCallback(frame => {
        'worklet';

        if (frame.timestamp - panelMeasure.last < 250) return;
        panelMeasure.last = frame.timestamp;

        const size = measure(panel), probe = measure(densityProbe);
        if (size && probe && probe.width > 0 && size.height > 0) controlsHeight.value = size.height / (probe.width / 100);
    }, [controlsHeight, panelMeasure]));

    const panelStyle = useAnimatedStyle(() => {
        'worklet';

        return { opacity: controlsOpacity.value };
    });

    const toggleLike = () => {
        if (!track) return;

        try {
            const next = !likedRef.current;
            if (next) SpotifyPlus.Library.like(track); else SpotifyPlus.Library.unlike(track);

            updateLiked(next);
        } catch (e) { SpotifyPlus.toast('Could not update liked songs'); }
    };

    const openContextMenu = async () => {
        try {
            await SpotifyPlus.ContextMenu.openNowPlaying();
        }
        catch (e) {
            if (track) {
                try { await SpotifyPlus.ContextMenu.open(track); }
                catch (_) { SpotifyPlus.toast('Could not open the song menu'); }
            }
        } finally {
            if (track) {
                try { updateLiked(SpotifyPlus.Library.isLiked(track)); } catch (_) { /* Refresh on the next song change. */ }
            }
        }
    };

    const draggableHeader = (element: React.ReactElement) => headerGesture ? <GestureDetector gesture={headerGesture}>{element}</GestureDetector> : element;

    const header = (
        <View ref={headerRef}>
            <LyricsInset edge='top' style={{ width: '100%' }} />

            {draggableHeader(<View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 18 }} onPress={revealControls}>
                <View style={{ width: 32, height: 3, borderRadius: 2, backgroundColor: '#66FFFFFF' }} />
            </View>)}

            {track && <View style={{ paddingHorizontal: 24, paddingBottom: 24, flexDirection: 'row', alignItems: 'center' }}>
                {draggableHeader(<Image source={{ uri: track.album.image }} onPress={revealControls} style={{ width: 64, height: 64, borderRadius: 5 }} />)}
                {draggableHeader(
                    <View onPress={revealControls} style={{ flex: 1, minWidth: 0, marginLeft: 12, marginRight: 4, overflow: 'hidden' }}>
                        <LyricsTitle text={track.title} accessibilityLabel={track.title} style={{ width: '100%', height: 24, fontSize: 17, fontWeight: '600', color: '#FFFFFF' }} />
                        <Text style={{ color: '#BFFFFFFF', fontSize: 14, marginTop: 2, includeFontPadding: false }} numberOfLines={1}>{track.artist}</Text>
                    </View>)}

                <ChromeButton name='heart' label={liked ? 'Unlike song' : 'Like song'} compact filled={liked} onPress={toggleLike} gesture={headerGesture} />
                <ChromeButton name='more' label='Now Playing context menu' compact onPress={openContextMenu} gesture={headerGesture} />
            </View>}
        </View>);

    return (
        <View style={{ flex: 1, position: 'relative' }}>
            <AnimatedBackground imageUrl={track?.album.image} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, elevation: 0 }} />

            {headerGesture ? <GestureDetector gesture={headerGesture}>{header}</GestureDetector> : header}

            <View style={{ flex: 1, position: 'relative' }}>
                <View ref={densityProbe} pointerEvents='none' style={{ position: 'absolute', top: 0, width: 100, height: 0 }} />

                {lyrics ? (
                    <LyricsView lyrics={lyrics} animationStyle={animationStyle} controlsShown={controlsShown}
                        controlsOpacity={controlsOpacity} controlsHeight={controlsHeight} onRevealControls={revealControls}
                        onInteractionStart={holdControls} onInteractionEnd={releaseControls} onSeekInteraction={seekInteraction} />)
                    : <View onPress={revealControls} style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 }}>
                        {loading ? <LyricsSkeleton /> : <Text style={{ fontSize: 18, color: '#BFFFFFFF' }}>{error}</Text>}
                    </View>}

                <Animated.View ref={panel} pointerEvents={controlsVisible ? 'auto' : 'none'} style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, elevation: 30 }, panelStyle]}>
                    <PlayerControls key={track?.uri} playbackMs={playbackMs} durationMs={track?.durationMs ?? 0} paused={paused} onInteract={revealControls} onHold={() => { holdControls(); revealControls(); }} onRelease={releaseControls} />
                </Animated.View>
            </View>
        </View>);
};

export default App;
