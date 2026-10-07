import Animated from 'spotifyplus/react/Animated';
import { MotionTrack } from '../Entities/native-motion';
import {
    ColorValue,
    CommonViewProps,
    createNativeComponent,
} from 'spotifyplus/react';

export type GradientTextDirection =
    | 'leftToRight'
    | 'rightToLeft'
    | 'topToBottom'
    | 'bottomToTop';

export interface GradientTextProps extends CommonViewProps {
    text: string;
    textSizeSp: number;
    textAlign?: 'left' | 'center' | 'right';
    textColor?: ColorValue;
    gradientColors: readonly ColorValue[];
    gradientDirection?: GradientTextDirection;
    gradientTransitionWidth?: number;
    progress?: number;
    glowRadius?: number;
    glowOpacity?: number;
    motionTrack?: MotionTrack;
    /** Batch visual changes so each glyph crosses the native boundary once per frame. */
    lyricMotion?: readonly [progress: number, glowRadius: number, glowOpacity: number,
        translateY?: number, scale?: number, opacity?: number];
}

const NativeGradientText = createNativeComponent<GradientTextProps>(
    'GradientText',
);

const GradientText = Animated.createAnimatedComponent(NativeGradientText);

export default GradientText;
