package com.lenerd.lyricsnative;

import org.junit.Test;
import static org.junit.Assert.*;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

public class LyricMotionTest {
    @Test public void staggerAndSkippedFramesKeepTheScheduledWave() {
        assertEquals(0, LyricTween.delay(25, 25), 0);
        assertEquals(36, LyricTween.delay(26, 25), 0);
        assertEquals(36 + 36 / 1.05, LyricTween.delay(27, 25), 0.00001);
        assertEquals(140, LyricTween.delay(250, 25), 0);
        LyricTween first = new LyricTween(), next = new LyricTween();
        first.set(0, 100, 1000, 430); next.set(0, 100, 1036, 430);
        assertTrue(first.at(1120) > next.at(1120));
        assertEquals(100, next.at(2000), 0);
        assertEquals(0, next.at(1020), 0);
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
}
