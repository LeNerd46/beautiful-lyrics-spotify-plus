package com.lenerd.lyricsnative;

import org.junit.Test;
import static org.junit.Assert.*;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

public class LyricMotionTest {
    @Test public void staggerAndSkippedFramesKeepTheScheduledWave() {
        LyricSpring first = new LyricSpring(), next = new LyricSpring();
        first.snap(0, 1000); next.snap(0, 1000);
        first.retarget(100, 1000, 0, 200, Math.sqrt(200) * 2.2);
        next.retarget(100, 1000, 50, 200, Math.sqrt(200) * 2.2);
        assertTrue(first.at(1120) > next.at(1120));
        assertEquals(100, next.at(3000), 0.00001);
        assertEquals(0, next.at(1020), 0);
    }
    @Test public void rapidRetargetPreservesVelocityAndDelayedRowsContinueTheirPreviousMotion() {
        LyricSpring spring = new LyricSpring();
        spring.snap(0, 1000);
        spring.retarget(180, 1000, 0, 200, Math.sqrt(200) * 2.2);
        double position = spring.at(1200), velocity = spring.velocityAt(1200);
        spring.retarget(350, 1200, 0, 220, Math.sqrt(220) * 2.2);
        assertEquals(position, spring.at(1200), 0.0000001);
        assertEquals(velocity, spring.velocityAt(1200), 0.0000001);
        LyricSpring delayed = new LyricSpring();
        delayed.copyFrom(spring);
        delayed.retarget(500, 1250, 100, 170, Math.sqrt(170) * 2.2);
        assertEquals(spring.at(1300), delayed.at(1300), 0.0000001);
        assertEquals(spring.at(1350), delayed.at(1350), 0.0000001);
        assertEquals(spring.velocityAt(1350), delayed.velocityAt(1350), 0.0000001);
        // A skipped frame activates the queued spring at its scheduled instant.
        LyricSpring skipped = new LyricSpring();
        skipped.copyFrom(spring);
        skipped.retarget(500, 1250, 100, 170, Math.sqrt(170) * 2.2);
        assertEquals(delayed.at(1500), skipped.at(1500), 0.0000001);
        assertEquals(500, delayed.at(4000), 0.000001);
        assertTrue(delayed.arrived(4000));
    }
    @Test public void slowSeekSpringMatchesAMLLAndCanOvershootGently() {
        LyricSpring spring = new LyricSpring();
        spring.snap(0, 1000);
        spring.retarget(100, 1000, 0, 90, 15);
        assertEquals(28.612389022425447, spring.at(1100), 0.000001);
        assertTrue(spring.at(1600) > 100);
        assertEquals(100, spring.at(4000), 0.000001);
    }
    @Test public void normalSpringMatchesUpstreamTrajectory() {
        LyricSpring spring = new LyricSpring();
        spring.snap(0, 1000);
        spring.retarget(100, 1000, 0, 214.70564803289906, 32.23624259244914);
        double[] times = {16, 100, 200, 400, 600, 1000};
        double[] upstream = {2.594209266219366, 45.69712218984344, 81.37689340305407,
            98.51110071981492, 99.90300899051647, 99.99967776455888};
        for (int i = 0; i < times.length; i++) assertEquals(upstream[i], spring.at(1000 + times[i]), 0.000000001);
    }
    @Test public void packedMotionIsFrameIndependentAndHandlesSeekAndIdle() {
        ByteBuffer bytes = ByteBuffer.allocate(48).order(ByteOrder.LITTLE_ENDIAN);
        for (float v : new float[] {0, 0, 0, -2, 1, 1, 1, 8, 0.35f, 2, 1.05f, 0.6f}) bytes.putFloat(v);
        MotionTrack track = new MotionTrack();
        track.load(bytes.array(), 1000, 100, 1200, 1f / 3);
        assertTrue(track.sample(900)); assertEquals(1f / 3, track.value[5], 0.00001);
        assertFalse(track.sample(950));
        assertTrue(track.sample(1050)); assertEquals(0.5f, track.value[0], 0.00001);
        assertEquals(0, track.value[3], 0.00001);
        assertTrue(track.sample(5000)); assertEquals(0, track.value[5], 0);
        assertTrue(track.sample(1025)); assertEquals(0.25f, track.value[0], 0.00001);
        assertTrue(track.sample(1100)); assertFalse(track.sample(1150));
    }
    @Test public void interludeLayoutSpringExpandsAndCollapsesContinuouslyUnderPlaybackFollowing() {
        LyricSpring layout = new LyricSpring(), follow = new LyricSpring();
        layout.snap(156, 1000); follow.snap(30, 1000);
        layout.retarget(210, 1000, 0, 90, 15);
        assertEquals(126, layout.at(1000) - follow.at(1000), 0.000001);
        assertTrue(layout.at(1200) - follow.at(1200) > 126);
        assertEquals(30, follow.at(4000), 0);
        double visibleBefore = layout.at(1500) - follow.at(1500);
        layout.retarget(156, 1500, 0, 90, 15);
        follow.retarget(100, 1500, 0, 170, Math.sqrt(170) * 2.2);
        assertEquals(visibleBefore, layout.at(1500) - follow.at(1500), 0.000001);
        assertEquals(56, layout.at(4500) - follow.at(4500), 0.000001);
    }
}
