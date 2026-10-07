import React from 'react';
import { Text, ScrollView } from 'spotifyplus/react';
import { TransformedLyrics } from './lyric-utilities';
import { usePlaybackClock } from 'spotifyplus/react/Animated';
import { LyricsFontFamily } from '../theme/fonts';
import ScrollingLyrics from './scrolling-lyrics';

interface Props {
    lyrics: TransformedLyrics | undefined;
}

const LyricsView = ({ lyrics }: Props) => {
    const playbackMs = usePlaybackClock({ unit: 'ms' });
    if (!lyrics) return null;

    if (lyrics.Type === 'Static') {
        return (
            <ScrollView style={{ flex: 1 }}>
                {lyrics.Lines.map((line, index) => (
                    <Text key={index} style={{ fontFamily: LyricsFontFamily }}>
                        {line.Text}
                    </Text>
                ))}
            </ScrollView>
        );
    }

    return <SyncedLyricsView lyrics={lyrics} playbackMs={playbackMs} />;
};

// Reset gesture, measurements, and row motion when a new song/lyrics object arrives.
const SyncedLyricsView = ({ lyrics, playbackMs }: React.ComponentProps<typeof ScrollingLyrics>) => {
    const [identity, setIdentity] = React.useState({ lyrics, generation: 0 });
    if (identity.lyrics !== lyrics) {
        setIdentity({ lyrics, generation: identity.generation + 1 });
    }
    return <ScrollingLyrics key={identity.generation} lyrics={lyrics} playbackMs={playbackMs} />;
};

export default LyricsView;
