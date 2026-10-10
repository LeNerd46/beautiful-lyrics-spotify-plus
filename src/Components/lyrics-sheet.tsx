import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View } from 'spotifyplus/react';
import Animated, { cancelAnimation, measure, runOnJS, useAnimatedProps, useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue, withSpring, withTiming } from 'spotifyplus/react/Animated';
import { Gesture, GestureDetector } from 'spotifyplus/react/Gesture';
import { SpotifyPlus } from 'spotifyplus';
import App from '../app';
import { sheetDragOffset, shouldDismissSheet } from './sheet-model';
import { LyricsWindow, LyricsSheetRoot } from './player-chrome';

export default function LyricsSheet({ onClosed }: { onClosed: () => void }) {
    const root = useRef<View | null>(null);
    const probe = useRef<View | null>(null);
    const header = useRef<View | null>(null);

    const headerHeight = useSharedValue(160);
    const height = useSharedValue(1000), density = useSharedValue(1);
    const offset = useSharedValue(1000), dragStart = useSharedValue(0), closing = useSharedValue(false);
    const pointerStart = useSharedValue(0), pointerLast = useSharedValue(0), pointerTime = useSharedValue(0);
    const dragVelocity = useSharedValue(0);

    const reducedMotion = useReducedMotion();
    const lifecycle = useMemo(() => ({ opened: false, lastMeasure: -1 }), []);
    const close = useCallback(() => {
        if (closing.value) return;

        closing.value = true;
        offset.value = withTiming(height.value, { duration: reducedMotion ? 0 : 240 }, finished => {
            'worklet';
            if (finished) runOnJS(onClosed)();
        });
    }, [closing, height, offset, reducedMotion, onClosed]);

    useEffect(() => {
        const back = (event: { activityName?: string; preventDefault(): void }) => {
            if (event.activityName && !event.activityName.endsWith('.NowPlayingActivity')) return;

            event.preventDefault();
            close();
        };

        SpotifyPlus.on('android.backPressed', back);

        return () => SpotifyPlus.off('android.backPressed', back);
    }, [close]);

    useFrameCallback(useCallback(frame => {
        'worklet';

        if (frame.timestamp - lifecycle.lastMeasure < 250) return;
        lifecycle.lastMeasure = frame.timestamp;

        const bounds = measure(root), ruler = measure(probe);
        if (!bounds || !ruler || ruler.width <= 0 || bounds.height <= 0) return;

        density.value = ruler.width / 100;
        height.value = bounds.height / density.value;

        const headerBounds = measure(header);
        if (headerBounds && headerBounds.height > 0) headerHeight.value = headerBounds.height / density.value;

        if (!lifecycle.opened) {
            lifecycle.opened = true;
            offset.value = height.value;
            offset.value = withTiming(0, { duration: reducedMotion ? 0 : 250 });
        }
    }, [density, height, offset, lifecycle, reducedMotion, headerHeight]));

    const pan = useMemo(() => Gesture.Pan().activeOffsetY([-10, 10]).cancelsTouchesInView(true).onBegin(event => {
        'worklet';
        pointerStart.value = pointerLast.value = event.absoluteY;
        pointerTime.value = 0;
        dragVelocity.value = 0;
    }).onStart(() => {
        'worklet';

        if (closing.value) return;
        cancelAnimation(offset);

        dragStart.value = offset.value;
    }).onUpdate(event => {
        'worklet';
        if (closing.value) return;

        const elapsed = event.duration ?? 0;
        const dt = elapsed - pointerTime.value;
        if (dt > 0) dragVelocity.value = dt > 100 ? 0 : dragVelocity.value * 0.65 + (event.absoluteY - pointerLast.value) / density.value * 1000 / dt * 0.35;

        pointerLast.value = event.absoluteY;
        pointerTime.value = elapsed;
        offset.value = sheetDragOffset(dragStart.value + (event.absoluteY - pointerStart.value) / density.value);
    }).onEnd((event, success) => {
        'worklet';

        const velocity = (event.duration ?? 0) - pointerTime.value > 80 ? 0 : dragVelocity.value;
        if (closing.value) return;
        if (success && shouldDismissSheet(offset.value, velocity, height.value)) {
            runOnJS(close)();
        } else {
            offset.value = withSpring(0, {
                mass: 1, stiffness: 220, damping: 26,
                velocity
            });
        }
    }).onFinalize((_event, success) => {
        'worklet';

        if (!success && !closing.value) offset.value = withSpring(0, { mass: 1, stiffness: 220, damping: 26 });
    }), [closing, offset, dragStart, density, height, close, pointerStart, pointerLast, pointerTime, dragVelocity]);

    const headerGesture = useMemo(() => Gesture.Race(pan), [pan]);
    const rootProps = useAnimatedProps(() => { 'worklet'; return { headerHeight: headerHeight.value }; });
    const sheetStyle = useAnimatedStyle(() => {
        'worklet';
        return { translateY: offset.value };
    });

    const shadeStyle = useAnimatedStyle(() => {
        'worklet';
        return { opacity: 0.22 * Math.max(0, 1 - offset.value / height.value) };
    });

    return (<GestureDetector gesture={headerGesture}>
        <LyricsSheetRoot ref={root} animatedProps={rootProps} style={{ width: '100%', height: '100%', elevation: 50 }}>
            <LyricsWindow pointerEvents="none" style={{ position: 'absolute', width: 0, height: 0 }} />

            <View ref={probe} pointerEvents="none" style={{ position: 'absolute', width: 100, height: 0 }} />
            <Animated.View pointerEvents="none" style={[{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: '#000000'
            }, shadeStyle]} />

            <Animated.View style={[{ flex: 1, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' }, sheetStyle]}>
                <App headerRef={header} />
            </Animated.View>
        </LyricsSheetRoot>
    </GestureDetector>);
}
