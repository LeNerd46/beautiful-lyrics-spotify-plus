import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'spotifyplus/react';
import Animated, { FrameInfo, SharedValue, cancelAnimation, clamp, getTimestamp, measure, runOnJS, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue, } from 'spotifyplus/react/Animated';
import { Gesture, GestureDetector } from 'spotifyplus/react/Gesture';
import { SpotifyPlus } from 'spotifyplus';
import { LineSyncedLyrics, SyllableSyncedLyrics } from '../Types/lyrics-types';
import LineView from '../Entities/line';
import SyllableVocalLine from '../Entities/syllable-vocals';
import InterludeView from '../Entities/interlude';
import { AnimationStyle } from '../Entities/animation-style';
import { LyricCanvas, LyricRow } from '../Components/lyric-motion';
import { ESTIMATED_LINE_HEIGHT, INTERLUDE_EXIT_MS, INTERLUDE_HEIGHT, LineRange, ScrollCommand, ScrollLayout, buildScrollLayout, buildStaggerDelays, canFollowLine, findActiveLine, firstLineAtOffset, lineScrollOffset, lineStaggerDelay, nextLineRange, renderWindow, stepMomentum, } from './scroll-model';
import { scrollSpring, springPosition, springVelocity } from './scroll-spring';
import { LyricsInteractionProps, LyricsViewport } from '../Components/player-chrome';
import { lyricTapAction, revealsEarlierLyrics } from '../Components/player-model';

type SyncedLyrics = LineSyncedLyrics | SyllableSyncedLyrics;
type LyricItem = SyncedLyrics['Content'][number];
type Props = LyricsInteractionProps & { lyrics: SyncedLyrics; playbackMs: SharedValue<number>; animationStyle: AnimationStyle };
const lyricContentStyle = { paddingVertical: 2 };

function getTimeline(content: SyncedLyrics['Content'], interludesOnly = false): LineRange[] {
    const ranges = content.map((item, index) => {
        const vocals = item.Type === 'Vocal' && 'Lead' in item ? [item.Lead, ...(item.Background ?? [])] : [item];

        return {
            index,
            start: Math.min(...vocals.map(vocal => vocal.StartTime)) * 1000,
            end: Math.max(...vocals.map(vocal => vocal.EndTime)) * 1000 + (interludesOnly ? INTERLUDE_EXIT_MS : 0),
            previousEnd: -1,
        };
    }).filter(range => !interludesOnly || content[range.index].Type === 'Interlude').sort((a, b) => a.start - b.start || a.index - b.index);

    let previousEnd = -1;
    for (const range of ranges) {
        range.previousEnd = previousEnd;
        previousEnd = Math.max(previousEnd, range.end);
    }

    return ranges;
}

