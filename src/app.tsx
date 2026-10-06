import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Image, NativeView, ScrollView, Text, View } from 'spotifyplus/react'
import { SpotifyTrack } from 'spotifyplus/entities';
import { SpotifyPlus } from 'spotifyplus';
import { TransformedLyrics, transformLyrics } from './Lyrics/lyric-utilities';
import { SyncedVocals } from './Types/animation-types';
import LyricsView from './Lyrics/lyrics-view';

const AnimatedBackground = NativeView('AnimatedBackground');

const App = () => {
    const [lyrics, setLyrics] = useState<TransformedLyrics>();
    const [track, setTrack] = useState<SpotifyTrack>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>();

    useEffect(() => {
        const getLyrics = async () => {
            try {
                setLoading(true);
                setError(undefined);

                const spicyVersion: string = '5.22.3'
                SpotifyPlus.log(`Current Version: ${spicyVersion}`);

                const track: SpotifyTrack = SpotifyPlus.Player.getCurrentTrack();
                setTrack(track);

                if (!track) {
                    SpotifyPlus.error('Failed to get current track');
                    setError('Failed to get current track');
                    setLoading(false);
                    return;
                }

                const response = await fetch(`https://spotifyplus-api.devon-shoutz.workers.dev/api/lyrics/${track.id}`);
                const json = await response.json() as any;

                if (!response.ok) {
                    setError('Failed to get lyrics');
                    SpotifyPlus.log('Failed to get lyrics :(');
                    return;
                }

                const transformed = transformLyrics(json);
                setLyrics(transformed);
            } catch (e) {
                setError(`An error occurred while fetching lyrics | ${(e as Error).message}`);
                SpotifyPlus.error('An error occurred while fetching lyrics', e);
            } finally {
                setLoading(false);
            }
        };

        getLyrics();
    }, []);

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#313131' }}>
                <Text style={{ color: '#ffffff', fontSize: 18 }}>Loading lyrics...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#313131' }}>
                <Text style={{ color: '#ffffff', fontSize: 18 }}>{error}</Text>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, position: 'relative' }}>
            <AnimatedBackground style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, elevation: 0 }} />

            {track && (
                <View style={{ paddingHorizontal: 28, paddingTop: 28, paddingBottom: 18, flexDirection: 'row', alignItems: 'center' }}>
                    <Image source={{ uri: track.album.image }} style={{ width: 72, height: 72, borderRadius: 8 }} />

                    <View style={{ flex: 1, marginLeft: 16 }}>
                        <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: '700' }} numberOfLines={1}>{track.title}</Text>
                        <Text style={{ color: '#b3b3b3', fontSize: 16, marginTop: 4 }} numberOfLines={1}>{track.artist}</Text>
                    </View>
                </View>
            )}

            <LyricsView lyrics={lyrics} />
        </View>
    )
}

export default App;
