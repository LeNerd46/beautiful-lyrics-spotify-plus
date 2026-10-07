import React, { useMemo } from 'react'
import { View, Text, HorizontalStackLayout, CommonViewProps, NativeView } from 'spotifyplus/react'
import { SyllableVocalSet } from '../Types/lyrics-types'
import SyllableView from './syllable';
import Spline from 'typescript-cubic-spline';
import { SpotifyPlus } from 'spotifyplus';
import { SharedValue } from 'spotifyplus/react/Animated';
import { LyricMotion } from '../Components/lyric-motion';

interface Props extends CommonViewProps {
    metadata: SyllableVocalSet;
    playbackMs: SharedValue<number>;
}

const ScaleRange = [
    {
        time: 0,
        value: 1
    },
    {
        time: 0.7,
        value: 1.03
    },
    {
        time: 1,
        value: 1
    }
];

const YOffsetRange = [
    {
        time: 0,
        value: (1 / 100)
    },
    {
        time: 0.9,
        value: -(1 / 60)
    },
    {
        time: 1,
        value: 0
    }
];

const GlowRange = [
    {
        time: 0,
        value: 0
    },
    {
        time: 0.15,
        value: 1
    },
    {
        time: 0.6,
        value: 1
    },
    {
        time: 1,
        value: 0
    }
];

const SyllableVocalLine = ({ metadata, playbackMs }: Props) => {
    const startTime = metadata.Lead.StartTime;
    const vocalLines = [metadata.Lead, ...(metadata.Background ?? []),];

    const lineStartTime = Math.min(...vocalLines.map(vocal => vocal.StartTime),);
    const lineStartMs = lineStartTime * 1000;

    const lineEndTime = Math.max(...vocalLines.map(vocal => vocal.EndTime),);
    const lineEndMs = lineEndTime * 1000;

    const containerStyle = metadata.OppositeAligned
        ? {
            flex: 1,
            paddingRight: 25,
            paddingLeft: 35,
            alignItems: 'flex-end' as const,
            textAlign: 'right' as const,
        }
        : {
            flex: 1,
            paddingLeft: 25,
            paddingRight: 35,
        };

    const vocalFlowStyle = {
        width: '100%' as const,
        flexWrap: 'wrap' as const,
        flexDirection: 'row' as const,
        justifyContent: metadata.OppositeAligned ? 'flex-end' as const : 'flex-start' as const,
    };

    const leadSyllables = useMemo(() => {
        return metadata.Lead.Syllables.map((syllable) => {
            const scaleTimes = ScaleRange.map(({ time }) => time);
            const scaleValues = ScaleRange.map(({ value }) => value);

            const yOffsetTimes = YOffsetRange.map(({ time }) => time);
            const yOffsetValues = YOffsetRange.map(({ value }) => value);

            const glowTimes = GlowRange.map(({ time }) => time);
            const glowValues = GlowRange.map(({ value }) => value);

            const scaleSpline = new Spline(scaleTimes, scaleValues);
            const yOffsetSpline = new Spline(yOffsetTimes, yOffsetValues);
            const glowSpline = new Spline(glowTimes, glowValues);

            const emphasized = syllable.EndTime - syllable.StartTime >= 1 && syllable.Text.length <= 12;

            return ({
                syllable,
                emphasized,
                scaleSpline,
                yOffsetSpline,
                glowSpline,
            });
        });
    }, [metadata, startTime]);

    const backgroundSyllables = useMemo(() => {
        if (!metadata.Background) return null;

        return metadata.Background[0].Syllables.map((syllable) => {
            const scaleTimes = ScaleRange.map(({ time }) => time);
            const scaleValues = ScaleRange.map(({ value }) => value);

            const yOffsetTimes = YOffsetRange.map(({ time }) => time);
            const yOffsetValues = YOffsetRange.map(({ value }) => value);

            const glowTimes = GlowRange.map(({ time }) => time);
            const glowValues = GlowRange.map(({ value }) => value);

            const scaleSpline = new Spline(scaleTimes, scaleValues);
            const yOffsetSpline = new Spline(yOffsetTimes, yOffsetValues);
            const glowSpline = new Spline(glowTimes, glowValues);

            const emphasized = syllable.EndTime - syllable.StartTime >= 1 && syllable.Text.length <= 12;

            return ({
                syllable,
                emphasized,
                scaleSpline,
                yOffsetSpline,
                glowSpline,
            });
        });
    }, [metadata, startTime]);

    const groupSyllablesInWords = <T extends { syllable: { IsPartOfWord?: boolean } }>(syllables: T[]) => {
        const words: T[][] = [];
        let currentWord: T[] = [];

        for (const syllable of syllables) {
            currentWord.push(syllable);

            if (!syllable.syllable.IsPartOfWord) {
                words.push(currentWord);
                currentWord = [];
            }
        }

        if (currentWord.length > 0) words.push(currentWord);
        return words;
    }

    const leadWords = useMemo(() => groupSyllablesInWords(leadSyllables), [leadSyllables]);
    const backgroundWords = useMemo(() => groupSyllablesInWords(backgroundSyllables ?? []), [backgroundSyllables]);

    return (
        <LyricMotion style={containerStyle} opacityRange={[lineStartMs, lineEndMs]}>
            <View style={vocalFlowStyle}>
                {leadWords.map((word, index) => (
                    <View key={index} style={{ flexDirection: 'row' }}>
                        {word.map(({ syllable, emphasized, scaleSpline, yOffsetSpline, glowSpline }, syllableIndex) => (
                            <SyllableView
                                key={syllableIndex}
                                syllable={syllable}
                                emphasized={emphasized}
                                playbackMs={playbackMs}
                                scaleSpline={scaleSpline}
                                yOffsetSpline={yOffsetSpline}
                                glowSpline={glowSpline}
                            />
                        ))}
                    </View>
                ))}
            </View>

            {backgroundSyllables && (
                <View style={vocalFlowStyle}>
                    {backgroundWords.map((word, index) => (
                        <View key={index} style={{ flexDirection: 'row' }}>
                            {word.map(({ syllable, emphasized, scaleSpline, yOffsetSpline, glowSpline }, syllableIndex) => (
                                <SyllableView
                                    key={syllableIndex}
                                    syllable={syllable}
                                    emphasized={emphasized}
                                    isBackground
                                    playbackMs={playbackMs}
                                    scaleSpline={scaleSpline}
                                    yOffsetSpline={yOffsetSpline}
                                    glowSpline={glowSpline}
                                />
                            ))}
                        </View>
                    ))}
                </View>
            )}
        </LyricMotion>
    )
}

export default React.memo(SyllableVocalLine)