const ScrollingLyrics = ({ lyrics, playbackMs, animationStyle, controlsShown, controlsOpacity, controlsHeight, onRevealControls, onInteractionStart, onInteractionEnd, onSeekInteraction }: Props) => {
    const timeline = useMemo(() => getTimeline(lyrics.Content), [lyrics]);
    const interludes = useMemo(() => lyrics.Content.map(item => item.Type === 'Interlude'), [lyrics]);
    const interludeAlignments = useMemo(() => {
        const alignments = new Array<boolean>(lyrics.Content.length).fill(false);
        let nextOppositeAligned = false;

        for (let index = lyrics.Content.length - 1; index >= 0; index -= 1) {
            const item = lyrics.Content[index];

            if (item.Type === 'Vocal') nextOppositeAligned = item.OppositeAligned;
            else alignments[index] = nextOppositeAligned;
        }

        return alignments;
    }, [lyrics]);

    const interludeTimeline = useMemo(() => getTimeline(lyrics.Content, true), [lyrics]);
    const reducedMotion = useReducedMotion();

    const viewport = useRef<View | null>(null);
    const densityProbe = useRef<View | null>(null);

    const density = useSharedValue(1);
    const viewportHeight = useSharedValue(0);
    const viewportWidth = useSharedValue(0);
    const heights = useSharedValue<number[]>(lyrics.Content.map(item => item.Type === 'Interlude' ? INTERLUDE_HEIGHT : ESTIMATED_LINE_HEIGHT));
    const measurementVersion = useSharedValue(0);
    const measurementTick = useSharedValue(0);
    const layout = useSharedValue<ScrollLayout>(buildScrollLayout(heights.value, 0, interludes));

    const followOffset = useSharedValue(0);
    const manualOffset = useSharedValue(0);
    const maxOffset = useSharedValue(0);
    const layoutAdjustment = useSharedValue(0);

    const touching = useSharedValue(false);
    const interactionHeld = useSharedValue(false);
    const revealedDuringDrag = useSharedValue(false);
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
        snap: true, stagger: false, spring: scrollSpring(undefined, false, false), rowDelays: [], startedAt: 0,
    });

    const controller = useMemo(() => ({
        initialized: false,
        activeIndex: -1,
        focusIndex: 0,
        lastPlayback: -1,
        expandedInterlude: -1,
        lastFrame: -1,
        lastMeasure: -1,
        measurementVersion: -1,
        seekVersion: 0,
        forceIndex: -1,
        first: 0,
        last: 3,
        geometry: buildScrollLayout(lyrics.Content.map(item => item.Type === 'Interlude' ? INTERLUDE_HEIGHT : ESTIMATED_LINE_HEIGHT), 0, interludes),
        followPaused: false,
        motion: {
            from: 0,
            to: 0,
            start: 0,
            velocity: 0,
            ...scrollSpring(undefined, false, false)
        }
    }), []);

    const [window, setWindow] = useState({ first: 0, last: 3 });

    useEffect(() => () => {
        if (interactionHeld.value) {
            interactionHeld.value = false;
            onInteractionEnd();
        }
    }, [interactionHeld, onInteractionEnd]);

    const updateWindow = useCallback((first: number, last: number) => {
        setWindow(current => current.first === first && current.last === last ? current : { first, last });
    }, []);

    const onFrame = useCallback((frame: FrameInfo) => {
        'worklet';

        const state = controller;
        if (state.lastFrame === frame.timestamp) return;

        const frameDelta = state.lastFrame < 0 ? 0 : frame.timestamp - state.lastFrame;
        state.lastFrame = frame.timestamp;

        const followPaused = touching.value || suspended.value;
        if (!followPaused) {
            if (state.followPaused) {
                state.motion = {
                    from: followOffset.value,
                    to: command.value.offset, velocity: 0,
                    start: frame.timestamp,
                    ...command.value.spring
                };
            }

            followOffset.value = springPosition(state.motion, frame.timestamp);
        }

        state.followPaused = followPaused;
        const position = playbackMs.value;
        const expandedInterlude = findActiveLine(interludeTimeline, position);
        const interludeChanged = expandedInterlude !== state.expandedInterlude;

        if (momentum.value && !touching.value && !dragging.value) {
            const base = followOffset.value + layoutAdjustment.value;
            const next = stepMomentum(manualOffset.value, coast.value.velocity, frame.timestamp - coast.value.lastTime, -base, state.geometry.maxOffset - base);

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

            if (probe && probe.width > 0) density.value = probe.width / 100;
            if (size && size.height > 0) {
                viewportHeight.value = size.height / density.value;
                viewportWidth.value = size.width / density.value;
            }

            measurementTick.value += 1;
            state.lastMeasure = frame.timestamp;
        }

        if (viewportHeight.value > 0 && (Math.abs(viewportHeight.value - state.geometry.viewportHeight) > 0.5 || state.measurementVersion !== measurementVersion.value || interludeChanged)) {
            const oldLayout = state.geometry;
            const nextLayout = buildScrollLayout(heights.value, viewportHeight.value, interludes, expandedInterlude);

            if (state.initialized && suspended.value) {
                const offset = followOffset.value + manualOffset.value + layoutAdjustment.value;
                const anchor = firstLineAtOffset(oldLayout, offset);
                layoutAdjustment.value += nextLayout.tops[anchor] - oldLayout.tops[anchor];
            }

            if (interludeChanged) {
                const interludeIndex = expandedInterlude >= 0 ? expandedInterlude : state.expandedInterlude;

                nextLayout.transition = {
                    startedAt: frame.timestamp,
                    delays: nextLayout.tops.map((_, index) => lineStaggerDelay(index, interludeIndex + 1)),
                    snap: !state.initialized || reducedMotion || suspended.value || touching.value,
                };
            } else {
                nextLayout.transition = oldLayout.transition;
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
            for (let index = 0; index < timeline.length; index += 1) {
                if (timeline[index].start > position) break;
                focusIndex = timeline[index].index;
            }
        }

        const browseOffset = manualOffset.value + layoutAdjustment.value;
        const currentOffset = followOffset.value + browseOffset;
        const interludeInPlace = state.initialized && activeIndex >= 0 && interludes[activeIndex] && !force && !seeking;
        const shouldUpdate = !interludeInPlace && (!state.initialized || force || activeChanged || seeking || (geometryChanged && !suspended.value));

        if (shouldUpdate && canFollowLine(geometry, previousIndex, activeIndex, currentOffset, suspended.value, touching.value, dragging.value, momentum.value, frame.timestamp - lastInteraction.value, force,)) {
            const targetOffset = lineScrollOffset(geometry, focusIndex);
            const distance = Math.abs(targetOffset - currentOffset);
            const snap = !state.initialized || reducedMotion || distance > geometry.viewportHeight * 1.5;
            const previousStart = timeline.find(range => range.index === focusIndex - 1)?.start;
            const nextStart = timeline.find(range => range.index === focusIndex)?.start;
            const interval = previousStart == null || nextStart == null ? undefined : Math.abs(nextStart - previousStart);
            const spring = scrollSpring(interval, seeking || force, interludes[focusIndex]);
            const targetFollow = targetOffset - browseOffset;

            if (!state.initialized || force || activeChanged || seeking || Math.abs(targetFollow - command.value.offset) > 0.5) {
                command.value = {
                    version: command.value.version + 1,
                    offset: targetFollow,
                    activeIndex: focusIndex,
                    firstVisibleIndex: firstLineAtOffset(geometry, targetOffset),
                    snap, stagger: activeChanged && !seeking && !force && !geometryChanged,
                    spring, rowDelays: buildStaggerDelays(geometry, targetOffset, focusIndex),
                    startedAt: frame.timestamp,
                };

                state.motion = {
                    from: snap ? targetFollow : followOffset.value,
                    to: targetFollow,
                    velocity: snap || state.followPaused ? 0 : springVelocity(state.motion, frame.timestamp),
                    start: frame.timestamp, ...spring
                };

                if (snap) {
                    followOffset.value = targetFollow;
                }
            }

            suspended.value = false;
            state.followPaused = false;
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
    }, [coast, command, controller, density, dragging, followOffset, heights, interludes, interludeTimeline, lastInteraction, layout, layoutAdjustment, manualOffset, maxOffset, measurementTick, measurementVersion, momentum, playbackMs, reducedMotion, seekRequest, suspended, timeline, touching, updateWindow, viewportHeight, viewportWidth]);

    useFrameCallback(onFrame);

    const canvasStyle = useAnimatedStyle(useCallback(() => {
        'worklet';

        return {
            height: maxOffset.value + viewportHeight.value,
        };
    }, [maxOffset, viewportHeight]));

    const canvasProps = useAnimatedProps(useCallback(() => {
        'worklet';

        return {
            motionControl: {
                command: command.value,
                browseOffset: manualOffset.value + layoutAdjustment.value,
                pauseFollow: touching.value,
                pauseEffects: touching.value || momentum.value,
                suspended: suspended.value,
            }
        };
    }, [command, layoutAdjustment, manualOffset, momentum, suspended, touching]));

    const maskProps = useAnimatedProps(() => {
        'worklet';

        return { controlsMask: [controlsOpacity.value, controlsHeight.value] as const };
    });

    const pan = useMemo(() => Gesture.Pan().activeOffsetY([-10, 10]).cancelsTouchesInView(true).onBegin(event => {
        'worklet';

        if (!interactionHeld.value) {
            interactionHeld.value = true;
            revealedDuringDrag.value = false;

            runOnJS(onInteractionStart)();
        }

        touching.value = true;
        cancelAnimation(manualOffset);
        cancelAnimation(followOffset);

        momentum.value = false;
        dragStart.value = manualOffset.value;
        touchMotion.value = {
            startY: event.absoluteY,
            lastY: event.absoluteY,
            lastTime: getTimestamp(), velocity: 0,
        };
    }).onStart(() => {
        'worklet';

        dragging.value = true;
        suspended.value = true;
    }).onUpdate(event => {
        'worklet';

        const now = getTimestamp();
        const motion = touchMotion.value;

        if (!revealedDuringDrag.value && revealsEarlierLyrics((event.absoluteY - motion.startY) / density.value)) {
            revealedDuringDrag.value = true;
            runOnJS(onRevealControls)();
        }

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
    }).onEnd((_event, success) => {
        'worklet';

        dragging.value = false;
        lastInteraction.value = getTimestamp();
        const velocity = getTimestamp() - touchMotion.value.lastTime > 100 ? 0 : -touchMotion.value.velocity;

        if (success && Math.abs(velocity) > 20) {
            coast.value = { velocity: clamp(velocity, -4000, 4000), lastTime: getTimestamp() };
            momentum.value = true;
        }
    }).onFinalize(() => {
        'worklet';

        if (interactionHeld.value) {
            interactionHeld.value = false;

            runOnJS(onInteractionEnd)();
        }

        touching.value = false;
        dragging.value = false;
        lastInteraction.value = getTimestamp();
    }), [coast, command, density, dragStart, dragging, followOffset, lastInteraction, maxOffset, layoutAdjustment, manualOffset, momentum, suspended, touching, touchMotion, interactionHeld, revealedDuringDrag, onInteractionStart, onInteractionEnd, onRevealControls]);

    const seekToLine = useCallback((index: number, startMs: number) => {
        if (dragging.value || momentum.value) return;

        SpotifyPlus.Player.seek(startMs);
        seekRequest.value = { index, version: seekRequest.value.version + 1 };

        onSeekInteraction();
    }, [dragging, momentum, seekRequest, onSeekInteraction]);

    const tap = useMemo(() => Gesture.Tap().maxDistance(10).onEnd((_event, success) => {
        'worklet';

        if (success) runOnJS(onRevealControls)();
    }), [onRevealControls]);

    const gesture = useMemo(() => Gesture.Race(pan, tap), [pan, tap]);

    return (
        <GestureDetector gesture={gesture}>
            <LyricsViewport ref={viewport} style={styles.viewport} animatedProps={maskProps}>
                <View ref={densityProbe} pointerEvents='none' style={styles.densityProbe} />

                <LyricCanvas style={[styles.canvas, canvasStyle]} animatedProps={canvasProps}>
                    {lyrics.Content.slice(window.first, window.last + 1).map((item, relativeIndex) => {
                        const index = window.first + relativeIndex;
                        return (
                            <ScrollingLine key={index} item={item} index={index} playbackMs={playbackMs} animationStyle={animationStyle}
                                interludeOppositeAligned={interludeAlignments[index]}
                                layout={layout} heights={heights} measurementVersion={measurementVersion}
                                measurementTick={measurementTick} density={density}
                                viewportWidth={viewportWidth} viewportHeight={viewportHeight}
                                range={timeline.find(range => range.index === index)!}
                                pan={pan} controlsShown={controlsShown}
                                onSeekLine={seekToLine} onRevealControls={onRevealControls} />
                        );
                    })}
                </LyricCanvas>
            </LyricsViewport>
        </GestureDetector>
    );
};

type RowProps = {
    interludeOppositeAligned: boolean;
    animationStyle: AnimationStyle;
    item: LyricItem;
    index: number;
    playbackMs: SharedValue<number>;
    range: LineRange;
    layout: SharedValue<ScrollLayout>;
    heights: SharedValue<number[]>;
    measurementVersion: SharedValue<number>;
    measurementTick: SharedValue<number>;
    density: SharedValue<number>;
    viewportWidth: SharedValue<number>;
    viewportHeight: SharedValue<number>;
    pan: ReturnType<typeof Gesture.Pan>;
    controlsShown: SharedValue<boolean>;
    onSeekLine: (index: number, startMs: number) => void;
    onRevealControls: () => void;
};

const ScrollingLine = React.memo(({ item, index, range, playbackMs, animationStyle, interludeOppositeAligned, layout, heights, measurementVersion, measurementTick, density, pan, controlsShown, onSeekLine, onRevealControls, viewportWidth }: RowProps) => {
    const row = useRef<View | null>(null);
    const pressed = useSharedValue(false);
    const pressedStyle = useAnimatedStyle(() => {
        'worklet';

        return { backgroundColor: pressed.value ? '#1AFFFFFF' : '#00FFFFFF' };
    });

    const tap = useMemo(() => Gesture.Tap().maxDistance(10).onBegin(() => {
        'worklet';

        pressed.value = item.Type !== 'Interlude';
    }).onFinalize(() => {
        'worklet';

        pressed.value = false;
    }).onEnd((event, success) => {
        'worklet';

        if (!success) return;
        const active = playbackMs.value >= range.start && playbackMs.value < range.end;

        if (lyricTapAction(controlsShown.value, active, item.Type !== 'Interlude') === 'seek') {
            runOnJS(onSeekLine)(index, range.start);
        } else {
            runOnJS(onRevealControls)();
        }
    }), [index, range, playbackMs, controlsShown, item.Type, onSeekLine, onRevealControls, pressed]);

    const gesture = useMemo(() => Gesture.Race(pan, tap), [pan, tap]);
    const measured = useSharedValue({ width: -1, height: 0, stable: false });

    useEffect(() => {
        if (!('StartTime' in item) && item.Type === 'Vocal') {
            measured.value = { width: -1, height: 0, stable: false };
        }
    }, [animationStyle, item, measured]);

    const geometryProps = useAnimatedProps(() => {
        'worklet';

        const geometry = layout.value;
        const transition = geometry.transition;

        return {
            rowGeometry: [geometry.tops[index] ?? 0,
            geometry.heights[index],
            transition?.startedAt ?? 0,
            transition?.delays[index] ?? 0,
            (transition?.snap ?? true) || item.Type === 'Interlude'] as const
        };
    });

    useAnimatedReaction(() => {
        'worklet';

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
        <GestureDetector gesture={gesture}>
            <LyricRow ref={row} rowIndex={index} animatedProps={geometryProps} style={[styles.row, pressedStyle, item.Type === 'Interlude' && styles.interlude]}>
                {item.Type === 'Interlude' ? (
                    <View style={{ width: '100%', alignItems: interludeOppositeAligned ? 'flex-end' : 'flex-start' }}>
                        <InterludeView metadata={item} playbackMs={playbackMs} oppositeAligned={interludeOppositeAligned} />
                    </View>
                ) : (
                    <View style={[styles.lyricsLine, 'StartTime' in item && (item.OppositeAligned ? styles.oppositeAlignedLine : styles.defaultAlignedLine)]} >
                        {'StartTime' in item ? (
                            <LineView line={item} playbackMs={playbackMs} style={lyricContentStyle} />
                        ) : (
                            <SyllableVocalLine metadata={item} playbackMs={playbackMs} animationStyle={animationStyle} style={lyricContentStyle} />
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
    interlude: { minHeight: INTERLUDE_HEIGHT },
    lyricsLine: { flexDirection: 'column', padding: 6, borderRadius: 22 },
    defaultAlignedLine: { paddingLeft: 25, paddingRight: 35 },
    oppositeAlignedLine: { paddingRight: 25, paddingLeft: 35, alignItems: 'flex-end' },
});

export default ScrollingLyrics;