import { sampleMotion } from './native-motion';

export type AnimationStyle = 'beautiful' | 'apple';

export function appleFloatTrack(startSeconds: number, endSeconds: number, fontSize: number, isBackground = false) {
    const durationMs = Math.max(1000, (endSeconds - startSeconds) * 1000);
    const lift = fontSize * 0.075 * (isBackground ? 2 : 1);

    return sampleMotion(startSeconds * 1000, durationMs, elapsed => {
        const progress = Math.min(1, elapsed * 1000 / durationMs);
        const eased = cubicBezier(progress, 0, 0, 0.58, 1);

        return [0, 0, 0, -lift * eased, 1, 1];
    });
}

function cubicBezier(progress: number, x1: number, y1: number, x2: number, y2: number) {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;

    let low = 0, high = 1;
    for (let iteration = 0; iteration < 16; iteration++) {
        const t = (low + high) / 2;
        const x = 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t * t * x2 + t ** 3;

        if (x < progress) {
            low = t;
        } else {
            high = t
        };
    }

    const t = (low + high) / 2;
    return 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t * t * y2 + t ** 3;
}

export function appleEmphasisTracks(startSeconds: number, endSeconds: number, text: string, fontSize: number, isBackground = false, isLastWord = false) {
    const count = [...text].length;
    const syllableMs = Math.max(1, (endSeconds - startSeconds) * 1000);
    const baseDuration = Math.max(1000, syllableMs);
    const intensity = (value: number) => value > 1 ? Math.sqrt(value) : value ** 3;

    const amount = Math.min(1.8, Math.max(1, intensity(baseDuration / 2000) * 0.6) * (isLastWord ? 1.4 : 1));
    const blur = Math.min(0.9, Math.max(0.55, intensity(baseDuration / 3000) * 0.5) * (isLastWord ? 1.3 : 1));
    const duration = baseDuration * (isLastWord ? 1.2 : 1);

    const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

    return [...text].map((_, index) => {
        const delay = duration / 2.5 / Math.max(1, count) * index;
        const floatStart = delay - 400;
        const startMs = startSeconds * 1000 + floatStart;
        const endMs = Math.max(floatStart + duration * 1.4, delay + duration, syllableMs);

        return sampleMotion(startMs, endMs - floatStart, elapsed => {
            const time = elapsed * 1000 + floatStart;
            const phase = clamp01((time - delay) / duration);
            const swell = phase < 0.5 ? cubicBezier(phase * 2, 0.2, 0.4, 0.58, 1) : 1 - cubicBezier((phase - 0.5) * 2, 0.3, 0, 0.58, 1);
            const floatPhase = clamp01((time - floatStart) / (duration * 1.4));
            const pulse = floatPhase === 1 ? 0 : Math.sin(floatPhase * Math.PI);
            const scale = 1 + swell * 0.10 * amount;
            const y = -fontSize * (pulse * 0.09 * (isBackground ? 2 : 1) + swell * 0.045 * amount * (1 + swell * 0.12 * amount));
            const progress = clamp01(time / syllableMs * count - index);

            return [progress, Math.min(0.3, blur * 0.4) * fontSize, swell * blur, y, scale, 1];
        });
    });
}
