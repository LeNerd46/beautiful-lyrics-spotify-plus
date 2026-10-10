import Animated from 'spotifyplus/react/Animated';
import { CommonViewProps, createNativeComponent } from 'spotifyplus/react';
import { MotionTrack } from '../Entities/native-motion';
import { ScrollCommand } from '../Lyrics/scroll-model';

export const LyricMotion = createNativeComponent<CommonViewProps & {
    motionTrack?: MotionTrack; opacityRange?: readonly [number, number]; glowElevation?: boolean;
}>('LyricMotion');

export const LyricRow = Animated.createAnimatedComponent(createNativeComponent<CommonViewProps & {
    rowIndex: number;
    rowGeometry?: readonly [top: number, height: number, layoutStartedAt: number, layoutDelay: number, snapLayout: boolean];
}>('LyricRow'));

export const LyricCanvas = Animated.createAnimatedComponent(createNativeComponent<CommonViewProps & {
    motionControl?: { command: ScrollCommand; browseOffset: number; pauseFollow: boolean;
        pauseEffects: boolean; suspended: boolean };
}>('LyricCanvas'));
