export const CONTROLS_IDLE_MS = 4000;
export const CONTROLS_FADE_MS = 240;

interface ControlsClock {
    setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
    clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

export class ControlsVisibility {
    private visible: boolean;
    private holds = 0;
    private timer: ReturnType<typeof setTimeout> | undefined;

    constructor(private paused: boolean, private changed: (visible: boolean) => void,
        private clock: ControlsClock = { setTimeout, clearTimeout }) {
        this.visible = paused;
    }

    reveal() {
        if (!this.visible) { this.visible = true; this.changed(true); }
        this.schedule();
    }

    setPaused(paused: boolean) {
        this.paused = paused;
        if (paused) this.reveal(); else this.schedule();
    }

    hold() {
        this.holds += 1; this.cancel();
    }

    release() {
        this.holds = Math.max(0, this.holds - 1); this.schedule();
    }

    interact() {
        if (this.visible) this.reveal();
    }

    dispose() {
        this.cancel();
    }

    private cancel() {
        if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
        this.timer = undefined;
    }

    private schedule() {
        this.cancel();

        if (!this.visible || this.paused || this.holds > 0) return;

        this.timer = this.clock.setTimeout(() => {
            this.timer = undefined;
            if (this.paused || this.holds > 0) return;
            this.visible = false;
            this.changed(false);
        }, CONTROLS_IDLE_MS);
    }
}

export function formatPlaybackTime(ms: number): string {
    'worklet';

    const seconds = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function lyricTapAction(controlsVisible: boolean, active: boolean, vocal: boolean): 'seek' | 'reveal' {
    'worklet';
    return vocal && (controlsVisible || active) ? 'seek' : 'reveal';
}

export function revealsEarlierLyrics(fingerTravelDp: number): boolean {
    'worklet';
    return fingerTravelDp > 14;
}
