import React, { useEffect } from 'react';
import { View } from 'spotifyplus/react';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'spotifyplus/react/Animated';

const LINE_WIDTHS = ['88%', '64%', '95%', '72%', '52%', '81%'] as const;

export default function LyricsSkeleton() {
    const progress = useSharedValue(0);
    const reducedMotion = useReducedMotion();

    useEffect(() => {
        progress.value = 0;

        if (!reducedMotion) {
            progress.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.linear }), -1, false);
        }

        return () => cancelAnimation(progress);
    }, [progress, reducedMotion]);

    const shimmer = useAnimatedStyle(() => {
        'worklet';
        return { left: `${-35 + progress.value * 170}%` };
    });

    return <View accessibilityLabel="Loading lyrics" pointerEvents="none" style={{ overflow: 'hidden' }}>
        {LINE_WIDTHS.map((width, index) => <View key={index} style={{ width, height: 28, borderRadius: 6, marginVertical: 14, backgroundColor: '#22FFFFFF', overflow: 'hidden' }}>
            {!reducedMotion && <Animated.View style={[{
                position: 'absolute', top: 0, bottom: 0, width: '30%', flexDirection: 'row',
            }, shimmer]}>
                <View style={{ flex: 1, backgroundColor: '#0CFFFFFF' }} />
                <View style={{ flex: 2, backgroundColor: '#20FFFFFF' }} />
                <View style={{ flex: 1, backgroundColor: '#0CFFFFFF' }} />
            </Animated.View>}
        </View>)}
    </View>;
}
