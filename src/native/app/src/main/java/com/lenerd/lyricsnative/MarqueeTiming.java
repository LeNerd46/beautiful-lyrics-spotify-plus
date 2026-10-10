package com.lenerd.lyricsnative;

final class MarqueeTiming {
    static double offset(double elapsedMs, double distance, double pixelsPerSecond, double pauseMs) {
        if (distance <= 0 || pixelsPerSecond <= 0) return 0;
        double travelMs = distance / pixelsPerSecond * 1000;
        double phase = Math.max(0, elapsedMs) % (pauseMs + travelMs);
        return phase <= pauseMs ? 0 : (phase - pauseMs) / 1000 * pixelsPerSecond;
    }
}
