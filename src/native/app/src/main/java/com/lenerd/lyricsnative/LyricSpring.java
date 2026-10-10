package com.lenerd.lyricsnative;

/** AMLL's analytic vertical spring. Times are absolute ms, velocity is dp/s. */
final class LyricSpring {
    double from, to, start, velocity;
    double mass = 0.9, stiffness = 90, damping = 15;
    boolean queued;
    double queuedTo, queuedStart, queuedStiffness, queuedDamping;

    void snap(double value, double timestamp) {
        from = to = value; velocity = 0; start = timestamp; queued = false;
    }

    void copyFrom(LyricSpring other) {
        from = other.from; to = other.to; start = other.start; velocity = other.velocity;
        stiffness = other.stiffness; damping = other.damping; queued = false;
    }

    void retarget(double target, double timestamp, double delay, double nextStiffness, double nextDamping) {
        activate(timestamp);
        if (delay > 0) {
            queued = true; queuedTo = target; queuedStart = timestamp + delay;
            queuedStiffness = nextStiffness; queuedDamping = nextDamping;
            return;
        }
        double position = at(timestamp), speed = velocityAt(timestamp);
        queued = false;
        from = position; velocity = speed; to = target; start = timestamp;
        stiffness = nextStiffness; damping = nextDamping;
    }

    private void activate(double timestamp) {
        if (!queued || timestamp < queuedStart) return;
        queued = false;
        double position = at(queuedStart), speed = velocityAt(queuedStart);
        from = position; velocity = speed; to = queuedTo; start = queuedStart;
        stiffness = queuedStiffness; damping = queuedDamping;
    }

    double at(double timestamp) {
        activate(timestamp);
        double t = Math.max(0, (timestamp - start) / 1000), delta = to - from;
        double w = Math.sqrt(stiffness / mass);
        if (damping >= 2 * Math.sqrt(stiffness * mass)) {
            return to - (delta + t * (w * delta - velocity)) * Math.exp(-w * t);
        }
        double a = damping / (2 * mass), b = Math.sqrt(4 * mass * stiffness - damping * damping) / (2 * mass);
        double leftover = (a * delta - velocity) / b;
        return to - (Math.cos(b * t) * delta + Math.sin(b * t) * leftover) * Math.exp(-a * t);
    }

    double velocityAt(double timestamp) {
        activate(timestamp);
        double t = Math.max(0, (timestamp - start) / 1000), delta = to - from;
        double w = Math.sqrt(stiffness / mass);
        if (damping >= 2 * Math.sqrt(stiffness * mass)) {
            return (velocity + w * t * (w * delta - velocity)) * Math.exp(-w * t);
        }
        double a = damping / (2 * mass), b = Math.sqrt(4 * mass * stiffness - damping * damping) / (2 * mass);
        double leftover = (a * delta - velocity) / b;
        return ((a * delta - b * leftover) * Math.cos(b * t)
            + (b * delta + a * leftover) * Math.sin(b * t)) * Math.exp(-a * t);
    }

    boolean arrived(double timestamp) {
        double position = at(timestamp), speed = velocityAt(timestamp);
        double acceleration = (-stiffness * (position - to) - damping * speed) / mass;
        return !queued && Math.abs(to - position) < 0.01 && Math.abs(speed) < 0.01 && Math.abs(acceleration) < 0.01;
    }
}
