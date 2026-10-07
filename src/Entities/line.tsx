import React, { useMemo } from 'react';
import { CommonViewProps, View } from 'spotifyplus/react';
import { SharedValue } from 'spotifyplus/react/Animated';
import { LineVocal } from '../Types/lyrics-types';
import { createWorkletSpring, updateWorkletSpring } from './spring';
import { sampleMotion } from './native-motion';
import { LyricsFontFamily } from '../theme/fonts';
import GradientText from '../Components/gradient-text';

interface Props extends CommonViewProps { line: LineVocal; playbackMs: SharedValue<number> }

const LineView = ({ line, style }: Props) => {
    const motionTrack = useMemo(() => {
        const durationMs = Math.max(1, (line.EndTime - line.StartTime) * 1000);
        const glow = createWorkletSpring(0);
        const track = sampleMotion(line.StartTime * 1000, durationMs + 1500, (elapsed, index) => {
            const progress = Math.min(1, elapsed * 1000 / durationMs);
            const target = progress < 0.15 ? progress / 0.15 : progress < 0.6 ? 1 : (1 - progress) / 0.4;
            if (index > 0) updateWorkletSpring(glow, target, 0.5, 1, 1 / 120, progress > 0 && progress < 1);
            const magnitude = Math.abs(glow.position);
            return [progress, 8 * magnitude, Math.min(1, magnitude * 0.35), 0, 1, progress >= 1 ? 0.6 : 1];
        });
        return { ...track, beforeOpacity: 1 / 3 };
    }, [line]);
    return (
        <View style={[{ position: 'relative', alignSelf: 'flex-start' }, style]}>
            <GradientText motionTrack={motionTrack} text={line.Text} textSizeSp={36}
                textColor="#ffffff" textAlign={line.OppositeAligned ? 'right' : 'left'}
                gradientColors={['#ffffffff', '#78ffffff']} gradientDirection="topToBottom"
                gradientTransitionWidth={0.3} style={{ fontFamily: LyricsFontFamily }} />
        </View>
    );
};
export default React.memo(LineView);
