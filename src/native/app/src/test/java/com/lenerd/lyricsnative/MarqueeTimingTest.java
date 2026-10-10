package com.lenerd.lyricsnative;

import org.junit.Test;
import static org.junit.Assert.assertEquals;

public class MarqueeTimingTest {
    @Test public void pausesThenTravelsThroughEntireTitleAndGap() {
        assertEquals(0, MarqueeTiming.offset(1400, 360, 30, 1500), 0.001);
        assertEquals(30, MarqueeTiming.offset(2500, 360, 30, 1500), 0.001);
        assertEquals(359.97, MarqueeTiming.offset(13499, 360, 30, 1500), 0.001);
    }
    @Test public void repeatsWithoutJumpAndPausesAtBeginning() {
        assertEquals(0, MarqueeTiming.offset(13500, 360, 30, 1500), 0.001);
        assertEquals(0, MarqueeTiming.offset(14500, 360, 30, 1500), 0.001);
        assertEquals(30, MarqueeTiming.offset(16000, 360, 30, 1500), 0.001);
    }
}
