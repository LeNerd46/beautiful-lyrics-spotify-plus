import React, { useMemo } from 'react';
import { CommonViewProps, View } from 'spotifyplus/react';
import { SharedValue } from 'spotifyplus/react/Animated';
import Spline from 'typescript-cubic-spline';
import { SyllableMetadata } from '../Types/lyrics-types';
import { sampleMotion, springSamples } from './native-motion';
import { AnimationStyle, appleEmphasisTracks } from './animation-style';
import { LyricsFontFamily } from '../theme/fonts';
import GradientText from '../Components/gradient-text';
import { LyricMotion } from '../Components/lyric-motion';

interface Props extends CommonViewProps {
    animationStyle: AnimationStyle;
    isLastWord?: boolean;
    syllable: SyllableMetadata; emphasized: boolean; isBackground?: boolean;
    playbackMs: SharedValue<number>; scaleSpline: Spline; yOffsetSpline: Spline; glowSpline: Spline;
}
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const TextGradient = ['#ffffffff', '#78ffffff'];

const SyllableView = ({ syllable, emphasized, animationStyle, isBackground = false, isLastWord = false, scaleSpline, yOffsetSpline, glowSpline }: Props) => {
    const fontSize = isBackground ? 18 : 36;

    const tracks = useMemo(() => {
        const startMs = syllable.StartTime * 1000;
        const durationMs = Math.max(1, (syllable.EndTime - syllable.StartTime) * 1000);
        const progressAt = (elapsed: number) => clamp01(elapsed * 1000 / durationMs);

        if (animationStyle === 'apple') {
            return {
                word: sampleMotion(startMs, durationMs, elapsed => [progressAt(elapsed), 0, 0, 0, 1, 1]),
                letters: emphasized ? appleEmphasisTracks(syllable.StartTime, syllable.EndTime, syllable.Text, fontSize, isBackground, isLastWord) : []
            };
        }

        const word = springSamples(durationMs + 1500, elapsed => {
            const progress = progressAt(elapsed);

            return [scaleSpline.at(progress), yOffsetSpline.at(progress) * fontSize, glowSpline.at(progress)];
        }, (elapsed, scale, y, glow) => {
            const magnitude = Math.abs(glow);

            return [progressAt(elapsed), 8 * magnitude * (isBackground ? 0.6 : 1),
            clamp01(magnitude * 0.35) * (isBackground ? 0.55 : 1), y * 1.5, scale, 1];
        });

        word.startMs = startMs;
        const chars = [...syllable.Text];

        const letters = emphasized ? chars.map((_, index) => {
            const first = index / chars.length, last = (index + 1) / chars.length;

            const timeAt = (elapsed: number) => Math.sin(progressAt(elapsed) * Math.PI / 2);
            const letterAt = (elapsed: number) => clamp01((timeAt(elapsed) - first) / (last - first));

            const track = springSamples(durationMs + 1500, elapsed => {
                const progress = letterAt(elapsed);
                return [scaleSpline.at(progress), yOffsetSpline.at(progress) * fontSize,
                glowSpline.at(clamp01((timeAt(elapsed) - first) / (1 - first)))];
            }, (elapsed, scale, y, glow) => {
                const progress = letterAt(elapsed);
                const resting = (yOffsetSpline.at(0) * (1 - progress) + yOffsetSpline.at(1) * progress) * fontSize;
                const magnitude = Math.abs(glow);

                return [progress, 24 * magnitude * (isBackground ? 0.6 : 1), clamp01(magnitude) * (isBackground ? 0.55 : 1), Math.min((y - resting) * 3, 0), scale, 1];
            });

            track.startMs = startMs;
            return track;
        }) : [];

        return { word, letters };
    }, [animationStyle, emphasized, fontSize, glowSpline, isBackground, isLastWord, scaleSpline, syllable, yOffsetSpline]);

    if (emphasized) return (
        <LyricMotion motionTrack={tracks.word} style={{ flexDirection: 'row', position: 'relative', alignSelf: 'flex-start', marginRight: syllable.IsPartOfWord ? 0 : 5 }}>
            {[...syllable.Text].map((char, index) => (
                <View key={`${char}-${index}`} style={{ position: 'relative', alignSelf: 'flex-start' }}>
                    <GradientText motionTrack={tracks.letters[index]} text={char} textSizeSp={fontSize} textColor='#ffffff' gradientColors={TextGradient} gradientDirection='leftToRight' gradientTransitionWidth={0.3} style={{ fontFamily: LyricsFontFamily }} />
                </View>
            ))}
        </LyricMotion>
    );

    return (
        <View style={{ position: 'relative', alignSelf: 'flex-start' }}>
            <GradientText motionTrack={tracks.word} text={`${syllable.Text}${syllable.IsPartOfWord ? '' : ' '}`} textSizeSp={fontSize} textColor='#ffffff' gradientColors={TextGradient} gradientDirection='leftToRight' gradientTransitionWidth={0.3} style={{ fontFamily: LyricsFontFamily }} />
        </View>
    );
};

export default React.memo(SyllableView);