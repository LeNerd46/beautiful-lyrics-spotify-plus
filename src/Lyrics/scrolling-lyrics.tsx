import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'spotifyplus/react';
import Animated, {
    Easing, FrameInfo, SharedValue, cancelAnimation, clamp, getTimestamp, measure, runOnJS,
    useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useFrameCallback,
    useReducedMotion, useSharedValue, withTiming,
} from 'spotifyplus/react/Animated';
import { Gesture, GestureDetector } from 'spotifyplus/react/Gesture';
import { SpotifyPlus } from 'spotifyplus';
import { LineSyncedLyrics, SyllableSyncedLyrics } from '../Types/lyrics-types';
import LineView from '../Entities/line';
import SyllableVocalLine from '../Entities/syllable-vocals';
import InterludeView from '../Entities/interlude';
import { LyricCanvas, LyricRow } from '../Components/lyric-motion';
import {
    ESTIMATED_LINE_HEIGHT, INTERLUDE_EXIT_MS, LineRange, ScrollCommand, ScrollLayout,
    buildScrollLayout, canFollowLine, findActiveLine, firstLineAtOffset,
    lineScrollOffset, nextLineRange, renderWindow,
    scrollDuration, stepMomentum,
} from './scroll-model';

type SyncedLyrics = LineSyncedLyrics | SyllableSyncedLyrics;
type LyricItem = SyncedLyrics['Content'][number];
type Props = { lyrics: SyncedLyrics; playbackMs: SharedValue<number> };
const lyricContentStyle = { paddingVertical: 2 };
const nativePressStyle = { pressedStyle: { backgroundColor: '#29FFFFFF' } };

function animateScroll(offset: number, duration: number): number {
    'worklet';
    // Use an easing descriptor supported by the native runtime. Its Bezier
    // fallback starts almost still, which makes an undelayed row feel late.
    return withTiming(offset, { duration, easing: Easing.out(Easing.quad) });
}

function getTimeline(content: SyncedLyrics['Content'], interludesOnly = false): LineRange[] {
    const ranges = content.map((item, index) => {
        const vocals = item.Type === 'Vocal' && 'Lead' in item
            ? [item.Lead, ...(item.Background ?? [])] : [item];
        return {
            index,
            start: Math.min(...vocals.map(vocal => vocal.StartTime)) * 1000,
            end: Math.max(...vocals.map(vocal => vocal.EndTime)) * 1000 + (interludesOnly ? INTERLUDE_EXIT_MS : 0),
            previousEnd: -1,
        };
    }).filter(range => !interludesOnly || content[range.index].Type === 'Interlude')
        .sort((a, b) => a.start - b.start || a.index - b.index);
    let previousEnd = -1;
    for (const range of ranges) {
        range.previousEnd = previousEnd;
        previousEnd = Math.max(previousEnd, range.end);
    }
    return ranges;
}

