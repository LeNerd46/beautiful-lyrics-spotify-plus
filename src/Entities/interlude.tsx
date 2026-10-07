import { useMemo } from 'react';
import { CurveInterpolator } from 'curve-interpolator';
import Spline from 'cubic-spline';
import {
    CommonViewProps,
    View,
} from 'spotifyplus/react';
import { SharedValue } from 'spotifyplus/react/Animated';
import { LyricMotion } from '../Components/lyric-motion';
import { sampleMotion } from './native-motion';
import { Interlude } from '../Types/lyrics-types';
import { INTERLUDE_EXIT_MS } from '../Lyrics/scroll-model';
import {
    createWorkletSpring,
    updateWorkletSpring,
} from './spring';

interface Props extends CommonViewProps {
    metadata: Interlude;
    oppositeAligned?: boolean;
    playbackMs: SharedValue<number>;
}

type Samples = {
    input: number[];
    output: number[];
};

// All response samples have a uniform 120 Hz step, so lookup is O(1).
const sampleValue = (samples: Samples, elapsed: number) => {
    const cursor = Math.max(0, Math.min(samples.output.length - 1, elapsed * 120));
    const index = Math.floor(cursor), next = Math.min(samples.output.length - 1, index + 1);
    return samples.output[index] + (samples.output[next] - samples.output[index]) * (cursor - index);
};

const DotStep = 0.925 / 3;
const DotSize = 18;
const DotSpacing = 6;
const InterludeHorizontalPadding = 60;
const InterludeWidth = ((DotSize + DotSpacing) * 3) + InterludeHorizontalPadding;

const DotScaleSpline = new Spline([0, 0.7, 1], [0.75, 1.05, 1]);
const DotYOffsetSpline = new Spline([0, 0.9, 1], [0.125, -0.2, 0]);
const DotGlowSpline = new Spline([0, 0.6, 1], [0, 1, 1]);
const DotOpacitySpline = new Spline([0, 0.6, 1], [0.35, 1, 1]);

// Sample the complete spring response, including the overshoot and settling after
// the target curve ends. Times stay in seconds so settling is never sped up to fit
// the dot's slot or cut off when the next dot starts.
const sampleDotMotion = (
    spline: Spline,
    duration: number,
    multiplier: number,
    damping: number,
    frequency: number,
): Samples => {
    return sampleSpringMotion(
        elapsed => spline.at(Math.min(elapsed / duration, 1)) * multiplier,
        duration, damping, frequency,
    );
};

const sampleSpringMotion = (
    targetAt: (elapsed: number) => number,
    duration: number,
    damping: number,
    frequency: number,
): Samples => {
    const deltaTime = 1 / 120;
    const count = Math.ceil((duration + 5) / deltaTime);
    const spring = createWorkletSpring(targetAt(0));
    const input: number[] = [];
    const output: number[] = [];
    for (let index = 0; index <= count; index += 1) {
        const elapsed = index * deltaTime;
        const target = targetAt(elapsed);
        const value = index === 0 ? spring.position
            : updateWorkletSpring(spring, target, damping, frequency, deltaTime, true);
        input.push(elapsed);
        output.push(value);
    }
    return { input, output };
};

const mainYOffsetCurve = new CurveInterpolator([[0, 0.01], [0.9, -1 / 60], [1, 0]]);

const createMainMotion = (duration: number) => {
    // Upstream's entrance, alternating 2.25-second pulses, and exit.
    const entrance = Math.min(0.2, duration / 4);
    const exit = duration - Math.min(0.075, duration / 4);
    const scalePoints = [[0, 0], [entrance, 1.05], [exit, 1.15], [duration, 0]];
    for (let index = Math.floor((exit - entrance) / 2.25); index > 0; index -= 1) {
        scalePoints.splice(2, 0, [entrance + index * 2.25, index % 2 === 0 ? 1.05 : 0.95]);
    }
    const scaleCurve = new CurveInterpolator(scalePoints.map(([time, value]) => [time / duration, value]));
    const opacityCurve = new CurveInterpolator([
        [0, 0], [Math.min(0.5, duration / 2) / duration, 1], [exit / duration, 1], [1, 0],
    ]);
    const valueAt = (curve: CurveInterpolator, elapsed: number) => {
        if (elapsed <= 0 || elapsed >= duration) return 0;
        const points = curve.getIntersects(elapsed / duration) as number[][];
        return points.length > 0 ? points[points.length - 1][1] : 1;
    };
    return {
        scale: sampleSpringMotion(elapsed => valueAt(scaleCurve, elapsed), duration, 0.7, 5),
        opacity: sampleSpringMotion(elapsed => valueAt(opacityCurve, elapsed), duration, 0.4, 1.25),
        yOffset: sampleSpringMotion(elapsed => mainYOffsetCurve.getPointAt(Math.min(elapsed / duration, 1))[1] * DotSize, duration, 0.4, 1.25),
    };
};

