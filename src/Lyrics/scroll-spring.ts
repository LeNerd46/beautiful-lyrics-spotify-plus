export type ScrollSpring = {
    mass: number;
    stiffness: number;
    damping: number
};

export type SpringMotion = ScrollSpring & {
    from: number;
    to: number;
    velocity: number;
    start: number
};

export function scrollSpring(intervalMs: number | undefined, seeking: boolean, interlude: boolean): ScrollSpring {
    'worklet';

    if (seeking || interlude || intervalMs == null) {
        return {
            mass: 0.9,
            stiffness: 90,
            damping: 15
        };
    }

    const ratio = (1 - (Math.min(800, Math.max(100, intervalMs)) - 100) / 700) ** 0.2;
    const stiffness = 170 + ratio * 50;

    return {
        mass: 0.9,
        stiffness,
        damping: Math.sqrt(stiffness) * 2.2
    };
}

export function springPosition(motion: SpringMotion, timestamp: number): number {
    'worklet';

    const t = Math.max(0, (timestamp - motion.start) / 1000);
    const delta = motion.to - motion.from;
    const w = Math.sqrt(motion.stiffness / motion.mass);

    if (motion.damping >= 2 * Math.sqrt(motion.stiffness * motion.mass)) {
        return motion.to - (delta + t * (w * delta - motion.velocity)) * Math.exp(-w * t);
    }

    const a = motion.damping / (2 * motion.mass);
    const b = Math.sqrt(4 * motion.mass * motion.stiffness - motion.damping ** 2) / (2 * motion.mass);
    const leftover = (a * delta - motion.velocity) / b;

    return motion.to - (Math.cos(b * t) * delta + Math.sin(b * t) * leftover) * Math.exp(-a * t);
}

export function springVelocity(motion: SpringMotion, timestamp: number): number {
    'worklet';

    const t = Math.max(0, (timestamp - motion.start) / 1000);
    const delta = motion.to - motion.from;
    const w = Math.sqrt(motion.stiffness / motion.mass);

    if (motion.damping >= 2 * Math.sqrt(motion.stiffness * motion.mass)) {
        return (motion.velocity + w * t * (w * delta - motion.velocity)) * Math.exp(-w * t);
    }

    const a = motion.damping / (2 * motion.mass);
    const b = Math.sqrt(4 * motion.mass * motion.stiffness - motion.damping ** 2) / (2 * motion.mass);
    const leftover = (a * delta - motion.velocity) / b;

    return ((a * delta - b * leftover) * Math.cos(b * t) + (b * delta + a * leftover) * Math.sin(b * t)) * Math.exp(-a * t);
}