// Only render-window changes cross to React. Playback following, measurement,
// row motion, finger tracking, and inertia all run on the UI thread.
const ScrollingLyrics = ({ lyrics, playbackMs }: Props) => {
    const timeline = useMemo(() => getTimeline(lyrics.Content), [lyrics]);
    const interludes = useMemo(() => lyrics.Content.map(item => item.Type === 'Interlude'), [lyrics]);
    const interludeTimeline = useMemo(() => getTimeline(lyrics.Content, true), [lyrics]);
    const reducedMotion = useReducedMotion();
    // SpotifyPlus serializes function refs as RN callbacks. Object refs become
    // native view handles when the worklet is registered after React commits.
    const viewport = useRef<View | null>(null);
    const densityProbe = useRef<View | null>(null);
    const density = useSharedValue(1);
    const viewportHeight = useSharedValue(0);
    const viewportWidth = useSharedValue(0);
    const heights = useSharedValue(lyrics.Content.map(item => item.Type === 'Interlude' ? 70 : ESTIMATED_LINE_HEIGHT));
    const measurementVersion = useSharedValue(0);
    const measurementTick = useSharedValue(0);
    const layout = useSharedValue<ScrollLayout>(buildScrollLayout(heights.value, 0, interludes));
    const followOffset = useSharedValue(0);
    const manualOffset = useSharedValue(0);
    const maxOffset = useSharedValue(0);
    const layoutAdjustment = useSharedValue(0);
    const touching = useSharedValue(false);
    const dragging = useSharedValue(false);
    const momentum = useSharedValue(false);
    const coast = useSharedValue({ velocity: 0, lastTime: 0 });
    const suspended = useSharedValue(false);
    const lastInteraction = useSharedValue(-1);
    const dragStart = useSharedValue(0);
    const touchMotion = useSharedValue({ startY: 0, lastY: 0, lastTime: 0, velocity: 0 });
    const seekRequest = useSharedValue({ index: -1, version: 0 });
    const command = useSharedValue<ScrollCommand>({
        version: 0, offset: 0, activeIndex: -1, firstVisibleIndex: 0,
        snap: true, stagger: false, duration: 430, startedAt: 0,
    });
    // Private UI closure state avoids serializing the controller/whole geometry
    // on every frame and feeding its own writes back into the mapper scheduler.
    const controller = useMemo(() => ({
        initialized: false, activeIndex: -1, focusIndex: 0, lastPlayback: -1, expandedInterlude: -1,
        lastFrame: -1, lastMeasure: -1, measurementVersion: -1,
        seekVersion: 0, forceIndex: -1, first: 0, last: 3,
        geometry: buildScrollLayout(lyrics.Content.map(item => item.Type === 'Interlude' ? 70 : ESTIMATED_LINE_HEIGHT), 0, interludes),
    }), []);
    const [window, setWindow] = useState({ first: 0, last: 3 });
    const updateWindow = useCallback((first: number, last: number) => {
        setWindow(current => current.first === first && current.last === last ? current : { first, last });
    }, []);

    const onFrame = useCallback((frame: FrameInfo) => {
        'worklet';
        const state = controller;
        if (state.lastFrame === frame.timestamp) return;
        const frameDelta = state.lastFrame < 0 ? 0 : frame.timestamp - state.lastFrame;
        state.lastFrame = frame.timestamp;
        const position = playbackMs.value;
        // Only rebuild at entrance/exit boundaries, not during the dot animation.
        // Retain the measured height separately so seeking back can expand it again.
        const expandedInterlude = findActiveLine(interludeTimeline, position);
        const interludeChanged = expandedInterlude !== state.expandedInterlude;
        if (momentum.value && !touching.value && !dragging.value) {
            const base = followOffset.value + layoutAdjustment.value;
            const next = stepMomentum(manualOffset.value, coast.value.velocity,
                frame.timestamp - coast.value.lastTime, -base, state.geometry.maxOffset - base);
            manualOffset.value = next.offset;
            coast.value = { velocity: next.velocity, lastTime: frame.timestamp };
            if (next.finished) {
                momentum.value = false;
                lastInteraction.value = frame.timestamp;
            }
        }
        let geometryChanged = false;
        if (frame.timestamp - state.lastMeasure >= 250) {
            const probe = measure(densityProbe);
            const size = measure(viewport);
            // SpotifyPlus measures/sends gestures in px, but styles use dp.
            if (probe && probe.width > 0) density.value = probe.width / 100;
            if (size && size.height > 0) {
                viewportHeight.value = size.height / density.value;
                viewportWidth.value = size.width / density.value;
            }
            measurementTick.value += 1;
            state.lastMeasure = frame.timestamp;
        }
        if (viewportHeight.value > 0 && (Math.abs(viewportHeight.value - state.geometry.viewportHeight) > 0.5
            || state.measurementVersion !== measurementVersion.value || interludeChanged)) {
            const oldLayout = state.geometry;
            const nextLayout = buildScrollLayout(heights.value, viewportHeight.value, interludes, expandedInterlude);
            const collapsingInterlude = interludeChanged && state.expandedInterlude >= 0;
            if (state.initialized && (suspended.value || collapsingInterlude)) {
                const offset = followOffset.value + manualOffset.value + layoutAdjustment.value;
                const anchor = suspended.value ? firstLineAtOffset(oldLayout, offset) : state.focusIndex;
                // Keep the visible row fixed as estimates become measured
                // wrapped-text heights. A separate correction preserves inertia.
                layoutAdjustment.value += nextLayout.tops[anchor] - oldLayout.tops[anchor];
            }
            layout.value = nextLayout;
            state.geometry = nextLayout;
            maxOffset.value = nextLayout.maxOffset;
            state.measurementVersion = measurementVersion.value;
            state.expandedInterlude = expandedInterlude;
            geometryChanged = true;
        }

        const geometry = state.geometry;
        if (geometry.viewportHeight <= 0 || timeline.length === 0) {
            return;
        }
        const activeIndex = findActiveLine(timeline, position);
        const previousIndex = state.activeIndex;
        const activeChanged = activeIndex >= 0 && activeIndex !== previousIndex;
        const playbackDelta = position - state.lastPlayback;
        const seeking = state.lastPlayback >= 0 && (
            playbackDelta < -80 || playbackDelta > Math.max(250, frameDelta + 250)
        );
        if (seekRequest.value.version !== state.seekVersion) {
            state.forceIndex = seekRequest.value.index;
            state.seekVersion = seekRequest.value.version;
        }
        const force = state.forceIndex >= 0;
        let focusIndex = force ? state.forceIndex : activeIndex >= 0 ? activeIndex : state.focusIndex;
        if (!force && activeIndex < 0 && (!state.initialized || seeking)) {
            // Opening/seek during a gap keeps the closest preceding lyric in view.
            for (let index = 0; index < timeline.length; index += 1) {
                if (timeline[index].start > position) break;
                focusIndex = timeline[index].index;
            }
        }
        const browseOffset = manualOffset.value + layoutAdjustment.value;
        const currentOffset = followOffset.value + browseOffset;
        const shouldUpdate = !state.initialized || force || activeChanged || seeking
            || (geometryChanged && !suspended.value);

        if (shouldUpdate && canFollowLine(
            geometry, previousIndex, activeIndex, currentOffset, suspended.value,
            touching.value, dragging.value, momentum.value,
            frame.timestamp - lastInteraction.value, force,
        )) {
            const targetOffset = lineScrollOffset(geometry, focusIndex);
            const distance = Math.abs(targetOffset - currentOffset);
            const snap = !state.initialized || reducedMotion || distance > geometry.viewportHeight * 1.5;
            const previousStart = timeline.find(range => range.index === state.focusIndex)?.start;
            const nextStart = timeline.find(range => range.index === focusIndex)?.start;
            const interval = previousStart == null || nextStart == null ? 800 : Math.abs(nextStart - previousStart);
            const duration = scrollDuration(interval, seeking || force, interludes[focusIndex]);
            const targetFollow = targetOffset - browseOffset;
            // Measuring an incoming row below the focus does not change the
            // scroll target. Keep the existing row motion running in that case.
            if (!state.initialized || force || activeChanged || seeking
                || Math.abs(targetFollow - command.value.offset) > 0.5) {
                command.value = {
                    version: command.value.version + 1, offset: targetFollow,
                    activeIndex: focusIndex,
                    firstVisibleIndex: firstLineAtOffset(geometry, Math.min(currentOffset, targetOffset)),
                    snap, stagger: activeChanged && !seeking && !force && !geometryChanged,
                    duration,
                    startedAt: frame.timestamp,
                };
                followOffset.value = snap ? targetFollow : animateScroll(targetFollow, duration);
            }
            suspended.value = false;
            state.initialized = true;
            state.focusIndex = focusIndex;
            state.forceIndex = -1;
        }

        if (!dragging.value && !momentum.value && suspended.value) {
            const base = followOffset.value + layoutAdjustment.value;
            manualOffset.value = clamp(base + manualOffset.value, 0, geometry.maxOffset) - base;
        }
        const offset = followOffset.value + manualOffset.value + layoutAdjustment.value;
        let destination = suspended.value ? offset : command.value.offset + manualOffset.value + layoutAdjustment.value;
        if (!suspended.value && !touching.value) {
            const upcoming = nextLineRange(timeline, position);
            if (upcoming && upcoming.start - position < 700) {
                // Mount/measure the next window before its transition, instead
                // of compiling new syllable worklets while the rows are moving.
                destination = Math.max(destination, lineScrollOffset(geometry, upcoming.index));
            }
        }
        const safeFirst = firstLineAtOffset(geometry, Math.min(offset, destination) - geometry.viewportHeight * 0.2);
        const safeLast = firstLineAtOffset(geometry, Math.max(offset, destination) + geometry.viewportHeight * 1.2);
        if (safeFirst < state.first || safeLast > state.last) {
            const neededWindow = renderWindow(geometry, offset, destination);
            state.first = neededWindow.first;
            state.last = neededWindow.last;
            runOnJS(updateWindow)(neededWindow.first, neededWindow.last);
        }
        state.activeIndex = activeIndex;
        state.lastPlayback = position;
    }, [coast, command, controller, density, dragging, followOffset, heights, interludes, interludeTimeline,
        lastInteraction, layout, layoutAdjustment, manualOffset, maxOffset, measurementTick,
        measurementVersion, momentum, playbackMs, reducedMotion, seekRequest,
        suspended, timeline, touching, updateWindow, viewportHeight, viewportWidth]);
    useFrameCallback(onFrame);

    // The leading rows and finger drag/fling translate one parent. Only delayed
    // rows animate a relative correction, avoiding a native update for every row.
    const canvasStyle = useAnimatedStyle(useCallback(() => {
        'worklet';
        return {
            height: maxOffset.value + viewportHeight.value,
        };
    }, [maxOffset, viewportHeight]));
    const canvasProps = useAnimatedProps(useCallback(() => {
        'worklet';
        return { motionControl: {
            command: command.value,
            browseOffset: manualOffset.value + layoutAdjustment.value,
            pauseFollow: touching.value,
            pauseEffects: touching.value || momentum.value,
            suspended: suspended.value,
        } };
    }, [command, layoutAdjustment, manualOffset, momentum, suspended, touching]));

    const pan = useMemo(() => Gesture.Pan()
        .activeOffsetY([-10, 10])
        .cancelsTouchesInView(true)
        .onBegin(event => {
            'worklet';
            touching.value = true;
            cancelAnimation(manualOffset);
            cancelAnimation(followOffset);
            momentum.value = false;
            dragStart.value = manualOffset.value;
            touchMotion.value = {
                startY: event.absoluteY, lastY: event.absoluteY,
                lastTime: getTimestamp(), velocity: 0,
            };
        })
        .onStart(() => {
            'worklet';
            dragging.value = true;
            suspended.value = true;
        })
        .onUpdate(event => {
            'worklet';
            const now = getTimestamp();
            const motion = touchMotion.value;
            const delta = now - motion.lastTime;
            if (delta > 0) {
                const velocity = (event.absoluteY - motion.lastY) * 1000 / (delta * density.value);
                motion.velocity = motion.velocity * 0.25 + velocity * 0.75;
            }
            const base = followOffset.value + layoutAdjustment.value;
            const offset = base + dragStart.value - (event.absoluteY - motion.startY) / density.value;
            manualOffset.value = clamp(offset, 0, maxOffset.value) - base;
            motion.lastY = event.absoluteY;
            motion.lastTime = now;
            touchMotion.value = motion;
            lastInteraction.value = now;
        })
        .onEnd((_event, success) => {
            'worklet';
            dragging.value = false;
            lastInteraction.value = getTimestamp();
            // Native velocity is relative to the translated row. Estimate in
            // screen coordinates, and discard a fling after holding still.
            const velocity = getTimestamp() - touchMotion.value.lastTime > 100 ? 0 : -touchMotion.value.velocity;
            if (success && Math.abs(velocity) > 20) {
                coast.value = { velocity: clamp(velocity, -4000, 4000), lastTime: getTimestamp() };
                momentum.value = true;
            }
        })
        .onFinalize(() => {
            'worklet';
            touching.value = false;
            dragging.value = false;
            lastInteraction.value = getTimestamp();
            // Browsing keeps the interrupted follow animation frozen. Restarting
            // it here adds unwanted motion on top of the user's fling.
            if (!suspended.value) followOffset.value = animateScroll(command.value.offset, command.value.duration);
        }), [coast, command, density, dragStart, dragging, followOffset, lastInteraction, maxOffset,
            layoutAdjustment, manualOffset, momentum, suspended, touching, touchMotion]);

    const seekToLine = useCallback((index: number, startMs: number) => {
        if (dragging.value || momentum.value) return;
        SpotifyPlus.Player.seek(startMs);
        seekRequest.value = { index, version: seekRequest.value.version + 1 };
    }, [dragging, momentum, seekRequest]);

    return (
        <GestureDetector gesture={pan}>
            <Animated.View ref={viewport} style={styles.viewport}>
                <View ref={densityProbe} pointerEvents="none" style={styles.densityProbe} />
                <LyricCanvas style={[styles.canvas, canvasStyle]} animatedProps={canvasProps}>
                    {lyrics.Content.slice(window.first, window.last + 1).map((item, relativeIndex) => {
                        const index = window.first + relativeIndex;
                        return (
                            <ScrollingLine key={index} item={item} index={index} playbackMs={playbackMs}
                                layout={layout} heights={heights} measurementVersion={measurementVersion}
                                measurementTick={measurementTick} density={density}
                                viewportWidth={viewportWidth} viewportHeight={viewportHeight}
                                range={timeline.find(range => range.index === index)!}
                                pan={pan} onSeek={seekToLine} />
                        );
                    })}
                </LyricCanvas>
            </Animated.View>
        </GestureDetector>
    );
};