interface DotProps {
    index: number;
    startMs: number;
    endMs: number;
    playbackMs: SharedValue<number>;
    dotScaleSamples: Samples;
    dotYOffsetSamples: Samples;
    dotGlowSamples: Samples;
    dotOpacitySamples: Samples;
}

// Every dot uses the same motion samples, staggered by playback position.
const InterludeDot = ({ index, startMs, endMs, playbackMs, dotScaleSamples,
    dotYOffsetSamples, dotGlowSamples, dotOpacitySamples }: DotProps) => {
    const dotStart = index * DotStep;
    const motionTrack = useMemo(() => sampleMotion(
        startMs + dotStart * (endMs - startMs),
        dotScaleSamples.input[dotScaleSamples.input.length - 1] * 1000,
        elapsed => [0, 0, Math.max(0, Math.min(1, sampleValue(dotGlowSamples, elapsed))),
            sampleValue(dotYOffsetSamples, elapsed), sampleValue(dotScaleSamples, elapsed),
            Math.max(0, Math.min(1, sampleValue(dotOpacitySamples, elapsed)))],
    ), [startMs, endMs, dotStart, dotScaleSamples, dotYOffsetSamples, dotGlowSamples, dotOpacitySamples]);

    return (
        <View
            style={{
                width: DotSize + DotSpacing,
                height: DotSize + 28,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'visible',
            }}
        >
            <LyricMotion motionTrack={motionTrack} glowElevation
                style={
                    {
                        width: DotSize,
                        height: DotSize,
                        borderRadius: DotSize / 2,
                        backgroundColor: 'white',
                    }
                }
            />
        </View>
    );
};

const InterludeView = ({ metadata, playbackMs, oppositeAligned = true }: Props) => {
    const startMs = metadata.StartTime * 1000;
    const endMs = metadata.EndTime * 1000;
    const duration = Math.max(metadata.EndTime - metadata.StartTime, 0.001);

    const dotDuration = duration * DotStep;
    const dotScaleSamples = useMemo(() => sampleDotMotion(DotScaleSpline, dotDuration, 1, 0.6, 0.7), [dotDuration]);
    const dotYOffsetSamples = useMemo(() => sampleDotMotion(DotYOffsetSpline, dotDuration, DotSize, 0.4, 1.25), [dotDuration]);
    const dotGlowSamples = useMemo(() => sampleDotMotion(DotGlowSpline, dotDuration, 1, 0.5, 1), [dotDuration]);
    const dotOpacitySamples = useMemo(() => sampleDotMotion(DotOpacitySpline, dotDuration, 1, 0.5, 1), [dotDuration]);
    const mainSamples = useMemo(() => createMainMotion(duration), [duration]);
    const motionTrack = useMemo(() => ({
        ...sampleMotion(startMs, (duration + 5) * 1000, elapsed => [0, 0, 0,
            sampleValue(mainSamples.yOffset, elapsed), sampleValue(mainSamples.scale, elapsed),
            Math.sin(Math.max(0, Math.min(1, sampleValue(mainSamples.opacity, elapsed))) * Math.PI / 2)]),
        hideAfterMs: endMs + INTERLUDE_EXIT_MS, beforeOpacity: 0,
    }), [duration, endMs, mainSamples, startMs]);

    const alignmentStyle = oppositeAligned
        ? {
            width: InterludeWidth,
            paddingRight: 25,
            paddingLeft: 35,
            paddingVertical: 12,
            flexDirection: 'row' as const,
            alignItems: 'center' as const,
            overflow: 'visible' as const,
        }
        : {
            width: InterludeWidth,
            paddingLeft: 25,
            paddingRight: 35,
            paddingVertical: 12,
            flexDirection: 'row' as const,
            alignItems: 'center' as const,
            overflow: 'visible' as const,
        };

    return (
        <LyricMotion style={alignmentStyle} motionTrack={motionTrack}>
            {[0, 1, 2].map(index => (
                <InterludeDot
                    key={index}
                    index={index}
                    startMs={startMs}
                    endMs={endMs}
                    playbackMs={playbackMs}
                    dotScaleSamples={dotScaleSamples}
                    dotYOffsetSamples={dotYOffsetSamples}
                    dotGlowSamples={dotGlowSamples}
                    dotOpacitySamples={dotOpacitySamples}
                />
            ))}
        </LyricMotion>
    );
};

export default InterludeView;
