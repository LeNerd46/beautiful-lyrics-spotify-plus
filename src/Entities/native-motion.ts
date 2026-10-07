import { createWorkletSpring, updateWorkletSpring } from './spring';

// Curves/physics are prepared on the script thread. Android only interpolates
// two adjacent samples and applies visual properties at the display's cadence.
export type MotionSample = readonly [progress: number, radius: number, glow: number,
    y: number, scale: number, opacity: number];
export type MotionTrack = { startMs: number; stepMs: number; samples: string; hideAfterMs?: number; beforeOpacity?: number };
export const SAMPLE_STEP_MS = 1000 / 120;

export function sampleMotion(startMs: number, durationMs: number,
    sample: (elapsedSeconds: number, index: number) => MotionSample): MotionTrack {
    const count = Math.ceil(Math.max(0, durationMs) / SAMPLE_STEP_MS) + 1;
    const data = new Float32Array(count * 6);
    for (let index = 0; index < count; index += 1) data.set(sample(index / 120, index), index * 6);
    // Binary samples avoid parsing thousands of JSON numbers on the UI thread.
    const bytes = Buffer.allocUnsafe(data.byteLength);
    for (let index = 0; index < data.length; index += 1) bytes.writeFloatLE(data[index], index * 4);
    return { startMs, stepMs: SAMPLE_STEP_MS, samples: bytes.toString('base64') };
}

export function springSamples(durationMs: number,
    targets: (elapsedSeconds: number) => readonly [number, number, number],
    render: (elapsedSeconds: number, scale: number, y: number, glow: number) => MotionSample): MotionTrack {
    const initial = targets(0);
    const scale = createWorkletSpring(initial[0]);
    const y = createWorkletSpring(initial[1]);
    const glow = createWorkletSpring(initial[2]);
    return sampleMotion(0, durationMs, (elapsed, index) => {
        const target = targets(elapsed);
        if (index > 0) {
            updateWorkletSpring(scale, target[0], 0.6, 0.7, 1 / 120, elapsed * 1000 < durationMs - 1500);
            updateWorkletSpring(y, target[1], 0.4, 1.25, 1 / 120, elapsed * 1000 < durationMs - 1500);
            updateWorkletSpring(glow, target[2], 0.5, 1, 1 / 120, elapsed * 1000 < durationMs - 1500);
        }
        return render(elapsed, scale.position, y.position, glow.position);
    });
}

export function sampleAt(track: MotionTrack, positionMs: number): MotionSample {
    const bytes = Buffer.from(track.samples, 'base64');
    const count = bytes.length / 24;
    const cursor = Math.max(0, Math.min(count - 1, (positionMs - track.startMs) / track.stepMs));
    const index = Math.floor(cursor);
    const next = Math.min(count - 1, index + 1);
    const values = Array.from({ length: 6 }, (_, channel) => {
        const first = bytes.readFloatLE((index * 6 + channel) * 4);
        return first + (bytes.readFloatLE((next * 6 + channel) * 4) - first) * (cursor - index);
    });
    if (positionMs < track.startMs) values[5] = track.beforeOpacity ?? 1;
    if (positionMs > (track.hideAfterMs ?? Infinity)) values[5] = 0;
    return values as unknown as MotionSample;
}
