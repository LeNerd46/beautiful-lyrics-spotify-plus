package com.lenerd.lyricsnative;

import java.util.Base64;
import org.json.JSONObject;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

final class MotionTrack {
    private String encoded;
    private float[] samples;
    private double start, step = 1000.0 / 120, hideAfter = Double.POSITIVE_INFINITY;
    private double lastCursor = Double.NaN;
    private float beforeOpacity = 1;
    final float[] value = {0, 0, 0, 0, 1, 1};

    void configure(JSONObject props) {
        if (props == null) return;
        String next = props.optString("samples", "");
        double nextStart = props.optDouble("startMs", 0);
        if (next.equals(encoded) && nextStart == start) return;
        byte[] bytes = Base64.getDecoder().decode(next);
        load(bytes, nextStart, props.optDouble("stepMs", 1000.0 / 120),
                props.optDouble("hideAfterMs", Double.POSITIVE_INFINITY), (float) props.optDouble("beforeOpacity", 1));
        encoded = next;
    }

    void load(byte[] bytes, double startMs, double stepMs, double hideAfterMs, float beforeAlpha) {
        if (bytes.length < 24 || bytes.length % 24 != 0) return;
        samples = new float[bytes.length / 4];
        ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer().get(samples);
        start = startMs;
        step = Math.max(0.001, stepMs);
        hideAfter = hideAfterMs;
        beforeOpacity = beforeAlpha;
        lastCursor = Double.NaN;
    }

    boolean sample(double playbackMs) {
        if (samples == null) return false;
        int count = samples.length / 6;
        double cursor = Math.max(0, Math.min(count - 1, (playbackMs - start) / step));
        if (playbackMs < start) cursor = -1;
        if (playbackMs > hideAfter) cursor = count;
        if (cursor == lastCursor) return false;
        lastCursor = cursor;
        int index = Math.max(0, Math.min(count - 1, (int) cursor));
        int next = Math.min(count - 1, index + 1);
        float fraction = (float) Math.max(0, cursor - index);
        for (int channel = 0; channel < 6; channel++) {
            float first = samples[index * 6 + channel];
            value[channel] = first + (samples[next * 6 + channel] - first) * fraction;
        }
        if (playbackMs > hideAfter) value[5] = 0;
        else if (playbackMs < start) value[5] = beforeOpacity;
        return true;
    }
}
