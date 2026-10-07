package com.lenerd.lyricsnative;

/** Allocation-free interpolation shared by the canvas and delayed rows. */
final class LyricTween {
    double from, to, start, duration;

    void set(double from, double to, double start, double duration) {
        this.from = from; this.to = to; this.start = start; this.duration = duration;
    }

    double at(double timestamp) {
        if (duration <= 0) return to;
        double p = Math.max(0, Math.min(1, (timestamp - start) / duration));
        return from + (to - from) * (1 - (1 - p) * (1 - p));
    }

    static double delay(int index, int anchor) {
        double delay = 0, step = 36;
        for (int row = anchor; row < index && delay < 140; row++) {
            delay += step;
            step /= 1.05;
        }
        return Math.min(delay, 140);
    }
}
