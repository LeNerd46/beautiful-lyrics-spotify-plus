import React, { useRef, useState } from 'react';
import { Text, ScrollView } from 'spotifyplus/react';
import { TransformedLyrics } from './lyric-utilities';
import { useAnimatedProps, usePlaybackClock } from 'spotifyplus/react/Animated';
import { LyricsFontFamily } from '../theme/fonts';
import ScrollingLyrics from './scrolling-lyrics';
import { AnimationStyle } from '../Entities/animation-style';
import { LyricsInteractionProps, LyricsViewport } from '../Components/player-chrome';

interface Props extends LyricsInteractionProps {
    lyrics: TransformedLyrics | undefined;
    animationStyle: AnimationStyle;
}

const LyricsView = ({ lyrics, ...props }: Props) => {
    const playbackMs = usePlaybackClock({ unit: 'ms' });
    if (!lyrics) return null;

    if (lyrics.Type === 'Static') {
        return <StaticLyrics lyrics={lyrics} {...props} />;
    }

    return <SyncedLyricsView lyrics={lyrics} playbackMs={playbackMs} {...props} />;
};

const StaticLyrics = ({ lyrics, controlsOpacity, controlsHeight, onRevealControls }: Props) => {
    const previousOffset = useRef(0);
    const mask = useAnimatedProps(() => {
        'worklet';

        return { controlsMask: [controlsOpacity.value, controlsHeight.value] as const };
    });

    if (lyrics?.Type !== 'Static') return null;

    return (
        <LyricsViewport style={{ flex: 1 }} animatedProps={mask} onPress={onRevealControls}>
            <ScrollView style={{ flex: 1 }} onScroll={event => {
                const offset = event.y;
                if (offset < previousOffset.current - 1) onRevealControls();
                previousOffset.current = offset;
            }}>
                {lyrics.Lines.map((line, index) => <Text key={index} onPress={onRevealControls} style={{ fontFamily: LyricsFontFamily, fontSize: 32, color: '#BFFFFFFF', paddingHorizontal: 28, paddingVertical: 14 }}>
                    {line.Text}
                </Text>)}
            </ScrollView>
        </LyricsViewport>);
};

const SyncedLyricsView = ({ lyrics, ...props }: React.ComponentProps<typeof ScrollingLyrics>) => {
    const [identity, setIdentity] = useState({ lyrics, generation: 0 });
    if (identity.lyrics !== lyrics) {
        setIdentity({ lyrics, generation: identity.generation + 1 });
    }

    return <ScrollingLyrics key={identity.generation} lyrics={lyrics} {...props} />;
};

export default LyricsView;
