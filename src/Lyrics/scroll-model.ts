import { ScrollSpring } from './scroll-spring';
export const LYRIC_GAP = 42;
export const ESTIMATED_LINE_HEIGHT = 96;
export const ALIGN_POSITION = 0.25;
export const TOP_PADDING = 24;
export const FOLLOW_RESUME_MS = 500;
export const INTERLUDE_EXIT_MS = 750;
export const INTERLUDE_HEIGHT = 48;
export const INTERLUDE_GAP = 24;

export type LineRange = {
    index: number;
    start: number;
    end: number;
    previousEnd: number
};

export type ScrollLayout = {
    tops: number[];
    heights: number[];
    viewportHeight: number;
    maxOffset: number;
    transition?: {
        startedAt: number;
        delays: number[];
        snap: boolean
    }
};

export type ScrollCommand = {
    version: number;
    offset: number;
    activeIndex: number;
    firstVisibleIndex: number;
    snap: boolean;
    stagger: boolean;
    spring: ScrollSpring;
    rowDelays: number[];
    startedAt: number;
};

export function rowPlaybackPosition(positionMs: number, startMs: number, endMs: number): number {
    'worklet';

    return positionMs < startMs ? startMs - 1 : Math.min(positionMs, endMs + 1500);
}

export function buildScrollLayout(heights: number[], viewportHeight: number, interludes: boolean[] = [], expandedInterlude = -1): ScrollLayout {
    'worklet';

    const tops: number[] = [];
    const layoutHeights: number[] = [];

    let top = TOP_PADDING;
    let occupied = false;
    let previousInterlude = false;

    for (let index = 0; index < heights.length; index += 1) {
        const height = interludes[index] && index !== expandedInterlude ? 0 : heights[index];
        layoutHeights.push(height);

        if (height > 0 && occupied) top += interludes[index] || previousInterlude ? INTERLUDE_GAP : LYRIC_GAP;
        tops.push(top);
        top += height;

        if (height > 0) {
            occupied = true;
            previousInterlude = !!interludes[index];
        }
    }

    return {
        tops,
        heights: layoutHeights,
        viewportHeight,
        maxOffset: Math.max(0, top + viewportHeight * (1 - ALIGN_POSITION) - viewportHeight),
    };
}

export function findActiveLine(ranges: LineRange[], positionMs: number): number {
    'worklet';

    let low = 0;
    let high = ranges.length;

    while (low < high) {
        const middle = (low + high) >>> 1;

        if (ranges[middle].start <= positionMs) low = middle + 1;
        else high = middle;
    }

    for (let index = low - 1; index >= 0; index -= 1) {
        if (positionMs < ranges[index].end) return ranges[index].index;
        if (ranges[index].previousEnd <= positionMs) break;
    }

    return -1;
}

export function nextLineRange(ranges: LineRange[], positionMs: number): LineRange | undefined {
    'worklet';

    let low = 0;
    let high = ranges.length;

    while (low < high) {
        const middle = (low + high) >>> 1;

        if (ranges[middle].start <= positionMs) low = middle + 1;
        else high = middle;
    }

    return ranges[low];
}

export function isLineVisible(layout: ScrollLayout, index: number, offset: number): boolean {
    'worklet';

    if (index < 0 || index >= layout.tops.length || layout.heights[index] <= 0) return false;

    const y = layout.tops[index] - offset;
    return y < layout.viewportHeight && y + layout.heights[index] > 0;
}

export function canFollowLine(layout: ScrollLayout, previousIndex: number, nextIndex: number, offset: number, suspended: boolean, touching: boolean, dragging: boolean, momentum: boolean, idleMs: number, force: boolean): boolean {
    'worklet';

    if (touching || dragging || momentum) return false;
    if (force || !suspended) return true;

    return idleMs >= FOLLOW_RESUME_MS && (
        isLineVisible(layout, previousIndex, offset) || isLineVisible(layout, nextIndex, offset)
    );
}

export function lineScrollOffset(layout: ScrollLayout, index: number): number {
    'worklet';

    return Math.max(0, Math.min(layout.maxOffset, (layout.tops[index] ?? 0) - layout.viewportHeight * ALIGN_POSITION));
}

export function firstLineAtOffset(layout: ScrollLayout, offset: number): number {
    'worklet';

    let low = 0;
    let high = layout.tops.length;

    while (low < high) {
        const middle = (low + high) >>> 1;
        if (layout.tops[middle] + layout.heights[middle] <= offset) low = middle + 1;
        else high = middle;
    }

    low = Math.min(low, Math.max(0, layout.tops.length - 1));

    while (low + 1 < layout.tops.length && layout.heights[low] <= 0) {
        low += 1
    }

    return low;
}

export function renderWindow(layout: ScrollLayout, offset: number, destination: number): { first: number; last: number } {
    'worklet';

    const height = layout.viewportHeight;
    const first = firstLineAtOffset(layout, Math.min(offset, destination) - height);
    const last = firstLineAtOffset(layout, Math.max(offset, destination) + height * 2);

    return {
        first,
        last: Math.min(layout.tops.length - 1, Math.max(first + 3, last))
    };
}

export function stepMomentum(offset: number, velocity: number, deltaMs: number, min: number, max: number) {
    'worklet';

    const decay = Math.exp(-Math.max(0, deltaMs) / 250);
    const next = offset + velocity * 0.25 * (1 - decay);
    const bounded = Math.max(min, Math.min(max, next));
    const nextVelocity = velocity * decay;
    const finished = Math.abs(nextVelocity) < 8 || bounded !== next;

    return {
        offset: bounded,
        velocity: finished ? 0 : nextVelocity,
        finished
    };
}

export function lineStaggerDelay(index: number, firstVisible: number, activeIndex = firstVisible): number {
    'worklet';

    if (index <= firstVisible) return 0;

    let delay = 0;
    let step = 50;

    for (let row = firstVisible; row < index; row += 1) {
        delay += step;

        if (row >= activeIndex) {
            step /= 1.05
        };
    }

    return delay;
}

export function buildStaggerDelays(layout: ScrollLayout, offset: number, activeIndex: number): number[] {
    'worklet';

    let delay = 0, step = 50;
    return layout.heights.map((height, index) => {
        const scheduled = delay;

        if (height > 0 && layout.tops[index] + height >= offset) {
            delay += step;

            if (index >= activeIndex) {
                step /= 1.05
            };
        }

        return scheduled;
    });
}