type RowProps = {
    item: LyricItem; index: number; playbackMs: SharedValue<number>;
    range: LineRange;
    layout: SharedValue<ScrollLayout>; heights: SharedValue<number[]>;
    measurementVersion: SharedValue<number>; measurementTick: SharedValue<number>;
    density: SharedValue<number>;
    viewportWidth: SharedValue<number>; viewportHeight: SharedValue<number>;
    pan: ReturnType<typeof Gesture.Pan>;
    onSeek: (index: number, startMs: number) => void;
};

const ScrollingLine = React.memo(({ item, index, range, playbackMs, layout, heights,
    measurementVersion, measurementTick, density, pan, viewportWidth, onSeek }: RowProps) => {
    const row = useRef<View | null>(null);
    const measured = useSharedValue({ width: -1, height: 0, stable: false });
    const geometryProps = useAnimatedProps(() => {
        'worklet';
        const geometry = layout.value;
        return { rowGeometry: [geometry.tops[index] ?? 0, geometry.heights[index]] as const };
    });
    useAnimatedReaction(() => {
        'worklet';
        // Two stable measurements, then stop until the viewport width changes.
        return measured.value.stable && measured.value.width === viewportWidth.value ? -1 : measurementTick.value;
    }, (tick, previousTick) => {
        'worklet';
        if (tick < 0 || tick === previousTick || viewportWidth.value <= 0) return;
        const size = measure(row);
        if (!size || size.height <= 0) return;
        const height = size.height / density.value;
        measured.value = {
            width: viewportWidth.value, height,
            stable: measured.value.width === viewportWidth.value && Math.abs(measured.value.height - height) <= 0.5,
        };
        if (Math.abs(height - heights.value[index]) > 0.5) {
            const next = heights.value.slice();
            next[index] = height;
            heights.value = next;
            measurementVersion.value += 1;
        }
    });
    return (
        // Native pressed styles avoid a React state update on touch-down, which
        // would recreate the native gesture registration halfway through a drag.
        <GestureDetector gesture={pan}>
            <LyricRow ref={row} rowIndex={index} animatedProps={geometryProps}
                style={[styles.row, item.Type === 'Interlude' && styles.interlude]}
                {...(item.Type === 'Interlude' ? {} : nativePressStyle)}
                onPress={item.Type === 'Interlude' ? undefined :
                    () => onSeek(index, ('StartTime' in item ? item.StartTime : item.Lead.StartTime) * 1000)}>
                {item.Type === 'Interlude' ? (
                    <InterludeView metadata={item} playbackMs={playbackMs} />
                ) : (
                    <View
                        style={[styles.lyricsLine,
                            'StartTime' in item && (item.OppositeAligned ? styles.oppositeAlignedLine : styles.defaultAlignedLine)]}
                    >
                        {'StartTime' in item ? (
                            <LineView line={item} playbackMs={playbackMs} style={lyricContentStyle} />
                        ) : (
                            <SyllableVocalLine metadata={item} playbackMs={playbackMs} style={lyricContentStyle} />
                        )}
                    </View>
                )}
            </LyricRow>
        </GestureDetector>
    );
});

const styles = StyleSheet.create({
    viewport: { flex: 1, position: 'relative', overflow: 'hidden', elevation: 10 },
    densityProbe: { position: 'absolute', top: 0, left: 0, width: 100, height: 0 },
    canvas: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'visible' },
    row: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'visible', borderRadius: 22 },
    interlude: { minHeight: 70 },
    lyricsLine: { flexDirection: 'column', padding: 6, borderRadius: 22 },
    defaultAlignedLine: { paddingLeft: 25, paddingRight: 35 },
    oppositeAlignedLine: { paddingRight: 25, paddingLeft: 35, alignItems: 'flex-end' },
});

export default ScrollingLyrics;
